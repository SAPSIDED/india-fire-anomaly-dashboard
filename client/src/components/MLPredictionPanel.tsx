import React, { type CSSProperties } from "react";
import { predictWithNativeXgb, type NativeMLFeatures } from "@/lib/nativeXgbPredictor";

type MLPrediction = {
  classification: "wildfire" | "industrial_facility" | "agricultural_burning" | "mining";
  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
  inference?: "local-json-model" | "remote-service";
  modelVersion?: string | null;
  wildfireGate?: "eligible" | "blocked" | "unknown";
  wildfireGateReason?: string;
};

type Props = {
  prediction: MLPrediction | null | undefined;
  features?: NativeMLFeatures;
};

export function MLPredictionPanel({ prediction, features }: Props) {
  const effectivePrediction: MLPrediction | null = prediction ?? (features ? predictWithNativeXgb(features) : null);

  if (!effectivePrediction) {
    return (
      <div className="ml-prediction-panel ml-prediction-empty">
        <p className="eyebrow">AI SCREENING SIGNAL</p>
        <h3>XGBoost classification</h3>
        <p>Select a hotspot to see the AI screening signal</p>
        <small>The model result will persist here after a successful hotspot verification.</small>
      </div>
    );
  }

  const probabilities = [
    { label: "Wildfire", value: effectivePrediction.wildfireProbability },
    { label: "Industrial facility", value: effectivePrediction.industrialProbability },
    { label: "Agricultural burning", value: effectivePrediction.agriculturalProbability },
    { label: "Mining", value: effectivePrediction.miningProbability },
  ];

  const confidence = Math.max(...probabilities.map(item => item.value)) * 100;
  const classificationLabel = {
    wildfire: "Likely wildfire",
    industrial_facility: "Likely industrial facility",
    agricultural_burning: "Likely agricultural burning",
    mining: "Likely mining activity",
  }[effectivePrediction.classification];

  return (
    <div className="ml-prediction-panel">
      <p className="eyebrow">AI SCREENING SIGNAL</p>
      <h3>XGBoost classification</h3>
      <p className="ml-independence-note">Independent model prediction — does not use rule-based evidence</p>
      <div className="ml-classification">
        <strong>{classificationLabel}</strong>
        <span>Model confidence: {confidence.toFixed(1)}%</span>
      </div>
      {effectivePrediction.wildfireGate && <div className="ml-independence-note">FSI wildfire gate: <strong>{effectivePrediction.wildfireGate}</strong>{effectivePrediction.wildfireGateReason ? ` · ${effectivePrediction.wildfireGateReason}` : ""}</div>}
      <div className="ml-probabilities">
        {probabilities.map(item => (
          <div key={item.label} style={{ "--probability": `${item.value * 100}` } as CSSProperties}>
            <span>{item.label}</span>
            <b>{(item.value * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
      <small>Four-class XGBoost screening signal from thermal intensity and temporal behaviour. This prediction supports screening and does not replace source-backed corroboration.{effectivePrediction.modelVersion ? ` Model ${effectivePrediction.modelVersion}.` : ""}</small>
    </div>
  );
}
