import React from "react";
import { resolveConclusion, type ConclusionMlResult, type ConclusionRuleBasedResult } from "@shared/conclusion";

type Props = {
  ruleBasedResult: ConclusionRuleBasedResult;
  mlResult: ConclusionMlResult;
  namedFacilityMatch: boolean;
};

export function FinalAssessmentPanel({ ruleBasedResult, mlResult, namedFacilityMatch }: Props) {
  const conclusion = resolveConclusion({ ...ruleBasedResult, namedFacilityMatch }, mlResult);
  return (
    <section className="final-assessment-panel" aria-labelledby="final-assessment-title">
      <p className="eyebrow">FINAL ASSESSMENT</p>
      <h3 id="final-assessment-title">{conclusion.verdict}</h3>
      <strong className="final-assessment-state">{conclusion.state}</strong>
      <p className="final-assessment-explanation">{conclusion.explanation}</p>
      <dl className="final-assessment-signals">
        <div><dt>Rule-based signal</dt><dd>{ruleBasedResult.classification.replaceAll("_", " ")} · {ruleBasedResult.confidence.toUpperCase()}</dd></div>
        <div><dt>AI screening signal</dt><dd>{mlResult.classification.replaceAll("_", " ")} · {conclusion.aiConfidencePercent.toFixed(1)}%</dd></div>
      </dl>
    </section>
  );
}
