import fs from "node:fs";
import path from "node:path";

export type MLClass = "wildfire" | "industrial_facility" | "agricultural_burning" | "mining";
export type MLResult = {
  prediction: number;
  classification: MLClass;
  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
  inference: "local-json-model" | "remote-service";
  modelVersion: string | null;
  wildfireGate: "eligible" | "blocked" | "unknown";
  wildfireGateReason: string;
};

export type WildfireGateInput = {
  pointForestStatus: "inside" | "outside" | "unknown";
  historicalForestFireDetections: number | null;
};

type XgbTree = {
  base_weights: number[];
  default_left: number[];
  left_children: number[];
  right_children: number[];
  split_conditions: number[];
  split_indices: number[];
};
type XgbArtifact = {
  version?: number[];
  learner?: {
    feature_names?: string[];
    objective?: { name?: string; softmax_multiclass_param?: { num_class?: string } };
    learner_model_param?: { base_score?: string; num_class?: string };
    gradient_booster?: { name?: string; model?: { trees?: XgbTree[]; tree_info?: number[] } };
  };
};

const FEATURES = ["frpMw", "brightness", "brightT31", "confidence", "dayNightRatio", "sevenDayDetectionCount"] as const;
const LABELS: MLClass[] = ["wildfire", "industrial_facility", "agricultural_burning", "mining"];
let artifactOverride: XgbArtifact | null | undefined;

function artifactCandidates() {
  return [
    path.join(process.cwd(), "ml/model/fire_classifier.json"),
    path.join(process.cwd(), "server/data/fire_classifier.json"),
    path.join(process.cwd(), "dist/ml/model/fire_classifier.json"),
  ];
}

function loadArtifact(): XgbArtifact {
  if (artifactOverride !== undefined) {
    if (artifactOverride === null) throw new Error("Local ML model override is unavailable.");
    return artifactOverride;
  }
  for (const candidate of artifactCandidates()) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as XgbArtifact;
    } catch {
      // Try the next deployment/source candidate.
    }
  }
  throw new Error("The Anaconda XGBoost JSON artifact is not available in this deployment.");
}

function featureValue(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function treeContribution(tree: XgbTree, features: number[]) {
  let node = 0;
  while (node >= 0) {
    const left = tree.left_children[node] ?? -1;
    const right = tree.right_children[node] ?? -1;
    if (left < 0 && right < 0) return tree.split_conditions[node] ?? tree.base_weights[node] ?? 0;
    const index = tree.split_indices[node] ?? 0;
    const threshold = tree.split_conditions[node] ?? 0;
    const value = features[index];
    node = !Number.isFinite(value)
      ? (tree.default_left[node] ? left : right)
      : value < threshold ? left : right;
  }
  return 0;
}

function softmax(margins: number[]) {
  const max = Math.max(...margins);
  const exponents = margins.map(value => Math.exp(value - max));
  const total = exponents.reduce((sum, value) => sum + value, 0) || 1;
  return exponents.map(value => value / total);
}

function localPredict(input: number[], wildfireGate?: WildfireGateInput): MLResult {
  const artifact = loadArtifact();
  const learner = artifact.learner;
  const model = learner?.gradient_booster?.model;
  const trees = model?.trees ?? [];
  const treeInfo = model?.tree_info ?? [];
  const featureNames = learner?.feature_names ?? [];
  const numClasses = Number(learner?.objective?.softmax_multiclass_param?.num_class ?? learner?.learner_model_param?.num_class ?? 0);
  if (learner?.objective?.name !== "multi:softprob" || learner.gradient_booster?.name !== "gbtree" || numClasses !== LABELS.length || trees.length === 0 || featureNames.join(",") !== FEATURES.join(",")) {
    throw new Error("The local model does not match the Anaconda four-class feature contract.");
  }
  const margins = Array.from({ length: numClasses }, () => 0);
  trees.forEach((tree, index) => {
    const classIndex = treeInfo[index] ?? index % numClasses;
    if (classIndex >= 0 && classIndex < numClasses) margins[classIndex] += treeContribution(tree, input);
  });
  const rawProbabilities = softmax(margins);
  const gate = !wildfireGate
    ? "eligible" as const
    : wildfireGate.pointForestStatus === "inside" && (wildfireGate.historicalForestFireDetections ?? 0) > 0
    ? "eligible" as const
    : wildfireGate?.pointForestStatus === "outside"
      ? "blocked" as const
      : "unknown" as const;
  const probabilities = gate === "eligible" ? rawProbabilities : (() => {
    const masked = [...rawProbabilities];
    masked[0] = 0;
    const total = masked.reduce((sum, value) => sum + value, 0) || 1;
    return masked.map(value => value / total);
  })();
  const prediction = probabilities.indexOf(Math.max(...probabilities));
  return {
    prediction,
    classification: LABELS[prediction],
    wildfireProbability: Number(probabilities[0].toFixed(6)),
    industrialProbability: Number(probabilities[1].toFixed(6)),
    agriculturalProbability: Number(probabilities[2].toFixed(6)),
    miningProbability: Number(probabilities[3].toFixed(6)),
    inference: "local-json-model",
    modelVersion: artifact.version?.join(".") ?? null,
    wildfireGate: gate,
    wildfireGateReason: gate === "eligible"
      ? `Wildfire class permitted: FSI point forest gate is inside and ISFR historical forest-fire detections are ${wildfireGate?.historicalForestFireDetections}.`
      : gate === "blocked"
        ? "Wildfire class blocked: FSI point forest gate is outside forest."
        : "Wildfire class withheld: point-level FSI forest membership or historical forest-fire evidence is unavailable.",
  };
}

/**
 * Uses the checked-in Anaconda-trained model locally so Vercel/Manus does not
 * depend on a localhost Flask process. The six arguments match the trained
 * artifact; missing upstream values are represented by the existing numeric
 * fallback supplied by corroboration.ts.
 */
export async function classifyWithML(
  frpMw: number,
  brightness: number,
  brightT31: number,
  confidence: number,
  dayNightRatio: number,
  sevenDayDetectionCount: number,
  wildfireGate?: WildfireGateInput,
): Promise<MLResult | null> {
  try {
    return localPredict([frpMw, brightness, brightT31, confidence, dayNightRatio, sevenDayDetectionCount].map(featureValue), wildfireGate);
  } catch {
    return null;
  }
}

export function setMLArtifactForTests(artifact?: XgbArtifact | null) {
  artifactOverride = artifact;
}

export default classifyWithML;
