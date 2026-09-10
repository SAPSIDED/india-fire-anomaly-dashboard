import fs from "node:fs";
import path from "node:path";

export const ML_FEATURE_NAMES = ["frpMw", "dayNightRatio", "sevenDayDetectionCount", "activeMonths"] as const;
export type MlFeatureName = (typeof ML_FEATURE_NAMES)[number];
export type MlClassificationLabel = "industrial_facility" | "wildfire";

export type MlFeatureInput = Record<MlFeatureName, number | null>;
export type MlClassificationResult = {
  state: "available" | "unavailable";
  label: MlClassificationLabel | null;
  probability: number | null;
  confidence: "low" | "medium" | "high" | "unavailable";
  features: MlFeatureInput;
  modelVersion: string | null;
  detail: string;
};

type XgbTree = {
  base_weights: number[];
  default_left: number[];
  left_children: number[];
  right_children: number[];
  split_conditions: number[];
  split_indices: number[];
};

export type XgbArtifact = {
  version?: number[];
  learner?: {
    feature_names?: string[];
    learner_model_param?: { base_score?: string };
    objective?: { name?: string };
    gradient_booster?: {
      name?: string;
      model?: { trees?: XgbTree[] };
    };
  };
};

let artifactOverride: XgbArtifact | null | undefined;

function modelCandidates() {
  return [
    path.join(process.cwd(), "server/data/xgboost_model.json"),
    path.join(process.cwd(), "dist/data/xgboost_model.json"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "data/xgboost_model.json"),
  ];
}

function loadArtifact(): XgbArtifact {
  if (artifactOverride !== undefined) {
    if (!artifactOverride) throw new Error("XGBoost model artifact override is unavailable.");
    return artifactOverride;
  }
  for (const candidate of modelCandidates()) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as XgbArtifact;
    } catch {
      // Continue through source/dist candidates so the same adapter works in dev and bundled deployments.
    }
  }
  throw new Error("XGBoost model artifact was not found in the server data directory.");
}

function numericFeature(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function baseScore(artifact: XgbArtifact) {
  const raw = artifact.learner?.learner_model_param?.base_score ?? "0.5";
  const match = raw.match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/);
  const parsed = match ? Number(match[0]) : 0.5;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? Math.log(parsed / (1 - parsed)) : 0;
}

function treeContribution(tree: XgbTree, features: number[]) {
  let node = 0;
  while (node >= 0) {
    const left = tree.left_children[node];
    const right = tree.right_children[node];
    if (left < 0 && right < 0) return tree.split_conditions[node] ?? tree.base_weights[node] ?? 0;
    const featureIndex = tree.split_indices[node] ?? 0;
    const threshold = tree.split_conditions[node] ?? 0;
    const value = features[featureIndex];
    const missing = !Number.isFinite(value);
    if (missing) {
      node = tree.default_left[node] ? left : right;
    } else {
      node = value < threshold ? left : right;
    }
  }
  return 0;
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function confidenceFor(probability: number): MlClassificationResult["confidence"] {
  const margin = Math.abs(probability - 0.5);
  return margin >= 0.35 ? "high" : margin >= 0.18 ? "medium" : "low";
}

export function predictMlClassification(features: MlFeatureInput, artifact = loadArtifact()): MlClassificationResult {
  const normalized: MlFeatureInput = {
    frpMw: features.frpMw ?? null,
    dayNightRatio: features.dayNightRatio ?? null,
    sevenDayDetectionCount: features.sevenDayDetectionCount ?? null,
    activeMonths: features.activeMonths ?? null,
  };
  try {
    const model = artifact.learner;
    const names = model?.feature_names ?? [];
    const trees = model?.gradient_booster?.model?.trees ?? [];
    if (model?.objective?.name !== "binary:logistic" || model.gradient_booster?.name !== "gbtree" || trees.length === 0 || names.join(",") !== ML_FEATURE_NAMES.join(",")) {
      throw new Error("The model artifact does not match the approved four-feature binary XGBoost contract.");
    }
    const vector = ML_FEATURE_NAMES.map(name => numericFeature(normalized[name]));
    // XGBoost JSON stores each leaf's already-scaled contribution in split_conditions.
    const margin = baseScore(artifact) + trees.reduce((sum, tree) => sum + treeContribution(tree, vector), 0);
    const probability = sigmoid(margin);
    const label: MlClassificationLabel = probability >= 0.5 ? "wildfire" : "industrial_facility";
    return {
      state: "available",
      label,
      probability: Number(probability.toFixed(6)),
      confidence: confidenceFor(probability),
      features: normalized,
      modelVersion: artifact.version?.join(".") ?? null,
      detail: `XGBoost screening signal from the four approved features; probability of wildfire ${(probability * 100).toFixed(1)}%.`,
    };
  } catch (error) {
    return {
      state: "unavailable",
      label: null,
      probability: null,
      confidence: "unavailable",
      features: normalized,
      modelVersion: null,
      detail: error instanceof Error ? error.message : "The XGBoost screening signal is unavailable.",
    };
  }
}

export function setMlArtifactForTests(artifact?: XgbArtifact | null) {
  artifactOverride = artifact;
}
