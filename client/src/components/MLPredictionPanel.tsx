import React from "react";

type Props = { prediction: { classification: "wildfire" | "industrial_facility" | "agricultural_burning" | "mining"; wildfireProbability: number; industrialProbability: number; agriculturalProbability: number; miningProbability: number } | null };

export function MLPredictionPanel({ prediction }: Props) {
  if (!prediction) {
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
    { label: "Wildfire", value: prediction.wildfireProbability },
    { label: "Industrial facility", value: prediction.industrialProbability },
    { label: "Agricultural burning", value: prediction.agriculturalProbability },
    { label: "Mining", value: prediction.miningProbability },
  ];

  const confidence = Math.max(...probabilities.map(item => item.value)) * 100;

  const classificationLabel = {
    wildfire: "Likely wildfire",
    industrial_facility: "Likely industrial facility",
    agricultural_burning: "Likely agricultural burning",
    mining: "Likely mining activity",
  }[prediction.classification];

  return (
    <div className="ml-prediction-panel">
      <p className="eyebrow">AI SCREENING SIGNAL</p>
      <h3>XGBoost classification</h3>
      <div className="ml-classification">
        <strong>{classificationLabel}</strong>
        <span>Model confidence: {confidence.toFixed(1)}%</span>
      </div>
      <div className="ml-probabilities">
        {probabilities.map(item => (
          <div key={item.label} style={{ "--probability": `${item.value * 100}` } as React.CSSProperties}>
            <span>{item.label}</span>
            <b>{(item.value * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
      <small>Learned signal from thermal intensity and temporal behaviour. This prediction supports screening and does not replace source-backed corroboration.</small>
    </div>
  );
}
