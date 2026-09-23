const maximumPrivateUploadBytes = 20 * 1024 * 1024;

const supportedAnswerAttachmentExtensions = ["txt", "docx", "pdf", "pptx", "png", "jpg", "jpeg"] as const;

export type AnswerAttachmentExtension = (typeof supportedAnswerAttachmentExtensions)[number];

export type SubmissionRequirements = {
  allowedAnswerAttachmentExtensions: AnswerAttachmentExtension[];
  instrumentVersion: string;
  maxAnswerAttachmentBytes: number;
  requiredAnswerQuestionKeys: string[];
  requiresAiChatPdf: boolean;
  requiresAnswerTextOrAttachment: boolean;
  requiresPosttest: boolean;
};

type RequirementRow = {
  allowed_answer_attachment_json?: unknown;
  allowed_artifact_extensions_json?: unknown;
  answer_mode?: unknown;
  instrument_version?: unknown;
  max_answer_attachment_bytes?: unknown;
  requires_ai_chat_pdf?: unknown;
  requires_answer_text_or_attachment?: unknown;
  requires_posttest?: unknown;
  requirements_json?: unknown;
  version?: unknown;
};

const kaSubgameIds = new Set(["subgame-ka-fintech", "subgame-ka-wa-ve"]);
const kaRequiredAnswerQuestionKeys = [
  "case_truth_model",
  "case_timeline",
  "evidence_reasoning",
  "alternative_hypothesis",
  "prevention_system",
  "prevention_limits_and_ethics",
  "intervention_outcome",
];

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return fallback;
}

function parseExtensions(value: unknown): AnswerAttachmentExtension[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  const allowed = new Set<AnswerAttachmentExtension>();
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const extension = item.trim().toLowerCase() as AnswerAttachmentExtension;
    if (supportedAnswerAttachmentExtensions.includes(extension)) allowed.add(extension);
  }
  return supportedAnswerAttachmentExtensions.filter((extension) => allowed.has(extension));
}

function parseRequiredAnswerQuestionKeys(value: unknown): string[] {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const keys = (parsed as { textRequiredQuestionKeys?: unknown }).textRequiredQuestionKeys;
  if (!Array.isArray(keys)) return [];

  return [...new Set(keys.filter((key): key is string =>
    typeof key === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(key),
  ))];
}

function parseMaximumBytes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return maximumPrivateUploadBytes;
  return Math.min(parsed, maximumPrivateUploadBytes);
}

function legacyRequirements(): SubmissionRequirements {
  return {
    allowedAnswerAttachmentExtensions: [],
    instrumentVersion: "legacy-node-zone-v1",
    maxAnswerAttachmentBytes: maximumPrivateUploadBytes,
    requiredAnswerQuestionKeys: [],
    requiresAiChatPdf: true,
    requiresAnswerTextOrAttachment: true,
    requiresPosttest: true,
  };
}

function kaFallbackRequirements(): SubmissionRequirements {
  return {
    allowedAnswerAttachmentExtensions: [...supportedAnswerAttachmentExtensions],
    instrumentVersion: "netlood-city-submission-v1",
    maxAnswerAttachmentBytes: maximumPrivateUploadBytes,
    requiredAnswerQuestionKeys: [...kaRequiredAnswerQuestionKeys],
    requiresAiChatPdf: false,
    requiresAnswerTextOrAttachment: true,
    requiresPosttest: false,
  };
}

export function fallbackSubmissionRequirements(subgameId: string): SubmissionRequirements {
  return kaSubgameIds.has(subgameId) ? kaFallbackRequirements() : legacyRequirements();
}

export function isKnownKaSubmissionSubgameId(subgameId: string): boolean {
  return kaSubgameIds.has(subgameId);
}

export function isSafeSubmissionSubgameId(subgameId: string): boolean {
  return /^subgame-[a-z0-9][a-z0-9-]{1,100}$/.test(subgameId);
}

function requirementsFromRow(subgameId: string, row: RequirementRow): SubmissionRequirements {
  const fallback = fallbackSubmissionRequirements(subgameId);
  const answerMode = typeof row.answer_mode === "string" ? row.answer_mode : null;
  const answerModeRequiresResponse = answerMode === "text" || answerMode === "attachment" || answerMode === "text_or_attachment";
  const answerModeIsKnown = answerModeRequiresResponse;
  const requiresAnswerTextOrAttachment = row.requires_answer_text_or_attachment === undefined
    ? answerModeIsKnown ? answerModeRequiresResponse : fallback.requiresAnswerTextOrAttachment
    : parseBoolean(row.requires_answer_text_or_attachment, fallback.requiresAnswerTextOrAttachment);
  const allowedAnswerAttachmentExtensions = parseExtensions(
    row.allowed_answer_attachment_json ?? row.allowed_artifact_extensions_json,
  );

  return {
    allowedAnswerAttachmentExtensions: requiresAnswerTextOrAttachment ? allowedAnswerAttachmentExtensions : [],
    instrumentVersion: typeof row.instrument_version === "string"
      ? row.instrument_version
      : typeof row.version === "string"
        ? row.version
        : fallback.instrumentVersion,
    maxAnswerAttachmentBytes: parseMaximumBytes(row.max_answer_attachment_bytes),
    requiredAnswerQuestionKeys: parseRequiredAnswerQuestionKeys(row.requirements_json),
    requiresAiChatPdf: parseBoolean(row.requires_ai_chat_pdf, fallback.requiresAiChatPdf),
    requiresAnswerTextOrAttachment,
    requiresPosttest: parseBoolean(row.requires_posttest, fallback.requiresPosttest),
  };
}

function isMissingRequirementsTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*subgame_submission_requirements/i.test(error.message);
}

/**
 * Reads both the finalized NETLOOD CITY schema and the earlier additive-schema
 * proposal by selecting the row wholesale, rather than binding the client to a
 * particular column spelling. A missing row uses the conservative per-subgame fallback.
 */
export async function getSubmissionRequirements(
  database: D1Database,
  subgameId: string,
): Promise<SubmissionRequirements> {
  try {
    const row = await database.prepare(
      "SELECT * FROM subgame_submission_requirements WHERE subgame_id = ? LIMIT 1",
    ).bind(subgameId).first<RequirementRow>();
    return row ? requirementsFromRow(subgameId, row) : fallbackSubmissionRequirements(subgameId);
  } catch (error) {
    if (isMissingRequirementsTable(error)) return fallbackSubmissionRequirements(subgameId);
    throw error;
  }
}

export { maximumPrivateUploadBytes, supportedAnswerAttachmentExtensions };
