import { isResearchCollectionReady, researchNotice } from "../../../../lib/server/research-policy";
import { getResearchCollectionPolicy } from "../../../../lib/server/research-runtime";
import {
  aiChatPdfConsentCheckboxLabel,
  approvedResearchConsentText,
  researchConsentCheckboxLabel,
} from "../../../../lib/server/research-consent-copy";
import { getResearchRetentionYears } from "../../../../lib/server/research-retention";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const retentionYears = await getResearchRetentionYears();
  const researchCollectionPolicy = await getResearchCollectionPolicy();

  return Response.json(
    {
      collectionEnabled: isResearchCollectionReady(researchCollectionPolicy),
      notice: {
        ...researchNotice,
        aiChatPdfConsentCheckboxLabel: aiChatPdfConsentCheckboxLabel(retentionYears),
        aiChatPdfNotice: aiChatPdfConsentCheckboxLabel(retentionYears),
        approvedConsentText: approvedResearchConsentText(retentionYears),
        controllerContactEmail: "mailto:creativelab.co.th@gmail.com",
        researchConsentCheckboxLabel,
        retentionAndWithdrawalPolicy: approvedResearchConsentText(retentionYears),
        retentionYears,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
