export type QuestionType = "file" | "long" | "multi" | "scale" | "short" | "single";

export type StoredQuestion = {
  id: string;
  optionsJson: string;
  questionKey: string;
  required: boolean;
  type: QuestionType;
};

export type ValidatedQuestionValue = number | string | string[];

type ChoiceOption = {
  label: string;
  value: string;
};

type ScaleOptions = {
  max: number;
  min: number;
};

const maxResponseBytes = 8_192;

function parseChoiceOptions(optionsJson: string): ChoiceOption[] | null {
  try {
    const parsed: unknown = JSON.parse(optionsJson);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const options = parsed.filter(
      (option): option is ChoiceOption =>
        typeof option === "object" &&
        option !== null &&
        typeof (option as { label?: unknown }).label === "string" &&
        typeof (option as { value?: unknown }).value === "string",
    );

    return options.length === parsed.length ? options : null;
  } catch {
    return null;
  }
}

function parseScaleOptions(optionsJson: string): ScaleOptions | null {
  try {
    const parsed: unknown = JSON.parse(optionsJson);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Number.isInteger((parsed as { min?: unknown }).min) ||
      !Number.isInteger((parsed as { max?: unknown }).max)
    ) {
      return null;
    }

    const { max, min } = parsed as ScaleOptions;
    return min <= max ? { max, min } : null;
  } catch {
    return null;
  }
}

function hasSafeSerializedSize(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && serialized.length <= maxResponseBytes;
  } catch {
    return false;
  }
}

function validateText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength ? trimmed : null;
}

export function validateQuestionValue(
  question: StoredQuestion,
  input: unknown,
): { success: true; value: ValidatedQuestionValue } | { success: false } {
  if (!hasSafeSerializedSize(input)) {
    return { success: false };
  }

  if (question.type === "short") {
    const value = validateText(input, 500);
    return value === null ? { success: false } : { success: true, value };
  }

  if (question.type === "long") {
    const value = validateText(input, 4_000);
    return value === null ? { success: false } : { success: true, value };
  }

  if (question.type === "scale") {
    const options = parseScaleOptions(question.optionsJson);

    if (
      !options ||
      typeof input !== "number" ||
      !Number.isInteger(input) ||
      input < options.min ||
      input > options.max
    ) {
      return { success: false };
    }

    return { success: true, value: input };
  }

  if (question.type === "single") {
    const options = parseChoiceOptions(question.optionsJson);

    if (!options || typeof input !== "string" || !options.some((option) => option.value === input)) {
      return { success: false };
    }

    return { success: true, value: input };
  }

  if (question.type === "multi") {
    const options = parseChoiceOptions(question.optionsJson);

    if (
      !options ||
      !Array.isArray(input) ||
      input.length === 0 ||
      input.length > options.length ||
      input.some((value) => typeof value !== "string")
    ) {
      return { success: false };
    }

    const selected = input as string[];
    const unique = new Set(selected);

    if (
      unique.size !== selected.length ||
      selected.some((value) => !options.some((option) => option.value === value))
    ) {
      return { success: false };
    }

    return { success: true, value: selected };
  }

  return { success: false };
}
