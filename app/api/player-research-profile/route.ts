import { env } from "cloudflare:workers";

import { readBoundedJson } from "../../../lib/server/questionnaires/request";
import { isWithinPlayerMutationLimit } from "../../../lib/server/request-limits";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { requireResearchParticipant } from "../../../lib/server/research-access";
import { parseStoredInterests, parseStoredSkills, researchProfileSchema, type ResearchProfile } from "../../../lib/server/research-profile";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type StoredProfile = {
  age: number | null;
  education_level: string | null;
  gender: string | null;
  institution: string | null;
  science_interest: number | null;
  science_fields_interest_json: string | null;
  personal_skills_json: string | null;
};

async function getProfile(userId: string): Promise<ResearchProfile | null> {
  const row = await env.DB.prepare(
    `SELECT age, education_level, gender, institution, science_interest,
            science_fields_interest_json, personal_skills_json
       FROM user_profiles WHERE user_id = ?`,
  ).bind(userId).first<StoredProfile>();
  if (!row) return null;
  const fieldInterests = parseStoredInterests(row.science_fields_interest_json);
  if (!fieldInterests) return null;
  const parsed = researchProfileSchema.safeParse({
    age: row.age,
    educationLevel: row.education_level,
    gender: row.gender,
    institution: row.institution,
    scienceInterest: row.science_interest,
    fieldInterests,
    personalSkills: parseStoredSkills(row.personal_skills_json),
  });
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  const profile = await getProfile(participant.userId);
  return profile ? json({ profile }) : json({ code: "RESEARCH_PROFILE_NOT_READY" }, 409);
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return json({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  const body = await readBoundedJson(request, 4_096);
  const parsed = researchProfileSchema.safeParse(body);
  if (!parsed.success) return json({ code: "INVALID_RESEARCH_PROFILE" }, 400);
  const profile = parsed.data;
  if (profile.age < participant.minimumParticipantAge) return json({ code: "AGE_NOT_ELIGIBLE" }, 400);
  if (!(await isWithinPlayerMutationLimit(participant.userId, "research-profile", 12))) return json({ code: "REQUEST_RATE_LIMITED" }, 429);

  const result = await env.DB.prepare(
    `UPDATE user_profiles
        SET age = ?, education_level = ?, gender = ?, institution = ?, science_interest = ?,
            science_fields_interest_json = ?, personal_skills_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?`,
  ).bind(
    profile.age,
    profile.educationLevel,
    profile.gender,
    profile.institution,
    profile.scienceInterest,
    JSON.stringify(profile.fieldInterests),
    JSON.stringify(profile.personalSkills),
    participant.userId,
  ).run();
  if (!result.meta.changes) return json({ code: "RESEARCH_PROFILE_NOT_READY" }, 409);
  return json({ ok: true, profile });
}
