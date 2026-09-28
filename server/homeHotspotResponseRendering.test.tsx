/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  markerClickHandlers: [] as Array<() => void>,
  hotspotRows: [] as Array<Record<string, unknown>>,
  weatherCalls: [] as Array<{ input: { lat: number; lng: number }; enabled: boolean }>,
  forceStaleWeather: false,
  reset: vi.fn(),
  mutate: vi.fn(),
  callbacks: undefined as undefined | { onSuccess: (response: unknown) => void },
}));

vi.mock("../client/src/components/Map", async () => {
  const ReactModule = await import("react");
  return {
    thermalMarkerColor: () => "#b86751",
    MapView: ({ onMapReady, fallbackHotspots = [], wind }: { onMapReady: (map: unknown) => void; fallbackHotspots?: Array<{ id: string; onClick?: () => void; onSelect?: () => void }>; wind?: { windSpeedKmh: number | null; windDirectionDeg: number | null } }) => {
      ReactModule.useEffect(() => { onMapReady(new (globalThis as any).google.maps.Map()); }, []);
      return <div aria-label="Mocked Google Map">{fallbackHotspots.map(hotspot => <button key={hotspot.id} type="button" aria-label={`Select ${hotspot.id}`} onClick={() => hotspot.onSelect?.()}>{`Select ${hotspot.id}`}</button>)}{wind && <output aria-label="Map wind data">{`${wind.windSpeedKmh ?? "—"} km/h / ${wind.windDirectionDeg ?? "—"}°`}</output>}<button type="button" aria-label="Run source verification" onClick={() => fallbackHotspots[0]?.onClick?.()}>Run source verification</button></div>;
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
      useQuery: () => ({ data: testState.hotspotRows }),
    },
    getLiveWeather: {
      useQuery: (input: { lat: number; lng: number }, options?: { enabled?: boolean }) => {
        const enabled = Boolean(options?.enabled);
        testState.weatherCalls.push({ input, enabled });
        const readings = [
          { lat: 25.72082, lng: 72.59474, speed: 12.7, direction: 224 },
          { lat: 20.78609, lng: 85.26402, speed: 8.9, direction: 320 },
          { lat: 28.04852, lng: 95.5482, speed: 2.1, direction: 59 },
        ];
        const reading = enabled ? (testState.forceStaleWeather ? readings[0] : readings.find(point => point.lat === input.lat)) : undefined;
        return { data: reading ? { state: "available", latitude: reading.lat, longitude: reading.lng, temperatureC: 31, windSpeedKmh: reading.speed, windDirectionDeg: reading.direction, timezone: "Asia/Kolkata", checkedAt: "2026-08-27T03:00:00.000Z" } : undefined, isFetching: enabled && testState.forceStaleWeather, isPending: enabled && !reading };
      },
    },
    getPersistentHotspotAlerts: { useQuery: () => ({ data: [], isLoading: false }) },
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
  firmsCurrent: { state: "available" as const, detail: "2 live NASA FIRMS NOAA-20 detections in the local 1-day window.", frpMw: 12.34 },
  industrial: { state: "available" as const, detail: "3 live nearby OSM industrial-context features found within 5 km." },
  firmsHistory: { state: "available" as const, detail: "10 live NASA FIRMS NOAA-20 detections in the local 7-day window." },
  longTermHistory: { state: "available" as const, totalDetectionCount: 17, firstSeen: "2026-08-19", lastSeen: "2026-08-26", activeMonths: 1 },
  landCover: { landCoverClass: "bare_other", source: "Esri Sentinel-2 10m Land Use/Land Cover Time Series" },
  classification: { classification: "industrial_thermal_source", confidence: "high", reason: "Nearby industrial context and repeated observations match the rule-based industrial heat pattern." },
  mlPrediction: { classification: "industrial_facility" as const, wildfireProbability: 0.08, industrialProbability: 0.81, agriculturalProbability: 0.06, miningProbability: 0.05 },
};

describe("Home marker verification response rendering", () => {
  beforeEach(() => {
    cleanup();
    testState.markerClickHandlers.length = 0;
    testState.hotspotRows = [{
      id: 660079,
      latitude: "32.88766",
      longitude: "71.61832",
      brightness: "336.4",
      confidence: "l",
      acquiredDate: "2026-08-26",
      acquiredTime: "0828",
      source: "firms-wfs-india-fallback",
      fetchedAt: "2026-08-27T03:00:00.000Z",
    }];
    testState.weatherCalls.length = 0;
    testState.forceStaleWeather = false;
    testState.reset.mockReset();
    testState.mutate.mockReset();
    testState.callbacks = undefined;
    testState.mutate.mockImplementation((_input: unknown, callbacks: { onSuccess: (response: unknown) => void }) => { testState.callbacks = callbacks; });
    (globalThis as any).google = { maps: { Map: FakeMap, Marker: FakeMarker, Circle: FakeCircle, InfoWindow: FakeInfoWindow, Size: FakeSize, Point: FakePoint } };
  });

  it("renders the active marker's successful corroboration response in steps 01–04 and the classification callout", async () => {
    render(<Home />);

    expect(testState.mutate).not.toHaveBeenCalled();
    act(() => { screen.getByRole("button", { name: "Run source verification" }).click(); });

    await waitFor(() => expect(testState.mutate).toHaveBeenCalledWith(
      { detectionId: "FIRMS-660079", lat: 32.88766, lng: 71.61832 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    ));
    expect(screen.getByText("Verifying selected hotspot…")).toBeTruthy();
    expect(screen.getByText("LIVE CHECK IN PROGRESS")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Live source verification in progress");
    expect(screen.getByLabelText("Selected anomaly analysis").getAttribute("aria-busy")).toBe("true");

    act(() => { testState.callbacks?.onSuccess(successfulResponse); });
    expect(screen.getByText("Live source verification in progress")).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 2_000));
    expect(await screen.findByText("Industrial Thermal Source")).toBeTruthy();
    expect(screen.getByText("HIGH CONFIDENCE.", { exact: false })).toBeTruthy();
    expect(screen.queryByText("High", { exact: true })).toBeNull();
    expect(screen.queryByText("RULE ENGINE CONFIDENCE", { exact: true })).toBeNull();
    expect(screen.getByText("FRP (MW)", { exact: true })).toBeTruthy();
    expect(screen.getByText("12.34", { exact: true })).toBeTruthy();
    expect(screen.queryByText("BRIGHTNESS (K)", { exact: true })).toBeNull();
    expect(screen.getByText(/2 live NASA FIRMS NOAA-20 detections/)).toBeTruthy();
    expect(screen.getByText(/3 live nearby OSM industrial-context features/)).toBeTruthy();
    expect(screen.getByText(/17 stored detections; 1 active month/)).toBeTruthy();
    expect(screen.getAllByText(/bare other/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Esri Sentinel-2 10m/i).length).toBeGreaterThan(0);
    expect(screen.getByText("LIVE HOTSPOTS — 1 hotspots detected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thermal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "OSM context" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Persistence" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exposure" })).toBeNull();
    expect(screen.getByText("LIVE HOTSPOTS — 1 hotspots detected")).toBeTruthy();
    expect(screen.getAllByText("Likely industrial facility").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Model confidence: 81.0%", { exact: false }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Industrial facility").length).toBeGreaterThanOrEqual(1);
  });

  it("starts idle and keeps hotspot identity, local wind, and spread vector synchronized across regions", () => {
    testState.hotspotRows = [
      { id: 44850177, latitude: "25.72082", longitude: "72.59474", brightness: "336.3", confidence: "n", acquiredDate: "2026-09-27", acquiredTime: "0826", source: "firms-country", fetchedAt: "2026-09-28T09:00:00.000Z" },
      { id: 44850175, latitude: "20.78609", longitude: "85.26402", brightness: "330.1", confidence: "n", acquiredDate: "2026-09-27", acquiredTime: "0826", source: "firms-country", fetchedAt: "2026-09-28T09:00:00.000Z" },
      { id: 44850038, latitude: "28.04852", longitude: "95.5482", brightness: "331.2", confidence: "n", acquiredDate: "2026-09-27", acquiredTime: "0646", source: "firms-country", fetchedAt: "2026-09-28T09:00:00.000Z" },
    ];
    render(<Home />);

    const conditionsSection = screen.getByRole("region", { name: "Conditions that move the risk." });
    const persistenceSection = screen.getByRole("region", { name: /PERSISTING THERMAL REGIONS/i });
    expect(conditionsSection.contains(persistenceSection)).toBe(false);
    expect(screen.getByRole("heading", { name: "PERSISTING THERMAL REGIONS" })).toBeTruthy();
    expect(persistenceSection.querySelector("h2")?.textContent).toContain("⚠️");
    expect(screen.getByText("No hotspot selected")).toBeTruthy();
    expect(screen.getByText("Select a hotspot to see local wind conditions")).toBeTruthy();
    expect(testState.weatherCalls.every(call => !call.enabled)).toBe(true);
    expect(screen.queryByLabelText("Map wind data")).toBeNull();
    expect(screen.queryByText("TEMPERATURE", { exact: true })).toBeNull();
    expect(screen.getByText(/This is an operational alert screen, not a fire-spread forecast\./)).toBeTruthy();

    const choose = (id: number) => act(() => { screen.getByRole("button", { name: `Select FIRMS-${id}` }).click(); });
    const selectedDetails = () => screen.getByLabelText("Selected hotspot details").textContent ?? "";

    choose(44850177);
    expect(selectedDetails()).toContain("FIRMS-44850177");
    expect(selectedDetails()).toContain("25.721°N · 72.595°E");
    expect(selectedDetails()).toContain("Open-Meteo · live response");
    expect(screen.getByText("12.7 km/h")).toBeTruthy();
    expect(screen.getByText("SW · from 224°")).toBeTruthy();
    expect(screen.getByText("Likely spread direction from this hotspot · NE · toward 44°")).toBeTruthy();
    expect(screen.getByLabelText("Map wind data").textContent).toBe("12.7 km/h / 224°");
    expect(testState.weatherCalls.at(-1)).toEqual({ input: { lat: 25.72082, lng: 72.59474 }, enabled: true });

    testState.forceStaleWeather = true;
    choose(44850175);
    expect(selectedDetails()).toContain("FIRMS-44850175");
    expect(selectedDetails()).toContain("20.786°N · 85.264°E");
    expect(selectedDetails()).toContain("Loading local weather…");
    expect(screen.queryByText("12.7 km/h")).toBeNull();
    expect(screen.queryByLabelText("Map wind data")).toBeNull();
    expect(screen.getByText("Direction unavailable")).toBeTruthy();
    expect(screen.getByText("Awaiting live wind")).toBeTruthy();

    testState.forceStaleWeather = false;
    choose(44850175);
    expect(screen.getByText("8.9 km/h")).toBeTruthy();
    expect(screen.getByText("NW · from 320°")).toBeTruthy();
    expect(screen.getByText("Likely spread direction from this hotspot · SE · toward 140°")).toBeTruthy();
    expect(screen.getByLabelText("Map wind data").textContent).toBe("8.9 km/h / 320°");
    expect(testState.weatherCalls.at(-1)).toEqual({ input: { lat: 20.78609, lng: 85.26402 }, enabled: true });

    choose(44850038);
    expect(selectedDetails()).toContain("FIRMS-44850038");
    expect(selectedDetails()).toContain("28.049°N · 95.548°E");
    expect(screen.getByText("2.1 km/h")).toBeTruthy();
    expect(screen.getByText("ENE · from 59°")).toBeTruthy();
    expect(screen.getByText("Likely spread direction from this hotspot · WSW · toward 239°")).toBeTruthy();
    expect(screen.getByLabelText("Map wind data").textContent).toBe("2.1 km/h / 59°");
    expect(testState.weatherCalls.at(-1)).toEqual({ input: { lat: 28.04852, lng: 95.5482 }, enabled: true });
  });
});
