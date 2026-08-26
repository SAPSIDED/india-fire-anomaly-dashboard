export type ClassificationLabel =
  | "industrial_thermal_source"
  | "likely_wildfire_vegetation"
  | "uncertain_other";

export type ClassificationConfidence = "low" | "medium" | "high";

export type ClassificationResult = {
  classification: ClassificationLabel;
  confidence: ClassificationConfidence;
  reason: string;
};

type EvidenceState = "available" | "cached" | "unavailable";

export type ClassificationInput = {
  industrialFeatures: number;
  industrialState: EvidenceState;
  historyDailyDetections: Array<{ date: string; detections: number }>;
  historyState: EvidenceState;
};

/**
 * Pure, conservative categorisation of already-collected corroboration evidence.
 * It never requests data and deliberately treats unavailable evidence as uncertain.
 */
export function classifyCorroborationEvidence(input: ClassificationInput): ClassificationResult {
  const detectionDays = input.historyDailyDetections.filter(day => day.detections > 0).length;
  const industrialKnown = input.industrialState !== "unavailable";
  const historyKnown = input.historyState !== "unavailable";
  const confidence: ClassificationConfidence = input.industrialState === "available" && input.historyState === "available"
    ? "high"
    : industrialKnown && historyKnown
      ? "medium"
      : "low";

  if (!industrialKnown || !historyKnown) {
    return {
      classification: "uncertain_other",
      confidence: "low",
      reason: "Nearby industrial context or seven-day FIRMS history is unavailable, so the rule-based layer cannot classify the thermal pattern confidently.",
    };
  }

  if (input.industrialFeatures > 0 && detectionDays >= 4) {
    return {
      classification: "industrial_thermal_source",
      confidence,
      reason: `Nearby industrial context is present and FIRMS detections occurred on ${detectionDays} of the returned seven days, which matches a recurring industrial thermal-source pattern.`,
    };
  }

  if (input.industrialFeatures === 0 && detectionDays <= 2) {
    return {
      classification: "likely_wildfire_vegetation",
      confidence,
      reason: `No nearby industrial context was found and FIRMS detections occurred on ${detectionDays} of the returned seven days, which is more consistent with a short-lived vegetation or wildfire pattern than a recurring industrial source.`,
    };
  }

  return {
    classification: "uncertain_other",
    confidence,
    reason: `The available evidence shows ${input.industrialFeatures} nearby industrial-context feature${input.industrialFeatures === 1 ? "" : "s"} and detections on ${detectionDays} of the returned seven days, which does not meet either rule-based classification threshold.`,
  };
}
