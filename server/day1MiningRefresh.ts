import { eq, lt } from "drizzle-orm";
import { sourceEvidenceCache } from "../drizzle/schema";
import { getDb } from "./db";
import { evaluateCorroboration } from "./corroboration";

function parsePayload(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isMiningRelevant(payload: string) {
  const parsed = parsePayload(payload);
  if (!parsed) return false;
  const category = typeof parsed.industrialFacilityCategory === "string" ? parsed.industrialFacilityCategory.toLowerCase() : "";
  const type = typeof parsed.industrialFacilityType === "string" ? parsed.industrialFacilityType.toLowerCase() : "";
  const name = typeof parsed.industrialFacilityName === "string" ? parsed.industrialFacilityName.toLowerCase() : "";
  return category === "mining" || /mine|quarry|mining|ore|coal/.test(`${type} ${name}`);
}

function coordinateFromCacheKey(cacheKey: string) {
  const parts = cacheKey.split(":");
  const lat = Number(parts.at(-2));
  const lng = Number(parts.at(-1));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function refreshStaleMiningOsmEvidence() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const now = new Date();
  const stale = await db.select({ cacheKey: sourceEvidenceCache.cacheKey, payload: sourceEvidenceCache.payload, expiresAt: sourceEvidenceCache.expiresAt }).from(sourceEvidenceCache).where(eq(sourceEvidenceCache.provider, "osm-overpass"));
  const relevant = stale.filter(row => row.expiresAt.getTime() < now.getTime() && isMiningRelevant(row.payload)).map(row => ({ ...row, coordinate: coordinateFromCacheKey(row.cacheKey) })).filter(row => row.coordinate !== null);
  const refreshed: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];
  for (const [index, row] of Array.from(relevant.entries())) {
    const coordinate = row.coordinate as { lat: number; lng: number };
    try {
      const result = await evaluateCorroboration({ lat: coordinate.lat, lng: coordinate.lng, detectionId: `day1-mining-refresh-${index}-${coordinate.lat.toFixed(5)}-${coordinate.lng.toFixed(5)}` });
      const industrial = result.industrial;
      const mining = industrial.industrialFacilityCategory === "mining" || /mine|quarry|mining|ore|coal/i.test(`${industrial.industrialFacilityType ?? ""} ${industrial.industrialFacilityName ?? ""}`);
      const finding = { cacheKey: row.cacheKey, latitude: coordinate.lat, longitude: coordinate.lng, state: industrial.state, provider: industrial.provider, category: industrial.industrialFacilityCategory, type: industrial.industrialFacilityType, name: industrial.industrialFacilityName, distanceM: industrial.industrialFacilityDistanceM, mining };
      (mining ? refreshed : unresolved).push(finding);
    } catch (error) {
      unresolved.push({ cacheKey: row.cacheKey, latitude: coordinate.lat, longitude: coordinate.lng, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { oldStaleOsmCount: stale.filter(row => row.expiresAt.getTime() < now.getTime()).length, staleMiningRelevantCount: relevant.length, refreshedMiningCandidates: refreshed, unresolved };
}

if (process.argv[1]?.endsWith("day1MiningRefresh.ts")) {
  refreshStaleMiningOsmEvidence().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
