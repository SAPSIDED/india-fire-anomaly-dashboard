/** @vitest-environment jsdom */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  markerClickHandlers: [] as Array<() => void>,
  reset: vi.fn(),
  mutate: vi.fn(),
  callbacks: undefined as undefined | { onSuccess: (response: unknown) => void },
}));

vi.mock("../client/src/components/Map", async () => {
  const ReactModule = await import("react");
  return {
    MapView: ({ onMapReady }: { onMapReady: (map: unknown) => void }) => {
      ReactModule.useEffect(() => { onMapReady(new (globalThis as any).google.maps.Map()); }, []);
      return <div aria-label="Mocked Google Map" />;
    },
  };
});

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    corroboration: {
      run: {
        useMutation: () => ({ data: undefined, isPending: false, isError: false, reset: testState.reset, mutate: testState.mutate }),
      },
    },
    incidentEvidence: { record: { useMutation: () => ({ isError: false, isPending: false, mutate: vi.fn() }) } },
    getIndiaHotspots: {
      useQuery: () => ({
        data: [{
          id: 660079,
          latitude: "32.88766",
          longitude: "71.61832",
          brightness: "336.4",
          confidence: "l",
          acquiredDate: "2026-08-26",
          acquiredTime: "0828",
          source: "firms-wfs-india-fallback",
          fetchedAt: "2026-08-27T03:00:00.000Z",
        }],
      }),
    },
  },
}));

vi.mock("../client/src/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

import Home from "../client/src/pages/Home";

class FakeMap {
  setOptions() {}
  setCenter() {}
  setZoom() {}
}

class FakeMarker {
  constructor(_options: unknown) {}
  setMap() {}
  addListener(event: string, handler: () => void) {
    if (event === "click") testState.markerClickHandlers.push(handler);
  }
}

class FakeCircle extends FakeMarker {}
class FakeInfoWindow {
  setContent() {}
  open() {}
  close() {}
}
class FakeSize { constructor(_width: number, _height: number) {} }
class FakePoint { constructor(_x: number, _y: number) {} }

const successfulResponse = {
  detectionId: "FIRMS-660079",
  firmsCurrent: { state: "available" as const, detail: "2 live NASA FIRMS NOAA-20 detections in the local 1-day window." },
  industrial: { state: "available" as const, detail: "3 live nearby OSM industrial-context features found within 5 km." },
  firmsHistory: { state: "available" as const, detail: "10 live NASA FIRMS NOAA-20 detections in the local 7-day window." },
  longTermHistory: { state: "available" as const, totalDetectionCount: 17, firstSeen: "2026-08-19", lastSeen: "2026-08-26", activeMonths: 1 },
  landCover: { landCoverClass: "bare_other", source: "Esri Sentinel-2 10m Land Use/Land Cover Time Series" },
  classification: { classification: "industrial_thermal_source", confidence: "high", reason: "Nearby industrial context and repeated observations match the rule-based industrial heat pattern." },
};

describe("Home marker verification response rendering", () => {
  beforeEach(() => {
    testState.markerClickHandlers.length = 0;
    testState.reset.mockReset();
    testState.mutate.mockReset();
    testState.callbacks = undefined;
    testState.mutate.mockImplementation((_input: unknown, callbacks: { onSuccess: (response: unknown) => void }) => { testState.callbacks = callbacks; });
    (globalThis as any).google = { maps: { Map: FakeMap, Marker: FakeMarker, Circle: FakeCircle, InfoWindow: FakeInfoWindow, Size: FakeSize, Point: FakePoint } };
  });

  it("renders the active marker's successful corroboration response in steps 01–04 and the classification callout", async () => {
    render(<Home />);

    await waitFor(() => expect(testState.markerClickHandlers.length).toBeGreaterThan(0));
    act(() => { testState.markerClickHandlers[0](); });

    await waitFor(() => expect(testState.mutate).toHaveBeenCalledWith(
      { detectionId: "FIRMS-660079", lat: 32.88766, lng: 71.61832 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    ));
    expect(screen.getByText("Verifying selected hotspot…")).toBeTruthy();
    expect(screen.getByText("LIVE CHECK IN PROGRESS")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Live source verification in progress");
    expect(screen.getByLabelText("Selected anomaly analysis").getAttribute("aria-busy")).toBe("true");

    act(() => { testState.callbacks?.onSuccess(successfulResponse); });
    expect(await screen.findByText("Industrial Thermal Source")).toBeTruthy();
    expect(screen.getByText("HIGH CONFIDENCE.", { exact: false })).toBeTruthy();
    expect(screen.getByText(/2 live NASA FIRMS NOAA-20 detections/)).toBeTruthy();
    expect(screen.getByText(/3 live nearby OSM industrial-context features/)).toBeTruthy();
    expect(screen.getByText(/17 stored detections; 1 active month/)).toBeTruthy();
    expect(screen.getByText(/bare other · Esri Sentinel-2 10m/)).toBeTruthy();
  });
});
