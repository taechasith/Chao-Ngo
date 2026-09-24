# Chao Ngo player backend handoff

This repository is the player application for เจ้าเงาะ (Chao Ngo), a Thai-first detective/science investigation platform. It is a Vinext/TypeScript application deployed to Cloudflare Workers. The admin CMS is a separate repository and deployment.

This document is the backend handoff for the next developer. Read it before changing migrations, auth, content publication, research collection, or uploads.

## Current production contract

The following values are authoritative for this player deployment:

| Resource | Value |
| --- | --- |
| Cloudflare account | `c24fed68f8dc59cc339bd821d215bba8` |
| Worker | `chao-ngo-player` |
| Player URL | `https://chaongo.creativelabth.com` |
| D1 database | `chao-ngo` |
| D1 database ID | `420393d7-6abf-4a43-bc4d-4f5f94a5b7e9` |
| Public R2 bucket | `creativelabth-public` (`PUBLIC_ASSETS`) |
| Private R2 bucket | `creativelabth-private` (`PRIVATE_UPLOADS`) |
| Public asset base | `https://cdn.creativelabth.com` |
| Retention cron | hourly (`0 * * * *`) |

Remote verification on 2026-09-24 confirmed:

- D1 schema version: `0013_ka_wave_bio_label`
- No pending remote migrations
- `NODE ZONE`: playable
- `The K.A. Casefiles`: playable
- `MAIMEE`: FinTech, playable
- `WA VE`: Bio, playable
- research collection: intentionally `false`
- research retention: 3 years

Do not replace the D1 ID with the older ID shown in historical guides. The current shared player/admin database is the `420393d7-...` database above.

## Local setup

Requirements: Node.js, npm, Wrangler authenticated to the CreativeLabTH account, and access to the local `.env.local`/`.dev.vars` files. Never commit either file.

```powershell
npm.cmd install
npm.cmd run db:migrate:local
npm.cmd run dev
```

The local app runs at `http://localhost:3000`.

Use the CMD shims on Windows when PowerShell execution policy blocks npm/npx scripts: `npm.cmd` and `npx.cmd`.

## Commands

```text
npm run dev                 # Vinext development server
npm run build               # production build
npm run preview             # local Node preview (Cloudflare bindings are limited)
npm run lint                # ESLint
npm run typecheck           # TypeScript
npm test                    # serialized Vitest suite
npm run db:migrate:local    # apply migrations to local D1
npm run db:migrate:remote   # apply pending migrations to remote D1
npm run content:import      # import approved NODE ZONE content
npm run content:import:ka   # import approved K.A. content
npm run asset -- <file> <r2-key>
node scripts/release-ux-qa.mjs
```

The test command intentionally runs with one worker because the D1/R2 integration suite is memory-sensitive.

## Cloudflare bindings and secrets

`wrangler.jsonc` is the source of truth for bindings. The Worker uses:

- `DB`: D1 database `chao-ngo`
- `PUBLIC_ASSETS`: public story assets only
- `PRIVATE_UPLOADS`: participant research uploads only
- `ASSETS`: built client assets

Configured secret names are:

- `BETTER_AUTH_SECRET`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`

Configured non-secret variables include `BETTER_AUTH_URL` and `RESEND_FROM_EMAIL`. Set or rotate secrets with Wrangler; never place them in `NEXT_PUBLIC_*`, source files, SQL, logs, screenshots, or API responses.

The site key may be exposed to the browser; the Turnstile secret may not. Turnstile is verified server-side in `app/api/auth/[...all]/route.ts`.

## Database and migration rules

Migrations are append-only and live in `migrations/`:

1. infrastructure and metadata
2. auth, profiles, and consent
3. games, subgames, timeline nodes, and assets
4. questionnaires and recommendation rules
5. active questionnaire-session uniqueness
6. player progress and activity events
7. submissions and private uploads
8. research retention
9. research collection gate
10. completion and admin notifications
11. API rate limits
12. NETLOOD CITY / K.A. Casefiles consolidation
13. WA VE Bio public identity

Never edit an applied migration. Add a new numbered migration instead. Before and after a remote migration:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "c24fed68f8dc59cc339bd821d215bba8"
npx.cmd wrangler d1 migrations list chao-ngo --remote --config wrangler.jsonc
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID
```

The player reads publication state from D1. Do not hard-code playable/locked decisions in player routes.

## Research collection gate

The production flag is currently disabled:

```sql
SELECT value FROM app_metadata WHERE key = 'research_collection_enabled';
```

Keep it disabled until the study owner has approved the Thai consent wording, minimum-age/minor policy, retention/deletion policy, withdrawal process, external-AI disclosure, and PDF-upload requirement. The player must show a transparent closed state and a useful route back to published case files.

