import { env } from "cloudflare:workers";
import { withD1RetryableErrorHandling } from "../../../../../lib/server/d1-overload";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";
import { refreshActiveSession, readQuestionnaireSession } from "../../../../../lib/server/questionnaires/live-updates";

export const dynamic="force-dynamic";
export const POST=withD1RetryableErrorHandling(async(request:Request,context:{params:Promise<{sessionId:string}>})=>{
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  if(!isSameOriginRequest(request)) return json({code:"CROSS_ORIGIN_REQUEST"},403);
  const participant=await requireResearchParticipant(request);if(participant instanceof Response) return participant;
  if(!await isWithinPlayerMutationLimit(participant.userId,"questionnaire-refresh",30)) return json({code:"REQUEST_RATE_LIMITED"},429);
  const {sessionId}=await context.params;
  const result=await refreshActiveSession(env.DB,participant.userId,sessionId);
  const form=await readQuestionnaireSession(env.DB,participant.userId,result.sessionId);
  return form ? json({form,updated:result.updated}) : json({code:"QUESTIONNAIRE_SESSION_NOT_FOUND"},404);
});
