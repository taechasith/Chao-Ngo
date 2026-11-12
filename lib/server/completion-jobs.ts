import { recalculateCompletionForUser } from "./completion";
import { logFinalize } from "./finalize-diagnostics";

// 1 claim + up to 4 D1 calls per job stays below the 50-query invocation budget.
const maxPerTick = 12;
const parallel = 3;

type Job = { user_id: string; revision: string; attempts: number };

export async function processCompletionJobs(db: D1Database) {
  const token = crypto.randomUUID();
  // Claim atomically; a crashed invocation leaves jobs eligible again after the lease.
  const { results: jobs } = await db.prepare(`
    UPDATE completion_jobs SET lease_token = ?, lease_until = unixepoch() + 180, attempts = attempts + 1
    WHERE user_id IN (SELECT user_id FROM completion_jobs
      WHERE next_attempt_at <= unixepoch() AND lease_until <= unixepoch()
      ORDER BY next_attempt_at, user_id LIMIT ?)
    RETURNING user_id, revision, attempts`).bind(token, maxPerTick).all<Job>();
  for (let i = 0; i < jobs.length; i += parallel) {
    await Promise.allSettled(jobs.slice(i, i + parallel).map(async job => {
      const started = performance.now();
      try {
        await recalculateCompletionForUser(job.user_id, { revision: job.revision, token });
        await db.batch([
          db.prepare("DELETE FROM completion_jobs WHERE user_id = ? AND revision = ? AND lease_token = ? AND lease_until > unixepoch()")
            .bind(job.user_id, job.revision, token),
          // A newer submission may have replaced the revision while this job was running.
          db.prepare("UPDATE completion_jobs SET lease_token = NULL, lease_until = 0 WHERE user_id = ? AND lease_token = ? AND revision <> ?")
            .bind(job.user_id, token, job.revision),
        ]);
      } catch (error) {
        logFinalize(token, "completion_job", performance.now() - started, error);
        const delay = Math.min(900, 15 * 2 ** Math.min(6, job.attempts));
        try {
          await db.prepare(`UPDATE completion_jobs SET lease_token = NULL, lease_until = 0,
            next_attempt_at = CASE WHEN revision = ? THEN unixepoch() + ? ELSE next_attempt_at END
            WHERE user_id = ? AND lease_token = ?`).bind(job.revision, delay, job.user_id, token).run();
        } catch (releaseError) {
          logFinalize(token, "completion_lease_release", performance.now() - started, releaseError);
        }
      }
    }));
  }
  return jobs.length;
}
