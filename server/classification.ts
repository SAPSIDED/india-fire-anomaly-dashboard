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
  landCoverClass: string | null;
  longTermHistory: { totalDetectionCount: number; activeMonths: number } | null;
};

const builtUpClasses = new Set(["built_up", "built-up", "built up", "industrial", "urban"]);
const vegetationClasses = new Set(["cropland", "forest"]);

function classifyShortTermEvidence(input: ClassificationInput, detectionDays: number): ClassificationLabel {
  if (input.industrialFeatures > 0 && detectionDays >= 4) return "industrial_thermal_source";
  if (input.industrialFeatures === 0 && detectionDays <= 2) return "likely_wildfire_vegetation";
  return "uncertain_other";
}

function classifyEnrichedEvidence(input: ClassificationInput): ClassificationLabel {
  if (!input.landCoverClass || !input.longTermHistory) return "uncertain_other";
  const landCover = input.landCoverClass.toLowerCase();
  if (input.industrialFeatures > 0 && builtUpClasses.has(landCover) && input.longTermHistory.activeMonths >= 2) return "industrial_thermal_source";
  if (input.industrialFeatures === 0 && vegetationClasses.has(landCover) && input.longTermHistory.activeMonths <= 1) return "likely_wildfire_vegetation";
  return "uncertain_other";
}

function enrichedEvidenceDetail(input: ClassificationInput) {
  if (!input.landCoverClass || !input.longTermHistory) return "";
  return ` Land-cover is ${input.landCoverClass}; stored long-term history contains ${input.longTermHistory.totalDetectionCount} detection${input.longTermHistory.totalDetectionCount === 1 ? "" : "s"} across ${input.longTermHistory.activeMonths} active month${input.longTermHistory.activeMonths === 1 ? "" : "s"}.`;
}

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
      reason: `Nearby industrial context or seven-day FIRMS history is unavailable, so the rule-based layer cannot classify the thermal pattern confidently.${enrichedEvidenceDetail(input)}`,
    };
  }

  const shortTermClassification = classifyShortTermEvidence(input, detectionDays);
  const enrichedClassification = classifyEnrichedEvidence(input);
  const hasEnrichedEvidence = Boolean(input.landCoverClass && input.longTermHistory);
  const vegetationPersistenceConflict = Boolean(
    input.landCoverClass
      && input.longTermHistory
      && vegetationClasses.has(input.landCoverClass.toLowerCase())
      && input.longTermHistory.activeMonths <= 1,
  );

  // Preserve the Stage 1 decision exactly when either additive source is absent.
  if (!hasEnrichedEvidence) {
    if (shortTermClassification === "industrial_thermal_source") {
      return {
        classification: "industrial_thermal_source",
        confidence,
        reason: `Nearby industrial context is present and FIRMS detections occurred on ${detectionDays} of the returned seven days, which matches a recurring industrial thermal-source pattern.`,
      };
    }
    if (shortTermClassification === "likely_wildfire_vegetation") {
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

  const detail = enrichedEvidenceDetail(input);
  if (shortTermClassification === "industrial_thermal_source" && vegetationPersistenceConflict) {
    return {
      classification: "industrial_thermal_source",
      confidence: "medium",
      reason: `Seven-day FIRMS and nearby industrial context support industrial thermal source, but the ${input.landCoverClass} land-cover and shorter-lived stored persistence pattern point to a vegetation or wildfire explanation. The original FIRMS+OSM rule is retained because the evidence disagrees.${detail}`,
    };
  }
  if (shortTermClassification !== "uncertain_other" && enrichedClassification !== "uncertain_other" && shortTermClassification !== enrichedClassification) {
    return {
      classification: shortTermClassification,
      confidence: "medium",
      reason: `Seven-day FIRMS and nearby industrial context support ${shortTermClassification.replaceAll("_", " ")}, but the land-cover and stored-persistence evidence point to ${enrichedClassification.replaceAll("_", " ")}. The original FIRMS+OSM rule is retained because the evidence disagrees.${detail}`,
    };
  }

  if (shortTermClassification === "industrial_thermal_source" || enrichedClassification === "industrial_thermal_source") {
    return {
      classification: "industrial_thermal_source",
      confidence: "high",
      reason: `Nearby industrial context is present, FIRMS detections occurred on ${detectionDays} of the returned seven days, and the enriched rule supports a recurring industrial thermal-source pattern.${detail}`,
    };
  }

  if (shortTermClassification === "likely_wildfire_vegetation" || enrichedClassification === "likely_wildfire_vegetation") {
    return {
      classification: "likely_wildfire_vegetation",
      confidence: "high",
      reason: `No nearby industrial context was found, FIRMS detections occurred on ${detectionDays} of the returned seven days, and the enriched rule supports a short-lived vegetation or wildfire pattern.${detail}`,
    };
  }

  return {
    classification: "uncertain_other",
    confidence,
    reason: `The available evidence shows ${input.industrialFeatures} nearby industrial-context feature${input.industrialFeatures === 1 ? "" : "s"} and detections on ${detectionDays} of the returned seven days, which does not meet either rule-based classification threshold.${detail}`,
  };
}
