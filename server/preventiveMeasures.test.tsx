/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreventiveMeasures } from "../client/src/components/PreventiveMeasures";

const expectedLinks = [
  ["INDUSTRIAL FIRE", "PESO · Contact", "https://peso.gov.in/web/en/contact"],
  ["WILDFIRE", "Forest Survey of India · Forest Fire", "https://fsiforestfire.gov.in/"],
  ["AGRICULTURAL BURNING", "CPCB · Query Form", "https://cpcb.gov.in/query-form1.php"],
  ["MINING FIRE", "Ministry of Labour & Employment · Lodge Your Complaint", "https://www.labour.gov.in/en/lodge-your-complaint"],
] as const;

describe("PreventiveMeasures", () => {
  it("shows all four fire types and their preventive measures at once", () => {
    render(<PreventiveMeasures classification="industrial_facility" />);
    const table = screen.getByRole("table", { name: "Preventive measures by fire type" });
    expect(within(table).getByRole("columnheader", { name: "FIRE TYPES" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "PREVENTIVE MEASURES" })).toBeTruthy();

    for (const [type, sourceName, url] of expectedLinks) {
      const row = within(table).getByRole("row", { name: new RegExp(type) });
      expect(row).toBeTruthy();
      const measuresCell = within(row).getByRole("cell", { name: new RegExp(sourceName) });
      expect(within(measuresCell).getByRole("link", { name: `${type}: ${sourceName}` }).getAttribute("href")).toBe(url);
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
