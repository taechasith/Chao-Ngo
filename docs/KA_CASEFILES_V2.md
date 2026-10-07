# K.A. Casefiles V2 — 7 October 2026

The three approved Drive folders replace the MAIMEE and WA VE story/evidence and
the shared personnel dossier. The player manifest contains 38 originals: 22
MAIMEE, 15 WA VE and one personnel PDF. The existing non-spoiler NetLood City
overview PDF remains. The conflicting V1 shared prelude and outdated personnel
portraits are retired.

The seven answer-key files are intentionally absent from this repository,
its public assets and the player manifest. Administrators open the original
Drive files from the protected /ka-answer-keys page in Chao-Ngo-Admin. Existing
Drive permissions still apply; this update does not widen them.

## Rollout

1. Run typecheck, lint, tests and build.
2. Dispatch Deploy Chao Ngo on the reviewed branch with operation prepare-ka-v2.
   It uploads the 38 approved player files to content-addressed R2 keys, then
   downloads each CDN file and checks its byte count and SHA-256.
3. Dispatch the same workflow with operation migrate. Migration 0017 hides
   legacy player asset rows and publishes the approved replacements. The migration
   runner refuses to switch content if any original is missing or different.
4. Deploy the reviewed player and admin changes to main. Check both case lists,
   TXT, image and PDF viewers, and the administrator-only page.

Subgame IDs, questionnaire instruments, saved answers, user profiles, uploads
and submissions are preserved. Old asset rows and R2 objects remain for history;
they are not selected in the current player catalog. V2 evidence has distinct
IDs for activity provenance. The archived V1 importer requires --legacy-v1 to
avoid accidentally republishing superseded content.

## Recovery

Keep the pre-migration asset visibility snapshot from the inspect operation
before switching. Restore those visibility flags and the old application
revision if a content rollback is needed. Do not roll back player data or delete
V2 asset rows. Review any submissions made during the V2 interval against V2
evidence. The original PDFs have been kept unchanged, including their source
layout and dates.
