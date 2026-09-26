export type ConclusionRuleClassification =
  | "industrial_thermal_source"
  | "likely_wildfire_vegetation"
  | "uncertain_other";

export type ConclusionAiClassification =
  | "wildfire"
  | "industrial_facility"
  | "agricultural_burning"
  | "mining";

export type ConclusionRuleBasedResult = {
  classification: ConclusionRuleClassification;
  confidence: "low" | "medium" | "high";
  reason: string;
  namedFacilityMatch?: boolean;
};

export type ConclusionMlResult = {
  classification: ConclusionAiClassification;
  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
};

export type ConclusionResult = {
  verdict: string;
  state: string;
  primary: "rule_based" | "ai" | "manual_review";
  ruleBasedClassification: ConclusionRuleClassification;
  aiClassification: ConclusionAiClassification;
  aiConfidencePercent: number;
  explanation: string;
};

function ruleToAiClassification(value: ConclusionRuleClassification): ConclusionAiClassification | null {
  if (value === "industrial_thermal_source") return "industrial_facility";
  if (value === "likely_wildfire_vegetation") return "wildfire";
  return null;
}

function label(value: ConclusionRuleClassification | ConclusionAiClassification) {
  return value.replaceAll("_", " ");
}

function aiConfidence(result: ConclusionMlResult) {
  return Math.max(result.wildfireProbability, result.industrialProbability, result.agriculturalProbability, result.miningProbability) * 100;
}

/**
 * Explainable arbitration only. It does not change either classifier; it weighs
 * their already-produced outputs and states exactly why one signal was preferred.
 */
export function resolveConclusion(ruleBasedResult: ConclusionRuleBasedResult, mlResult: ConclusionMlResult): ConclusionResult {
  const aiConfidencePercent = aiConfidence(mlResult);
  const equivalentAiClass = ruleToAiClassification(ruleBasedResult.classification);

  if (equivalentAiClass && equivalentAiClass === mlResult.classification) {
    return {
      verdict: label(ruleBasedResult.classification),
      state: "Both independent signals agree.",
      primary: "rule_based",
      ruleBasedClassification: ruleBasedResult.classification,
      aiClassification: mlResult.classification,
      aiConfidencePercent,
      explanation: `The rule-based signal and AI screening signal both indicate ${label(mlResult.classification)}. The agreement is supportive, but it remains a screening assessment rather than field confirmation.`,
    };
  }

  if (ruleBasedResult.confidence === "high" && ruleBasedResult.namedFacilityMatch) {
    return {
      verdict: label(ruleBasedResult.classification),
      state: "Rule-based primary — named GIS facility evidence outweighs the differing independent screen.",
      primary: "rule_based",
      ruleBasedClassification: ruleBasedResult.classification,
      aiClassification: mlResult.classification,
      aiConfidencePercent,
      explanation: `The rule-based signal is primary because it has HIGH confidence and a named GPPD or OSM facility match. The AI predicts ${label(mlResult.classification)} instead. The AI model does not use named-facility or land-cover data by design, to remain an independent check — this disagreement does not mean either signal is wrong, it means they're using different evidence.`,
    };
  }

  if ((ruleBasedResult.confidence === "low" || ruleBasedResult.confidence === "medium") && aiConfidencePercent > 60) {
    return {
      verdict: label(mlResult.classification),
      state: "AI-led — not yet corroborated by GIS evidence.",
      primary: "ai",
      ruleBasedClassification: ruleBasedResult.classification,
      aiClassification: mlResult.classification,
      aiConfidencePercent,
      explanation: `The rule-based signal is ${ruleBasedResult.confidence} or uncertain, while the AI screening signal has ${aiConfidencePercent.toFixed(1)}% confidence. The AI result is therefore presented as the lead screening interpretation, pending stronger GIS or source-backed corroboration.`,
    };
  }

  return {
    verdict: "Conflicting signals — manual review recommended",
    state: "No signal has sufficient independent support to be selected as primary.",
    primary: "manual_review",
    ruleBasedClassification: ruleBasedResult.classification,
    aiClassification: mlResult.classification,
    aiConfidencePercent,
    explanation: `The rule-based signal is ${ruleBasedResult.confidence} confidence and the AI predicts ${label(mlResult.classification)} at ${aiConfidencePercent.toFixed(1)}%. Neither signal meets the conditions for a defensible primary conclusion, so manual review is recommended.`,
  };
}
