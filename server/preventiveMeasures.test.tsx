/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreventiveMeasures } from "../client/src/components/PreventiveMeasures";

const expectedTypes = ["INDUSTRIAL FIRE", "WILDFIRE", "AGRICULTURAL BURNING", "MINING FIRE"];

describe("PreventiveMeasures", () => {
  it("shows all four fire types and their preventive measures at once", () => {
    render(<PreventiveMeasures classification="industrial_facility" />);
    const table = screen.getByRole("table", { name: "Preventive measures by fire type" });
    expect(within(table).getByRole("columnheader", { name: "FIRE TYPE" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "PREVENTIVE MEASURES" })).toBeTruthy();

    for (const type of expectedTypes) {
      expect(within(table).getByRole("row", { name: new RegExp(type) })).toBeTruthy();
    }
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getAllByRole("listitem").length).toBe(24);
  });

  it("keeps the complete documentation visible regardless of selected or missing classification", () => {
    cleanup();
    const { rerender } = render(<PreventiveMeasures classification={null} />);
    const expectCompleteTable = () => {
      const table = screen.getByRole("table", { name: "Preventive measures by fire type" });
      expect(within(table).getAllByRole("row")).toHaveLength(5);
      expect(within(table).queryByText(/unavailable for this classification/i)).toBeNull();
    };

    expectCompleteTable();
    rerender(<PreventiveMeasures classification="uncertain_other" />);
    expectCompleteTable();
    expect(screen.getByRole("region", { name: "PREVENTIVE MEASURES BY FIRE TYPE" })).toBeTruthy();
    cleanup();
  });
});
