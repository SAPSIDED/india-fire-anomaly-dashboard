import { describe, expect, it } from "vitest";
import { resolveConclusion, type ConclusionMlResult, type ConclusionRuleBasedResult } from "./conclusion";

const ai = (classification: ConclusionMlResult["classification"], confidence: number): ConclusionMlResult => ({
  classification,
  wildfireProbability: classification === "wildfire" ? confidence : (1 - confidence) / 3,
  industrialProbability: classification === "industrial_facility" ? confidence : (1 - confidence) / 3,
  agriculturalProbability: classification === "agricultural_burning" ? confidence : (1 - confidence) / 3,
  miningProbability: classification === "mining" ? confidence : (1 - confidence) / 3,
});

const rule = (classification: ConclusionRuleBasedResult["classification"], confidence: ConclusionRuleBasedResult["confidence"], namedFacilityMatch = false): ConclusionRuleBasedResult => ({
  classification,
  confidence,
  namedFacilityMatch,
  reason: "Test source-backed reasoning.",
});

describe("resolveConclusion", () => {
  it("returns a combined verdict when both independent signals agree", () => {
    const result = resolveConclusion(rule("likely_wildfire_vegetation", "high"), ai("wildfire", 0.82));
    expect(result.primary).toBe("rule_based");
    expect(result.verdict).toBe("likely wildfire vegetation");
    expect(result.state).toContain("Both independent signals agree");
  });

  it("keeps HIGH-confidence named-facility rule evidence primary when AI disagrees", () => {
    const result = resolveConclusion(
      rule("industrial_thermal_source", "high", true),
      ai("wildfire", 0.74),
    );
    expect(result.primary).toBe("rule_based");
    expect(result.verdict).toBe("industrial thermal source");
    expect(result.explanation).toContain("The AI predicts wildfire instead");
    expect(result.explanation).toContain("The AI model does not use named-facility or land-cover data by design");
    expect(result.explanation).toContain("this disagreement does not mean either signal is wrong");
  });

  it("uses an AI-led result when rule confidence is low and AI confidence exceeds 60%", () => {
    const result = resolveConclusion(rule("uncertain_other", "low"), ai("mining", 0.67));
    expect(result.primary).toBe("ai");
    expect(result.verdict).toBe("mining");
    expect(result.state).toBe("AI-led — not yet corroborated by GIS evidence.");
  });

  it("does not force a verdict when neither signal has strong support", () => {
    const result = resolveConclusion(rule("uncertain_other", "medium"), ai("agricultural_burning", 0.55));
    expect(result.primary).toBe("manual_review");
    expect(result.verdict).toBe("Conflicting signals — manual review recommended");
  });
});
