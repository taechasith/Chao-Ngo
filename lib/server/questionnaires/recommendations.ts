type RecommendationWeights = {
  confidenceGap: number;
  diagnosticFit: number;
  interest: number;
  problemStyle: number;
};

type RecommendationRule = {
  fields: string[];
  problemStyleKeys: string[];
  weights: RecommendationWeights;
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
    const parsed = JSON.parse(ruleJson) as Partial<RecommendationRule> & { field?: unknown };
    const multiFields = Array.isArray(parsed.fields) && parsed.fields.every((value) => typeof value === "string")
      ? parsed.fields
      : null;
    // Keep the original single-field grammar valid, including when a later rule
    // adds an unrelated or malformed `fields` property.
    const fields = multiFields && multiFields.length > 0
      ? multiFields
      : typeof parsed.field === "string"
        ? [parsed.field]
        : null;

    if (
      !fields ||
      !Array.isArray(parsed.problemStyleKeys) ||
      parsed.problemStyleKeys.some((value) => typeof value !== "string") ||
      !parsed.weights ||
      Object.values(parsed.weights).some((value) => typeof value !== "number" || value < 0)
    ) {
      return null;
    }

    const weights = parsed.weights as RecommendationWeights;
    return {
      fields,
      problemStyleKeys: parsed.problemStyleKeys,
      weights,
    };
  } catch {
    return null;
  }
}

function averageFieldValue(fields: readonly string[], readValue: (field: string) => number): number {
  return fields.reduce((total, field) => total + readValue(field), 0) / fields.length;
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

      const interest = averageFieldValue(rule.fields, (field) =>
        normalizedScaleValue(answers.get(`field_interest_${field}`)),
      );
      const confidenceGap = averageFieldValue(rule.fields, (field) =>
        1 - normalizedScaleValue(answers.get(`field_familiarity_${field}`)),
      );
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
