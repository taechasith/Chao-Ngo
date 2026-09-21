type RecommendationRule = {
  field: string;
  problemStyleKeys: string[];
  weights: {
    confidenceGap: number;
    diagnosticFit: number;
    interest: number;
    problemStyle: number;
  };
};

export type RecommendationCandidate = {
  components: {
    confidenceGap: number;
    diagnosticFit: number;
    interest: number;
    problemStyle: number;
  };
  ruleVersion: string;
  score: number;
  subgameId: string;
};

export type StoredRecommendationRule = {
  ruleJson: string;
  subgameId: string;
  version: string;
};

function normalizedScaleValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? (value - 1) / 4
    : 0;
}

function parseRule(ruleJson: string): RecommendationRule | null {
  try {
    const parsed = JSON.parse(ruleJson) as Partial<RecommendationRule>;

    if (
      typeof parsed.field !== "string" ||
      !Array.isArray(parsed.problemStyleKeys) ||
      parsed.problemStyleKeys.some((value) => typeof value !== "string") ||
      !parsed.weights ||
      Object.values(parsed.weights).some((value) => typeof value !== "number" || value < 0)
    ) {
      return null;
    }

    const weights = parsed.weights as RecommendationRule["weights"];
    return {
      field: parsed.field,
      problemStyleKeys: parsed.problemStyleKeys,
      weights,
    };
  } catch {
    return null;
  }
}

export function calculateRecommendations(
  answers: ReadonlyMap<string, unknown>,
  storedRules: StoredRecommendationRule[],
): RecommendationCandidate[] {
  const selectedProblemStyles = new Set(
    Array.isArray(answers.get("preferred_problem_style"))
      ? (answers.get("preferred_problem_style") as string[])
      : [],
  );

  return storedRules
    .flatMap((storedRule) => {
      const rule = parseRule(storedRule.ruleJson);

      if (!rule) {
        return [];
      }

      const interest = normalizedScaleValue(answers.get(`field_interest_${rule.field}`));
      const confidenceGap = 1 - normalizedScaleValue(answers.get(`field_familiarity_${rule.field}`));
      const problemStyle =
        rule.problemStyleKeys.length === 0
          ? 0
          : rule.problemStyleKeys.filter((key) => selectedProblemStyles.has(key)).length /
            rule.problemStyleKeys.length;
      const diagnosticFit = 0;
      const score =
        rule.weights.interest * interest +
        rule.weights.problemStyle * problemStyle +
        rule.weights.confidenceGap * confidenceGap +
        rule.weights.diagnosticFit * diagnosticFit;

      return [
        {
          components: {
            confidenceGap,
            diagnosticFit,
            interest,
            problemStyle,
          },
          ruleVersion: storedRule.version,
          score,
          subgameId: storedRule.subgameId,
        },
      ];
    })
    .sort((left, right) => right.score - left.score || left.subgameId.localeCompare(right.subgameId));
}
