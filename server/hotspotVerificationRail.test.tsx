/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HotspotVerificationRail, type VerificationRailResult } from "../client/src/components/HotspotVerificationRail";

const selected = { id: "FIRMS-120001", facility: "Current NASA FIRMS hotspot", place: "Current India-wide thermal observation", coords: "15.3893°N · 75.2229°E", frp: "336.4 K", confidence: "n", recency: "2026-08-25 822 UTC", score: 55 };
const result: VerificationRailResult = {
  firmsCurrent: { state: "available", detail: "1 live NASA FIRMS detection." },
  industrial: {
    state: "available", detail: "2 nearby OSM industrial-context features.", industrialFacilityName: "Example Works", industrialFacilityType: "man_made=works", industrialFacilityCategory: "refinery", industrialFacilityDistanceM: 740, industrialFacilityOsmUrl: "https://www.openstreetmap.org/way/123",
  },
  firmsHistory: { state: "available", detail: "3 seven-day FIRMS detections." },
  landCover: { landCoverClass: "built_up", source: "public land-cover source" },
  longTermHistory: { totalDetectionCount: 4, activeMonths: 2 },
  gppdReference: { name: "Example Thermal Plant", fuelType: "Coal", capacityMw: 450.5, distanceKm: 1.25, source: "WRI Global Power Plant Database v1.3.0 (CC BY 4.0)" },
  classification: { classification: "industrial_thermal_source", confidence: "high", reason: "Rule-based evidence supports recurring industrial heat." },
};

describe("HotspotVerificationRail", () => {
  it("renders a selected marker through request initiation, loading, returned evidence/classification, and retained-selection retry states", async () => {
    const onVerify = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<HotspotVerificationRail selected={selected} state="ready" onVerify={onVerify} />);

    await user.click(screen.getByRole("button", { name: /run source verification/i }));
    expect(onVerify).toHaveBeenCalledOnce();

    rerender(<HotspotVerificationRail selected={selected} state="loading" onVerify={onVerify} />);
    expect(screen.getByText(/checking current noaa-20 evidence/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /verification running/i }).hasAttribute("disabled")).toBe(true);

    rerender(<HotspotVerificationRail selected={selected} state="complete" result={result} onVerify={onVerify} />);
    expect(screen.getByText(/2 nearby OSM industrial-context features/i)).toBeTruthy();
    expect(screen.getByText(/example works · man_made=works · refinery · 740 m/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /open in openstreetmap/i }).getAttribute("href")).toBe("https://www.openstreetmap.org/way/123");
    expect(screen.getByText(/example thermal plant · coal · 450.5 mw · 1.25 km/i)).toBeTruthy();
    expect(screen.getByText(/built up · public land-cover source/i)).toBeTruthy();
    expect(screen.getByText("Industrial Thermal Source")).toBeTruthy();
    expect(screen.getByText(/high confidence/i)).toBeTruthy();

    rerender(<HotspotVerificationRail selected={selected} state="error" onVerify={onVerify} />);
    expect(screen.getByText(/no industrial-fire conclusion was issued/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /retry source verification/i }));
    expect(onVerify).toHaveBeenCalledTimes(2);
  });

  it("supports marker-triggered verification presentation at the 375 px mobile breakpoint", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    window.dispatchEvent(new Event("resize"));
    const onVerify = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<HotspotVerificationRail selected={selected} state="ready" onVerify={onVerify} />);

    await user.click(screen.getByRole("button", { name: /run source verification/i }));
    expect(onVerify).toHaveBeenCalledOnce();

    rerender(<HotspotVerificationRail selected={selected} state="complete" result={result} onVerify={onVerify} />);
    expect(screen.getByText("Industrial Thermal Source")).toBeTruthy();
    expect(screen.getByText(/public land-cover source/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /open in openstreetmap/i })).toBeTruthy();
  });

  it("does not render contextual facility cards or source links when neither optional reference is available", () => {
    const withoutFacilityContext: VerificationRailResult = {
      ...result,
      industrial: { state: "available", detail: "No nearby industrial feature." },
      gppdReference: undefined,
    };
    const { container } = render(<HotspotVerificationRail selected={selected} state="complete" result={withoutFacilityContext} onVerify={vi.fn()} />);

    expect(container.querySelector("[aria-label='Nearest facility context']")).toBeNull();
    expect(container.querySelector("a[href*='openstreetmap.org']")).toBeNull();
  });
});
