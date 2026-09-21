import { z } from "zod";

export const consentRecordInputSchema = z
  .object({
    aiChatUploadConsent: z.boolean(),
    consentVersion: z.string().trim().min(1).max(64),
    dataNoticeVersion: z.string().trim().min(1).max(64),
    researchParticipation: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!value.researchParticipation && value.aiChatUploadConsent) {
      context.addIssue({
        code: "custom",
        message: "AI chat upload consent requires research participation.",
        path: ["aiChatUploadConsent"],
      });
    }
  });
