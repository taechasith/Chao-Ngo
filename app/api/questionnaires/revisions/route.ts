import { env } from "cloudflare:workers";
import { withD1RetryableErrorHandling } from "../../../../lib/server/d1-overload";
export const dynamic="force-dynamic";
// Published IDs only: no participant answers, scoring rules, or internal notes.
let cached:{database:D1Database;until:number;result:Promise<Record<string,string>>}|undefined;
export const GET=withD1RetryableErrorHandling(async()=>{
  if(!cached || cached.database!==env.DB || cached.until<Date.now()) {
    const result=env.DB.prepare("SELECT questionnaire_key,id FROM questionnaires WHERE published=1 ORDER BY created_at,rowid").all<{questionnaire_key:string;id:string}>().then(rows=>Object.fromEntries(rows.results.map(row=>[row.questionnaire_key,row.id])));
    cached={database:env.DB,until:Date.now()+2000,result};
    void result.catch(()=>{if(cached?.result===result) cached=undefined;});
  }
  return Response.json({revisions:await cached.result},{headers:{"Cache-Control":"public, max-age=2","X-Content-Type-Options":"nosniff"}});
});
