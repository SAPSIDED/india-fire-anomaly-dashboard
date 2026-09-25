import { nativeXgbModel } from "./nativeXgbModel";

export type NativeMLFeatures = {
  frpMw: number;
  brightness: number;
  brightT31: number;
  confidence: number;
  dayNightRatio: number;
  sevenDayDetectionCount: number;
};

export type NativeMLResult = {
  prediction: number;
  classification: "wildfire" | "industrial_facility" | "agricultural_burning" | "mining";
  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
};

function softmax(scores: number[]) {
  const maxScore = Math.max(...scores);
  const exponentials = scores.map(score => Math.exp(score - maxScore));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
}

export function predictWithNativeXgb(features: NativeMLFeatures): NativeMLResult {
  const featureValues = nativeXgbModel.featureNames.map(name => features[name as keyof NativeMLFeatures]);
  const scores = nativeXgbModel.classNames.map(() => 0);

  nativeXgbModel.trees.forEach((tree, treeIndex) => {
    let node = 0;
    while (tree.left_children[node] !== -1) {
      const featureIndex = tree.split_indices[node];
      const value = featureValues[featureIndex];
      const isMissing = value === undefined || value === null || Number.isNaN(value);
      const goLeft = isMissing
        ? Number(tree.default_left[node]) === 1
        : value < tree.split_conditions[node];
      node = goLeft ? tree.left_children[node] : tree.right_children[node];
    }
    scores[nativeXgbModel.treeInfo[treeIndex]] += tree.base_weights[node];
  });

  const probabilities = softmax(scores);
  const prediction = probabilities.indexOf(Math.max(...probabilities));

  return {
    prediction,
    classification: nativeXgbModel.classNames[prediction],
    wildfireProbability: probabilities[0],
    industrialProbability: probabilities[1],
    agriculturalProbability: probabilities[2],
    miningProbability: probabilities[3],
  };
}
