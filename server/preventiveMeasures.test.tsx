/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreventiveMeasures } from "../client/src/components/PreventiveMeasures";

const supportedCases = [
  {
    classification: "industrial_facility",
    label: "INDUSTRIAL FIRE",
    measures: [
      "Conduct regular inspection and maintenance of electrical, mechanical, and process equipment.",
      "Maintain appropriate fire detection, alarm, sprinkler, and suppression systems.",
      "Strictly control the storage and handling of flammable chemicals, fuels, gases, and other combustible materials.",
      "Use hot-work permit procedures for welding, cutting, and other ignition-producing activities.",
      "Keep emergency exits, fire lanes, hydrants, and firefighting equipment accessible at all times.",
      "Conduct periodic fire drills and train workers in fire-prevention and emergency procedures.",
    ],
  },
  {
    classification: "wildfire",
    label: "WILDFIRE",
    measures: [
      "Maintain vegetation clearance and firebreaks around vulnerable infrastructure and settlements.",
      "Remove accumulated dry vegetation and other combustible fuel near high-risk areas.",
      "Restrict unnecessary open flames and outdoor burning during periods of high fire risk.",
      "Maintain roads and access routes for firefighting and emergency vehicles.",
      "Monitor high-risk forest areas during periods of extreme heat, drought, and strong winds.",
      "Maintain early-warning and fire-detection systems where available.",
    ],
  },
  {
    classification: "agricultural_burning",
    label: "AGRICULTURAL BURNING",
    measures: [
      "Prefer crop-residue management alternatives such as mulching, incorporation into soil, composting, or suitable residue-management equipment instead of open burning.",
      "Avoid burning during strong winds or other conditions that can allow flames to spread rapidly.",
      "Maintain cleared boundaries or firebreaks around areas where burning is legally permitted.",
      "Keep water, firefighting tools, and personnel available whenever controlled burning is undertaken.",
      "Monitor the burn continuously and completely extinguish it before leaving the area.",
      "Maintain agricultural machinery and electrical equipment to reduce accidental ignition.",
    ],
  },
  {
    classification: "mining",
    label: "MINING FIRE",
    measures: [
      "Monitor combustible gases, temperature, smoke, and other fire indicators in high-risk areas.",
      "Maintain effective mine ventilation and regularly inspect ventilation systems.",
      "Control the accumulation of combustible coal, dust, oil, and other materials.",
      "Regularly inspect electrical equipment, machinery, cables, and power systems for faults or overheating.",
      "Follow strict hot-work, equipment-isolation, and permit-to-work procedures.",
      "Maintain appropriate fire detection, suppression equipment, escape routes, and worker training.",
    ],
  },
] as const;

describe("PreventiveMeasures", () => {
  it("shows only the measures matching the existing four-class classification", () => {
    const { rerender } = render(<PreventiveMeasures classification={supportedCases[0].classification} />);

    for (const item of supportedCases) {
      rerender(<PreventiveMeasures classification={item.classification} />);
      const table = screen.getByRole("table", { name: "Preventive measures by fire type" });
      expect(within(table).getByRole("columnheader", { name: "FIRE TYPE" })).toBeTruthy();
      expect(within(table).getByRole("columnheader", { name: "PREVENTIVE MEASURE" })).toBeTruthy();
      const row = within(table).getByRole("row", { name: new RegExp(item.label) });
      expect(within(row).getAllByRole("listitem").map(element => element.textContent)).toEqual(item.measures);
      expect(within(table).queryByText(/Gas flare/i)).toBeNull();
    }
  });

  it("shows the unavailable state instead of guessing for missing or unsupported classifications", () => {
    cleanup();
    const { rerender } = render(<PreventiveMeasures classification={null} />);
    const expectUnavailable = () => {
      const table = screen.getByRole("table", { name: "Preventive measures by fire type" });
      expect(within(table).getByText("Preventive measures unavailable for this classification")).toBeTruthy();
      expect(within(table).queryByText(/Gas flare/i)).toBeNull();
    };

    expectUnavailable();
    rerender(<PreventiveMeasures classification="uncertain_other" />);
    expectUnavailable();
    expect(screen.getByRole("region", { name: "PREVENTIVE MEASURES BY FIRE TYPE" })).toBeTruthy();
  });
});
