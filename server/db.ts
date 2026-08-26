import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { detectionHistory, incidentEvidence, indiaHotspotSnapshot, InsertUser, sourceEvidenceCache, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { dedupeDetectionHistoryRows, summarizeLongTermPersistence, type LongTermPersistenceSummary } from "./history";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getSourceEvidenceCache(cacheKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sourceEvidenceCache).where(eq(sourceEvidenceCache.cacheKey, cacheKey)).limit(1);
  return result[0];
}

export async function saveSourceEvidenceCache(entry: {
  cacheKey: string;
  provider: string;
  payload: string;
  fetchedAt: Date;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sourceEvidenceCache).values(entry).onDuplicateKeyUpdate({
    set: {
      provider: entry.provider,
      payload: entry.payload,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    },
  });
}

export async function recordIncidentEvidence(entry: {
  detectionId: string;
  latitude: string;
  longitude: string;
  sourceType: "authority" | "facility";
  sourceName: string;
  sourceUrl: string;
  incidentReference: string;
  reportedAt: Date;
  expiresAt: Date;
  details: string;
  verifiedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The incident-evidence ledger is not available.");
  await db.insert(incidentEvidence).values(entry);
}

function isWithinTenKilometres(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= 10;
}

/** Returns only unrevoked, unexpired reports that are spatially aligned with the verified detection. */
export async function getActiveIncidentEvidence(detectionId: string, lat: number, lng: number) {
  const db = await getDb();
  if (!db) return undefined;
  const records = await db
    .select()
    .from(incidentEvidence)
    .where(and(
      eq(incidentEvidence.detectionId, detectionId),
      isNull(incidentEvidence.revokedAt),
      gte(incidentEvidence.expiresAt, new Date()),
    ))
    .orderBy(desc(incidentEvidence.reportedAt));

  return records.filter(record => isWithinTenKilometres(
    Number(record.latitude),
    Number(record.longitude),
    lat,
    lng,
  ));
}

export type DetectionHistoryInput = {
  latitude: string;
  longitude: string;
  detectionDate: string;
  brightness: string | null;
  confidence: string | null;
};

/** Stores only detections already returned by FIRMS; duplicate date/location rows are ignored. */
export async function recordDetectionHistory(rows: DetectionHistoryInput[]) {
  if (process.env.VITEST === "true") return;
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const uniqueRows = dedupeDetectionHistoryRows(rows);
  const insertRows = uniqueRows.map(row => ({
    ...row,
    detectionDate: new Date(`${row.detectionDate}T00:00:00.000Z`),
  }));
  await db.insert(detectionHistory).values(insertRows).onDuplicateKeyUpdate({
    set: { id: sql`${detectionHistory.id}` },
  });
}

/** Database-only long-term persistence summary for detections within the established 8 km local screening area. */
export async function getLongTermPersistence(lat: number, lng: number): Promise<LongTermPersistenceSummary> {
  const db = await getDb();
  if (!db) {
    return { state: "unavailable", totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 };
  }
  try {
    const latitudeDelta = 8 / 111;
    const longitudeDelta = 8 / Math.max(1, 111 * Math.cos(lat * Math.PI / 180));
    const rows = await db.select({ detectionDate: detectionHistory.detectionDate }).from(detectionHistory).where(and(
      gte(detectionHistory.latitude, (lat - latitudeDelta).toFixed(6)),
      lte(detectionHistory.latitude, (lat + latitudeDelta).toFixed(6)),
      gte(detectionHistory.longitude, (lng - longitudeDelta).toFixed(6)),
      lte(detectionHistory.longitude, (lng + longitudeDelta).toFixed(6)),
    ));
    return { state: "available", ...summarizeLongTermPersistence(rows) };
  } catch {
    return { state: "unavailable", totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 };
  }
}

export type IndiaHotspotSnapshotInput = {
  latitude: string;
  longitude: string;
  brightness: string | null;
  confidence: string | null;
  acquiredDate: string;
  acquiredTime: string | null;
};

export type IndiaHotspotSnapshotSource = "firms-country" | "firms-wfs-india-fallback";

/** Replaces the current map snapshot only inside a single successful database transaction. */
export async function replaceIndiaHotspotSnapshot(rows: IndiaHotspotSnapshotInput[], source: IndiaHotspotSnapshotSource) {
  const db = await getDb();
  if (!db) throw new Error("The India hotspot snapshot database is unavailable.");
  const fetchedAt = new Date();
  await db.transaction(async tx => {
    await tx.delete(indiaHotspotSnapshot);
    if (rows.length === 0) return;
    await tx.insert(indiaHotspotSnapshot).values(rows.map(row => ({
      ...row,
      acquiredDate: new Date(`${row.acquiredDate}T00:00:00.000Z`),
      source,
      fetchedAt,
    })));
  });
  return { fetchedAt, rowCount: rows.length };
}

/** Reads only the latest stored country-wide hotspot snapshot; it never calls FIRMS. */
export async function getIndiaHotspotSnapshot() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(indiaHotspotSnapshot).orderBy(desc(indiaHotspotSnapshot.acquiredDate), desc(indiaHotspotSnapshot.acquiredTime), desc(indiaHotspotSnapshot.id));
}
