import { describe, expect, it } from "vitest";

import { calculateRecommendations } from "./recommendations";
import { validateQuestionValue, type StoredQuestion } from "./validation";

const choiceQuestion: StoredQuestion = {
  id: "choice",
  optionsJson: '[{"value":"a","label":"A"},{"value":"b","label":"B"}]',
  questionKey: "choice",
  required: true,
  type: "multi",
};

describe("questionnaire answer validation", () => {
  it("accepts only known, unique multi-select values", () => {
    expect(validateQuestionValue(choiceQuestion, ["a", "b"])).toEqual({
      success: true,
      value: ["a", "b"],
    });
    expect(validateQuestionValue(choiceQuestion, ["a", "a"])).toEqual({ success: false });
    expect(validateQuestionValue(choiceQuestion, ["unknown"])).toEqual({ success: false });
  });

  it("enforces configured scale bounds", () => {
    const scaleQuestion: StoredQuestion = {
      id: "scale",
      optionsJson: '{"min":1,"max":5}',
      questionKey: "scale",
      required: true,
      type: "scale",
    };

    expect(validateQuestionValue(scaleQuestion, 3)).toEqual({ success: true, value: 3 });
    expect(validateQuestionValue(scaleQuestion, 6)).toEqual({ success: false });
  });
});

describe("recommendations", () => {
  it("ranks playable rule targets from saved answers and retains components", () => {
    const answers = new Map<string, unknown>([
      ["field_interest_quantum", 5],
      ["field_familiarity_quantum", 2],
      ["field_interest_space", 3],
      ["field_familiarity_space", 4],
      ["preferred_problem_style", ["math_data"]],
    ]);

    const candidates = calculateRecommendations(answers, [
      {
        ruleJson:
          '{"field":"space","problemStyleKeys":["space_engineering"],"weights":{"interest":0.5,"problemStyle":0.2,"confidenceGap":0.15,"diagnosticFit":0.15}}',
        subgameId: "space",
        version: "1.0.0",
      },
      {
        ruleJson:
          '{"field":"quantum","problemStyleKeys":["math_data"],"weights":{"interest":0.5,"problemStyle":0.2,"confidenceGap":0.15,"diagnosticFit":0.15}}',
        subgameId: "quantum",
        version: "1.0.0",
      },
    ]);

    expect(candidates[0]).toMatchObject({
      components: { diagnosticFit: 0, interest: 1, problemStyle: 1 },
      ruleVersion: "1.0.0",
      subgameId: "quantum",
    });
  });
});
