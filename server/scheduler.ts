import type { Request, Response } from "express";
import { getIndiaHotspotSnapshot, replaceIndiaHotspotSnapshot, type IndiaHotspotSnapshotInput, type IndiaHotspotSnapshotSource } from "./db";
import { fetchIndiaCountryFirmsSnapshot, type IndiaFirmsSnapshotFetch } from "./corroboration";
import { sdk } from "./_core/sdk";

export type IndiaHotspotRefreshResult = {
  fetchedAt: Date;
  rowCount: number;
  source: IndiaHotspotSnapshotSource;
};

let snapshotFetcher: () => Promise<IndiaFirmsSnapshotFetch> = fetchIndiaCountryFirmsSnapshot;
let snapshotReplacer: (rows: IndiaHotspotSnapshotInput[], source: IndiaHotspotSnapshotSource) => Promise<IndiaHotspotRefreshResult> = async (rows, source) => ({ ...(await replaceIndiaHotspotSnapshot(rows, source)), source });
let refreshInFlight: Promise<IndiaHotspotRefreshResult> | undefined;
let startupRefreshTriggered = false;

/** Fetches first and replaces only after a complete successful country FIRMS response. */
export function refreshIndiaHotspotSnapshot(): Promise<IndiaHotspotRefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const snapshot = await snapshotFetcher();
    return snapshotReplacer(snapshot.rows, snapshot.source);
  })().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

/** Starts the required one-time startup refresh without delaying the HTTP server from accepting requests. */
export function startIndiaHotspotSnapshotRefresh() {
  if (startupRefreshTriggered) return;
  startupRefreshTriggered = true;
  void refreshIndiaHotspotSnapshot().then(result => {
    console.info(`[IndiaHotspotSnapshot] Startup refresh stored ${result.rowCount} rows from ${result.source} at ${result.fetchedAt.toISOString()}.`);
  }).catch(error => {
    console.error("[IndiaHotspotSnapshot] Startup refresh failed; retained the previous snapshot.", error);
  });
}

/** Cron-only callback: returns 5xx on failure so the platform can retry while existing rows remain untouched. */
export async function handleIndiaHotspotRefresh(req: Request, res: Response) {
  try {
    console.info("[IndiaHotspotSnapshot] Scheduled callback received.", {
      hasCookie: Boolean(req.headers.cookie),
      hasAuthorization: Boolean(req.headers.authorization),
      headerNames: Object.keys(req.headers).sort(),
    });
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    const result = await refreshIndiaHotspotSnapshot();
    return res.json({ ok: true, rowCount: result.rowCount, source: result.source, fetchedAt: result.fetchedAt.toISOString() });
  } catch (error) {
    console.error("[IndiaHotspotSnapshot] Scheduled refresh failed; retained the previous snapshot.", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "India hotspot snapshot refresh failed.",
      context: { path: "/api/scheduled/refreshIndiaHotspots" },
      timestamp: new Date().toISOString(),
    });
  }
}

/** Read-only scheduler seam used only in deterministic tests. */
export function setIndiaHotspotRefreshDependenciesForTests(overrides?: {
  fetch?: () => Promise<IndiaFirmsSnapshotFetch>;
  replace?: (rows: IndiaHotspotSnapshotInput[], source: IndiaHotspotSnapshotSource) => Promise<IndiaHotspotRefreshResult>;
}) {
  snapshotFetcher = overrides?.fetch ?? fetchIndiaCountryFirmsSnapshot;
  snapshotReplacer = overrides?.replace ?? (async (rows, source) => ({ ...(await replaceIndiaHotspotSnapshot(rows, source)), source }));
  refreshInFlight = undefined;
  startupRefreshTriggered = false;
}

export { getIndiaHotspotSnapshot };
