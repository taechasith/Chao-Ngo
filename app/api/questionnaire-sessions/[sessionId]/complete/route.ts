import { env } from "cloudflare:workers";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";

import { calculateRecommendations } from "../../../../../lib/server/questionnaires/recommendations";
import { type QuestionType, validateQuestionValue } from "../../../../../lib/server/questionnaires/validation";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

type QuestionRow = {
  id: string;
  options_json: string;
  question_key: string;
  required: number;
  type: QuestionType;
  value_json: string | null;
};

function noStoreResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function parseStoredValue(valueJson: string): unknown | null {
  try {
    return JSON.parse(valueJson) as unknown;
  } catch {
    return null;
  }
}

function asScaleValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null;
}

function asOptionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return noStoreResponse({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }
  if (!(await isWithinPlayerMutationLimit(participant.userId, "questionnaire-complete", 12))) return noStoreResponse({ code: "REQUEST_RATE_LIMITED" }, 429);

  const { sessionId } = await context.params;
  const session = await env.DB.prepare(
    `SELECT questionnaire_sessions.questionnaire_id,
            questionnaire_sessions.completed_at,
            questionnaires.questionnaire_key,
            questionnaires.version AS questionnaire_version
       FROM questionnaire_sessions
       INNER JOIN questionnaires ON questionnaires.id = questionnaire_sessions.questionnaire_id
      WHERE questionnaire_sessions.id = ? AND questionnaire_sessions.user_id = ?`,
  )
    .bind(sessionId, participant.userId)
    .first<{
      completed_at: string | null;
      questionnaire_id: string;
      questionnaire_key: string;
      questionnaire_version: string;
    }>();

  if (!session) {
    return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_NOT_FOUND" }, 404);
  }

  if (session.completed_at) {
    const existing = await env.DB.prepare(
      `SELECT recommended_subgame_id, score_json
         FROM recommendation_results
        WHERE questionnaire_session_id = ?`,
    )
      .bind(sessionId)
      .first<{ recommended_subgame_id: string; score_json: string }>();

    return noStoreResponse({
      recommendation: existing
        ? {
            recommendedSubgameId: existing.recommended_subgame_id,
            scores: parseStoredValue(existing.score_json),
          }
        : null,
      status: "already_completed",
    });
  }

  if (session.questionnaire_key !== "pregame") {
    const rows = await env.DB.prepare(
      `SELECT questions.id, questions.question_key, questions.type, questions.required,
              questions.options_json, responses.value_json
         FROM questions
         LEFT JOIN responses ON responses.question_id = questions.id AND responses.session_id = ?
        WHERE questions.questionnaire_id = ?
        ORDER BY questions.sort_order ASC`,
    ).bind(sessionId, session.questionnaire_id).all<QuestionRow>();

    const missing: string[] = [];
    const invalid: string[] = [];
    for (const question of rows.results) {
      if (!question.value_json) {
        if (question.required === 1) missing.push(question.question_key);
        continue;
      }
      const value = parseStoredValue(question.value_json);
      const validated = value === null ? { success: false as const } : validateQuestionValue({
        id: question.id,
        optionsJson: question.options_json,
        questionKey: question.question_key,
        required: question.required === 1,
        type: question.type,
      }, value);
      if (!validated.success) invalid.push(question.question_key);
    }

    if (missing.length || invalid.length) {
      return noStoreResponse({ code: "QUESTIONNAIRE_INCOMPLETE", invalidQuestionKeys: invalid, missingQuestionKeys: missing }, 400);
    }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE questionnaire_sessions SET completed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
      ).bind(sessionId, participant.userId),
      env.DB.prepare(
        `INSERT INTO activity_events (id, event_id, user_id, event_type, payload_json)
         SELECT ?, ?, ?, ?, ? WHERE changes() > 0`,
      ).bind(
        crypto.randomUUID(),
        crypto.randomUUID(),
        participant.userId,
        session.questionnaire_key.startsWith("postgame:") ? "posttest_completed" : "submission_draft_saved",
        JSON.stringify({ instrumentVersion: session.questionnaire_version }),
      ),
    ]);

    return noStoreResponse({ status: "completed" });
  }

  const questionRows = await env.DB.prepare(
    `SELECT questions.id, questions.question_key, questions.type, questions.required,
            questions.options_json, responses.value_json
       FROM questions
       LEFT JOIN responses
         ON responses.question_id = questions.id AND responses.session_id = ?
      WHERE questions.questionnaire_id = ?
      ORDER BY questions.sort_order ASC`,
  )
    .bind(sessionId, session.questionnaire_id)
    .all<QuestionRow>();

  const answers = new Map<string, unknown>();
  const invalidQuestionKeys: string[] = [];
  const missingQuestionKeys: string[] = [];

  for (const question of questionRows.results) {
    if (!question.value_json) {
      if (question.required === 1) {
        missingQuestionKeys.push(question.question_key);
      }
      continue;
    }

    const rawValue = parseStoredValue(question.value_json);
    const validated = rawValue === null
      ? { success: false as const }
      : validateQuestionValue(
          {
            id: question.id,
            optionsJson: question.options_json,
            questionKey: question.question_key,
            required: question.required === 1,
            type: question.type,
          },
          rawValue,
        );

    if (!validated.success) {
      invalidQuestionKeys.push(question.question_key);
      continue;
    }

    answers.set(question.question_key, validated.value);
  }

  if (missingQuestionKeys.length > 0 || invalidQuestionKeys.length > 0) {
    return noStoreResponse(
      {
        code: "QUESTIONNAIRE_INCOMPLETE",
        invalidQuestionKeys,
        missingQuestionKeys,
      },
      400,
    );
  }

  const ageText = asOptionalText(answers.get("age"));
  const age = ageText && /^\d{1,3}$/.test(ageText) ? Number(ageText) : null;

  if (!age || age > 120 || age < participant.minimumParticipantAge) {
    return noStoreResponse({ code: "AGE_NOT_ELIGIBLE" }, 400);
  }

  const scienceFieldsInterest = {
    biotech: asScaleValue(answers.get("field_interest_biotech")),
    fintech: asScaleValue(answers.get("field_interest_fintech")),
    psychology: asScaleValue(answers.get("field_interest_psychology")),
    quantum: asScaleValue(answers.get("field_interest_quantum")),
    space: asScaleValue(answers.get("field_interest_space")),
  };

  if (Object.values(scienceFieldsInterest).some((value) => value === null)) {
    return noStoreResponse({ code: "QUESTIONNAIRE_INCOMPLETE" }, 400);
  }

  const rules = await env.DB.prepare(
    `SELECT recommendation_rules.rule_json,
            recommendation_rules.target_subgame_id,
            recommendation_rules.version
       FROM recommendation_rules
       INNER JOIN subgames ON subgames.id = recommendation_rules.target_subgame_id
       INNER JOIN games ON games.id = subgames.game_id
      WHERE recommendation_rules.active = 1
        AND games.status = 'playable'
        AND subgames.status = 'playable'`,
  ).all<{
    rule_json: string;
    target_subgame_id: string;
    version: string;
  }>();

  const candidates = calculateRecommendations(
    answers,
    rules.results.map((rule) => ({
      ruleJson: rule.rule_json,
      subgameId: rule.target_subgame_id,
      version: rule.version,
    })),
  );
  const recommendation = candidates[0];

  if (!recommendation) {
    return noStoreResponse({ code: "RECOMMENDATION_RULES_UNAVAILABLE" }, 409);
  }

  const scoreJson = JSON.stringify({
    algorithm: "exploratory-heuristic",
    candidates,
    diagnosticStatus: "unavailable",
  });
  const profileStatement = env.DB.prepare(
    `INSERT INTO user_profiles (
       user_id, age, education_level, gender, institution, science_interest,
       science_fields_interest_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       age = excluded.age,
       education_level = excluded.education_level,
       gender = excluded.gender,
       institution = excluded.institution,
       science_interest = excluded.science_interest,
       science_fields_interest_json = excluded.science_fields_interest_json,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    participant.userId,
    age,
    asOptionalText(answers.get("education_level")),
    asOptionalText(answers.get("gender")),
    asOptionalText(answers.get("institution")),
    asScaleValue(answers.get("overall_science_interest")),
    JSON.stringify(scienceFieldsInterest),
  );
  const completionStatement = env.DB.prepare(
    `UPDATE questionnaire_sessions
        SET completed_at = CURRENT_TIMESTAMP,
            score_json = ?
      WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
  ).bind(
    JSON.stringify({
      instrumentVersion: session.questionnaire_version,
      scoringStatus: "not-scored",
    }),
    sessionId,
    participant.userId,
  );
  const recommendationStatement = env.DB.prepare(
    `INSERT INTO recommendation_results (
       id, user_id, questionnaire_session_id, rule_version, recommended_subgame_id, score_json
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(questionnaire_session_id) DO UPDATE SET
       rule_version = excluded.rule_version,
       recommended_subgame_id = excluded.recommended_subgame_id,
       score_json = excluded.score_json,
       created_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(),
    participant.userId,
    sessionId,
    recommendation.ruleVersion,
    recommendation.subgameId,
    scoreJson,
  );
  const activityStatement = env.DB.prepare(
    `INSERT INTO activity_events (
       id, event_id, user_id, event_type, payload_json
     ) VALUES (?, ?, ?, 'pregame_completed', ?)`,
  ).bind(
    crypto.randomUUID(),
    crypto.randomUUID(),
    participant.userId,
    JSON.stringify({ instrumentVersion: session.questionnaire_version, scoringStatus: "not-scored" }),
  );

  await env.DB.batch([profileStatement, completionStatement, recommendationStatement, activityStatement]);

  return noStoreResponse({
    alternatives: candidates.slice(1),
    recommendation,
    status: "completed",
  });
}
