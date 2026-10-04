# Game reliability rollout

This change fixes answer saving and resuming, inline PDF evidence, submission receipts, and requested revisions. It does not introduce the research platform described in the experiment spec.

## Before deploying

Production uses the shared `chao-ngo` D1 database. The dashboard member needs D1 access, and the deployment token needs D1 Edit. Worker Editor access alone is insufficient to inspect or migrate D1.

1. Review the pending migrations with `npx wrangler d1 migrations list DB --remote`. Preserve the existing migration ledger; do not replay already applied SQL manually.
2. Apply reviewed player migrations with `npm run db:migrate:remote`. Migration `0014_research_profile_skills.sql` adds the profile skills field. Migration `0015_submission_reviews.sql` adds reviewer notes, revision links and a separate form closure timestamp, retaining the saved answers and existing files.
3. Apply pending admin migrations from the admin repository. Shared migrations 0014/0015 have the same filenames and content in both repositories and are applied once through the shared D1 ledger.
4. Run `node scripts/check-game-data.mjs --remote`. It prints schema readiness, aggregate record counts and missing-session counts; it never prints emails, answers or secret values. Production CI stops before deployment if access or schema is missing.
5. Deploy the player and admin changes after the checks pass. The admin config targets `chaongoadmin.creativelabth.com` only; it must not claim the player domain.

Manual runs of `Deploy Chao Ngo` on feature branches default to read-only inspections: they list pending migrations and report schema, aggregate counts and integrity using the existing deployment token. Operation `migrate` additionally applies only reviewed 0014/0015 migrations after checking the ledger agrees with the schema, then checks retained record counts and readiness. Feature-branch runs never deploy. Main-branch runs retain the schema guard and deployment behavior.

## Production verification

Use the authorized synthetic QA account. Verify Google login, onboarding resume after reload, profile edits and rereads, evidence/PDF reading, immediate navigation after typing, clearing an answer, all four case submissions, private file uploads and admin downloads. Then review a synthetic submission as needs_revision, create its new draft, resend it and accept it. Compare the old and new answer records; do not overwrite the originals.

The current local checks exercise real isolated D1/R2 handlers and the browser components with a separate synthetic API fixture. They do not prove that production migrations have been applied or that production records are intact. Do not declare the rollout complete until D1 access and production checks pass. Do not send test thank-you emails or treat synthetic submissions as real experiment data.
