import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshIndiaHotspotSnapshot, setIndiaHotspotRefreshDependenciesForTests, startIndiaHotspotSnapshotRefresh } from "./scheduler";
import type { IndiaHotspotSnapshotInput } from "./db";

const firstRows: IndiaHotspotSnapshotInput[] = [{
  latitude: "15.389280", longitude: "75.222850", brightness: "322.1", confidence: "n", acquiredDate: "2026-08-25", acquiredTime: "0738",
}];
const secondRows: IndiaHotspotSnapshotInput[] = [{
  latitude: "20.791790", longitude: "85.255560", brightness: "314.7", confidence: "h", acquiredDate: "2026-08-26", acquiredTime: "0812",
}];

afterEach(() => setIndiaHotspotRefreshDependenciesForTests());

describe("India hotspot snapshot refresh", () => {
  it("replaces the snapshot only after a successful country-wide FIRMS retrieval", async () => {
    const replace = vi.fn(async (rows, source) => ({ fetchedAt: new Date("2026-08-26T00:00:00.000Z"), rowCount: rows.length, source }));
    setIndiaHotspotRefreshDependenciesForTests({ fetch: async () => ({ rows: firstRows, source: "firms-country" }), replace });

    await expect(refreshIndiaHotspotSnapshot()).resolves.toMatchObject({ rowCount: 1 });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(firstRows, "firms-country");
  });

  it("preserves the prior database snapshot when the country FIRMS retrieval fails", async () => {
    const replace = vi.fn(async (rows, source) => ({ fetchedAt: new Date(), rowCount: rows.length, source }));
    setIndiaHotspotRefreshDependenciesForTests({ fetch: async () => { throw new Error("FIRMS unavailable"); }, replace });

    await expect(refreshIndiaHotspotSnapshot()).rejects.toThrow("FIRMS unavailable");
    expect(replace).not.toHaveBeenCalled();
  });

  it("passes the newest successful response to each consecutive refresh", async () => {
    const responses = [{ rows: firstRows, source: "firms-country" as const }, { rows: secondRows, source: "firms-wfs-india-fallback" as const }];
    const replace = vi.fn(async (rows, source) => ({ fetchedAt: new Date(), rowCount: rows.length, source }));
    setIndiaHotspotRefreshDependenciesForTests({ fetch: async () => responses.shift() ?? { rows: [], source: "firms-wfs-india-fallback" }, replace });

    await refreshIndiaHotspotSnapshot();
    await refreshIndiaHotspotSnapshot();

    expect(replace).toHaveBeenNthCalledWith(1, firstRows, "firms-country");
    expect(replace).toHaveBeenNthCalledWith(2, secondRows, "firms-wfs-india-fallback");
  });

  it("triggers a refresh immediately at startup", async () => {
    const replace = vi.fn(async (rows, source) => ({ fetchedAt: new Date(), rowCount: rows.length, source }));
    setIndiaHotspotRefreshDependenciesForTests({ fetch: async () => ({ rows: firstRows, source: "firms-country" }), replace });

    startIndiaHotspotSnapshotRefresh();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
  });
});