When enabled, the server still requires current consent, verified email, retention eligibility, and participant ownership for research endpoints.

## Authentication and email

Authentication is handled by the existing server-side Better Auth integration. Do not invent a second session or password system.

Important behavior:

- email is normalized before lookup
- password hashing and session cookies stay server-side
- login/session changes rotate the session
- write routes enforce same-origin/CSRF protections where applicable
- Turnstile is checked on configured auth mutations
- reset responses must not reveal whether an email exists
- email verification is required before research completion/letter eligibility

Resend sends verification and transactional messages. Test delivery with the configured production sender before enabling research collection.

## Content and assistant URL

The admin-published `games` row is the source of truth for:

- game publication status
- game description
- assistant URL

Player pages now read `games.assistant_url` through `getPlayerAssistantUrl`. URLs are accepted only when they are HTTPS and contain no embedded credentials. The current value is the Gemini Gem URL stored in D1; update it through the admin content workflow, not by editing player JSX.

Current public game identity:

- `NODE ZONE`: Quantum and Space
- `The K.A. Casefiles`: MAIMEE (FinTech) and WA VE (Bio)

Legacy Psychology/Biotech routes remain compatibility aliases for historical records. Do not present them as current taxonomy.

## Public and private storage

Public R2 contains only published story/UI assets under approved prefixes such as:

```text
games/node-zone/...
games/ka-casefiles/...
game/images/...
game/audio/...
```

Research uploads use the private `PRIVATE_UPLOADS` bucket under `research-uploads/<user>/<submission>/...`.

The upload flow is:

1. authenticated user starts or resumes a draft submission
2. server validates submission ownership and file metadata
3. PDF/attachment is written to private R2 with a random stored name
4. server records MIME, byte count, checksum, and status in D1
5. finalize verifies the object and submission requirements

Never serve participant PDFs from `cdn.creativelabth.com`, expose a private R2 key, or render a private upload through a public URL.

## API surface

| Area | Routes |
| --- | --- |
| Auth | `/api/auth/[...all]` |
| Health | `/api/health` |
| Session/progress | `/api/player-session`, `/api/player-sessions`, `/api/player-progress` |
| Activity | `/api/player-sessions/:sessionId/activity-events` |
| Consent | `/api/research-consent`, `/api/research-consent/notice` |
| Questionnaires | `/api/questionnaires/:key/sessions`, `/api/questionnaire-sessions/:sessionId/*` |
| Submissions | `/api/submissions`, `/api/submissions/:submissionId/*` |
| Notifications | `/api/player-notifications` |
| Settings | `/api/player-settings` |

Use the existing response codes and error codes. Do not silently convert authorization, unavailable, expired, or failed states into empty data.

## Events, completion, and retention

Major actions are recorded with an idempotent event ID. Do not log passwords, tokens, raw PDF contents, or unnecessary free text.

The hourly Worker cron calls `cleanExpiredResearch`, which deletes expired private objects before removing linked research records. Failed deletion leaves a retryable marker. Do not bypass this order.

Completion and thank-you-letter eligibility are recalculated from current playable subgames, required post-tests, accepted/submitted work, consent, email verification, and retention eligibility. The system creates an admin notification; it does not send an official letter automatically unless the admin workflow marks it as sent.

## Security boundaries

- Keep identity/email separate from research exports; export pseudonymous participant IDs.
- Use prepared D1 statements with bound parameters.
- Preserve `PRIVATE_UPLOADS` isolation and ownership checks.
- Preserve security headers and no-store responses for research data.
- Add authorization-negative tests for every new object route.
- Do not add WebSockets or Durable Objects for ordinary activity events; immediate writes plus admin polling are the baseline.
- Do not commit local guides containing credentials or any generated secret.

## Handoff acceptance checklist

Run all of the following before handing a backend change to another developer:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/release-ux-qa.mjs
```

The latest browser run covered 70 checks at 360, 390, 768, 1024, and 1440 widths. All routes returned HTTP 200 with no console-error routes and no horizontal overflow. The only recorded request failures were expected canonical-iframe/font transport aborts in the local dev environment.

The latest local verification also passed lint, typecheck, build, and Vitest: 17 test files and 54 tests passed.

For production release, additionally verify a real signed-in Cloudflare session, email delivery, Turnstile rejection, remote D1 publication changes, private upload isolation, finalize/retry behavior, and the scheduled retention cleanup.

## Known local limitation

`vinext start` under plain Node cannot execute all Cloudflare-bound dynamic routes because of the `cloudflare:` module scheme. Use the local Vinext dev server for UI QA and `wrangler dev`/the deployed Worker for binding-backed authenticated QA. Do not interpret this local preview limitation as a production API result.
