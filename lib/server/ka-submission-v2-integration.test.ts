import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { describe, expect, it } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import { getSubmissionRequirements } from "./submissions/requirements";

describe("K.A. submission V2 migration preserves player history", () => {
  it("upgrades drafts, copies compatible answers and leaves submitted forms unchanged", async () => {
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"] }));
    try {
      const db = await mf.getD1Database("DB") as unknown as D1Database;
      for (const file of (await readdir("migrations")).filter(name => name.endsWith(".sql") && name < "0018").sort()) {
        await db.batch(unstable_splitSqlQuery(await readFile(`migrations/${file}`, "utf8")).map(sql => db.prepare(sql)));
      }
      await db.prepare(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('qa-history','QA','qa-history@example.test',1,0,0)`).run();
      for (const [caseId, session, status] of [["maimee","old-draft","draft"],["wa-ve","old-receipt","submitted"]]) {
        await db.prepare("INSERT INTO questionnaire_sessions (id,user_id,questionnaire_id) VALUES (?,'qa-history',?)").bind(session,`questionnaire-submission-ka-${caseId}-netlood-city-v1`).run();
        await db.prepare("INSERT INTO submissions (id,user_id,subgame_id,questionnaire_session_id,status) VALUES (?,'qa-history',?,?,?)").bind(session,caseId === "maimee" ? "subgame-ka-fintech" : "subgame-ka-wa-ve",session,status).run();
        for (const suffix of ["model","evidence","system","timeline"]) await db.prepare("INSERT INTO responses (id,session_id,question_id,value_json) VALUES (?,?,?,?)").bind(`${session}-${suffix}`,session,`question-submission-ka-${caseId}-${suffix}`,JSON.stringify(`QA original ${suffix}`)).run();
      }
      await db.prepare(`INSERT INTO uploads (id,submission_id,user_id,kind,private_r2_key,original_name,stored_name,bytes,mime_declared,mime_detected,sha256,status)
        VALUES ('old-file','old-draft','qa-history','answer_attachment','private/old.txt','old.txt','old.txt',12,'text/plain','text/plain','qa','uploaded')`).run();
      const before = await db.prepare("SELECT id,session_id,question_id,value_json FROM responses ORDER BY id").all();
      await db.batch(unstable_splitSqlQuery(await readFile("migrations/0018_ka_submission_v2.sql","utf8")).map(sql => db.prepare(sql)));
      expect(await db.prepare("SELECT id,session_id,question_id,value_json FROM responses WHERE id NOT LIKE '%-ka-v2' ORDER BY id").all()).toMatchObject({ results: before.results });
      expect(await db.prepare("SELECT questionnaire_session_id FROM submissions WHERE id = 'old-receipt'").first()).toEqual({ questionnaire_session_id: "old-receipt" });
      expect(await db.prepare("SELECT closed_at FROM questionnaire_sessions WHERE id = 'old-draft'").first()).toMatchObject({ closed_at: expect.any(String) });
      expect(await db.prepare("SELECT questionnaire_session_id FROM submissions WHERE id = 'old-draft'").first()).toEqual({ questionnaire_session_id: "old-draft-ka-v2" });
      const transferred = await db.prepare("SELECT q.question_key,r.value_json FROM responses r JOIN questions q ON q.id = r.question_id WHERE r.session_id = 'old-draft-ka-v2' ORDER BY q.sort_order").all();
      expect(transferred.results).toEqual([
        { question_key: "case_summary",value_json: '"QA original model"' },
        { question_key: "reasoning",value_json: '"QA original evidence"' },
        { question_key: "innovation",value_json: '"QA original system"' },
      ]);
      expect(await db.prepare("SELECT private_r2_key,status FROM uploads WHERE id = 'old-file'").first()).toEqual({ private_r2_key: "private/old.txt", status: "rejected" });
      expect(await getSubmissionRequirements(db,"subgame-ka-fintech","old-draft-ka-v2")).toMatchObject({ instrumentVersion: "ka-submission-v2", requiresAnswerForm: true, requiresAnswerAttachment: false, requiresAiChatLink: false });
      expect(await getSubmissionRequirements(db,"subgame-ka-wa-ve","old-receipt")).toMatchObject({ instrumentVersion: "netlood-city-submission-v1", requiresAnswerForm: true, requiresAnswerAttachment: false });
      await db.prepare("INSERT INTO questionnaire_sessions (id,user_id,questionnaire_id,completed_at) VALUES ('v2-receipt','qa-history','questionnaire-submission-ka-wa-ve-v2',CURRENT_TIMESTAMP)").run();
      await db.prepare("INSERT INTO submissions (id,user_id,subgame_id,questionnaire_session_id,status) VALUES ('v2-receipt','qa-history','subgame-ka-wa-ve','v2-receipt','submitted')").run();
      await db.prepare(`INSERT INTO responses (id,session_id,question_id,value_json) VALUES ('v2-link','v2-receipt','question-ka-wa-ve-v2-ai_chat_link','"https://example.test/qa"')`).run();
      const beforeV3 = await db.prepare("SELECT id,session_id,question_id,value_json FROM responses ORDER BY id").all();
      await db.batch(unstable_splitSqlQuery(await readFile("migrations/0019_ka_ai_pdf.sql","utf8")).map(sql => db.prepare(sql)));
      expect((await db.prepare("SELECT id,session_id,question_id,value_json FROM responses WHERE id NOT LIKE '%-ka-v3' ORDER BY id").all()).results).toEqual(beforeV3.results);
      expect(await db.prepare("SELECT questionnaire_session_id FROM submissions WHERE id='v2-receipt'").first()).toEqual({questionnaire_session_id:"v2-receipt"});
      expect(await getSubmissionRequirements(db,"subgame-ka-wa-ve","v2-receipt")).toMatchObject({requiresAiChatLink:false,requiresAiChatPdf:true});
      expect(await getSubmissionRequirements(db,"subgame-ka-fintech","old-draft-ka-v2-ka-v3")).toMatchObject({requiresAiChatLink:false,requiresAiChatPdf:true,requiresAnswerAttachment:false});
      expect((await db.prepare("SELECT question_key FROM questions WHERE questionnaire_id='questionnaire-submission-ka-maimee-v3'").all()).results).toHaveLength(5);
      expect((await db.prepare("SELECT previous_session_id FROM submission_form_history WHERE submission_id='old-draft'").all()).results).toHaveLength(2);
      // File-only policy migration does not rotate questions or erase historical player records.
      const tables = ["questions", "responses", "questionnaire_sessions", "submissions", "uploads"];
      const snapshot = async () => Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results));
      const beforePdfOnly = await snapshot();
      await db.batch(unstable_splitSqlQuery(await readFile("migrations/0022_ai_pdf_only.sql","utf8")).map(sql => db.prepare(sql)));
      expect(await snapshot()).toEqual(beforePdfOnly);
      expect((await db.prepare("SELECT answer_mode,allowed_artifact_extensions_json,requires_ai_chat_pdf,requirements_json FROM subgame_submission_requirements").all()).results.every(row =>
        row.answer_mode === "text" && row.allowed_artifact_extensions_json === "[]" && row.requires_ai_chat_pdf === 1 && JSON.parse(String(row.requirements_json)).requiresAnswerAttachment === false)).toBe(true);
      // Research deletion can still remove both retained and current sessions.
      await db.prepare("DELETE FROM submissions WHERE user_id = 'qa-history'").run();
      await db.prepare("DELETE FROM questionnaire_sessions WHERE user_id = 'qa-history'").run();
      expect(await db.prepare("SELECT COUNT(*) AS n FROM submission_form_migrations").first()).toEqual({ n: 0 });
      expect(await db.prepare("SELECT COUNT(*) AS n FROM submission_form_history").first()).toEqual({ n: 0 });
    } finally { await mf.dispose(); }
  }, 30_000);
});
