import { z } from "zod";

export const researchFields = ["quantum", "space", "psychology", "fintech", "biotech"] as const;
export const educationLevels = ["lower_secondary", "upper_secondary", "vocational", "bachelor", "other"] as const;
export const genderValues = ["male", "female", "nonbinary_or_self_described", "prefer_not_to_say"] as const;

const rating = z.number().int().min(1).max(5);
const skill = z.string().trim().min(2).max(40);

export const researchProfileSchema = z.object({
  age: z.number().int().min(18).max(120),
  educationLevel: z.enum(educationLevels),
  gender: z.enum(genderValues).nullable(),
  institution: z.string().trim().max(120).nullable(),
  scienceInterest: rating,
  fieldInterests: z.object({
    quantum: rating,
    space: rating,
    psychology: rating,
    fintech: rating,
    biotech: rating,
  }).strict(),
  personalSkills: z.array(skill).max(8).refine((items) => new Set(items.map((item) => item.toLocaleLowerCase())).size === items.length),
}).strict();

export type ResearchProfile = z.infer<typeof researchProfileSchema>;

export function parseStoredInterests(value: string | null): ResearchProfile["fieldInterests"] | null {
  if (!value) return null;
  try {
    return researchProfileSchema.shape.fieldInterests.parse(JSON.parse(value));
  } catch { return null; }
}

export function parseStoredSkills(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = z.array(skill).max(8).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}
