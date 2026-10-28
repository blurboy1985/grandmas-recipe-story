# Final review — Milestones A–D (Wonder, high)

Run 28 October 2026 (Muse, Asia/Singapore) against `docs/PLAN.md`
acceptance criteria and the build guide's quality gate (§13). Scope:
factual grounding, unknown quantities, empty stories, source references,
secret exposure, media validation, retry/cost limits, persistence, delete
behavior, fresh-clone reproducibility. No live Meta calls were made in this
session; live evidence below is the recorded Daniel-run evidence only.

## Verdict

Milestones A–D are sound on the core promise. No High-severity defect was
found: quantities are never invented in code, quotes are verified verbatim,
extraction is gated on transcript approval, paid calls are explicit, cached
and deduplicated, and delete/recovery behave as designed. Two Medium
defects were found and fixed in this session (M1, M2), plus three Low
fixes (L1, L3, L4). The remaining items are documented limitations, not
silent gaps. Milestone C is still **not live-proven** (no live Voice call
has ever succeeded through the app; see Open gates).

## Acceptance evidence (what was actually checked)

| Criterion | Evidence |
| --- | --- |
| No invented quantity / ingredient / history | `validate.ts` enforces null-quantity → `needs_confirmation=true` + non-empty `original_words`; prompt rules 1–2 (`extraction-prompt.ts`); mocked + sample tests green |
| Empty story stays empty | `validate.ts` empty-story rule; sample fixture + extraction tests |
| Source references valid | Segment IDs assigned in code (`segments.ts`), membership + verbatim-quote checks reject bad drafts (`store.ts` `requestExtraction`) |
| At most three questions | Schema `maxItems: 3` + code check |
| Injection treated as data | Prompt rule 7; extraction test with instruction-like transcript text |
| Secrets never in bundle/logs | Adapters are server-only, read `META_API_KEY` at call time, return safe codes; `scripts/lint.mjs` guards `NEXT_PUBLIC_` secrets; no key logging found |
| Media validation | Actual RIFF/PCM/mono/16-bit bytes + duration/size checked (`audio.ts`), not extension/MIME |
| Retry/cost limits | One bounded retry in both adapters; 8k output budget; cache keys include model + prompt/schema/options versions; in-process dedup maps + persisted `model_cache` guard |
| Refresh/save/print/reopen are free | Only the two explicit POST routes call the adapters; verified by code inspection + mocked tests |
| Delete removes rows/media/cache | Transaction + tombstones (`store.ts` `deleteRecipe`); family-evidence tests |
| Persistence / recovery | SQLite WAL; interrupted jobs → `failed/interrupted` on startup (`db.ts`) |
| Sample mode without a key | Explicit fictional fixture, labelled; live failures surface as safe codes, never silent sample fallback |
| Fresh-clone reproducibility | `npm ci`, typecheck/lint/tests/build re-run green this session (see HANDOFF) |

## Findings

### M1 — Medium — Tombstone retry never runs under the default config (fixed)

`sweepWith` in `src/server/db.ts` compared `join(dataDir(), relative_path)`
against the prefix `dataDir() + "/"`. With the default relative
`DATA_DIR=./data/app`, `join` normalizes the `./` away (`data/app/...`)
while the prefix keeps it (`./data/app/`), so every tombstone was skipped:
a media file whose deletion failed at delete-time was never retried and its
tombstone row never cleared. The existing test used an absolute temp
`DATA_DIR`, so it could not see this. Fixed by resolving both paths to
absolute form before the containment check; new regression test uses a
relative `DATA_DIR` (`tests/sweep-relative.test.ts`, observed failing
before the fix).

### M2 — Medium — Re-transcription could silently replace approved text (fixed)

`requestTranscription` (`src/server/store.ts`) filled the kept original
transcript row with an `UPDATE`. If that version was the job's approved
version, `approved_transcript_version_id` kept pointing at it, so
extraction would run on words nobody approved — against the architecture
rule that changed text clears approval until re-approved. The page hides
the Transcribe button once text exists, but the route/store did not guard.
Fixed: when the overwritten original is the approved version, approval is
cleared (job pointer + `approved_at`) inside the same transaction; the new
text must be approved again before extraction. Covered by a new test in
`tests/transcription.test.ts`.

### L1 — Low — Dead condition in DB startup (fixed)

`getDb` had `if (fresh || true) recoverInterrupted(handle);` — always true,
with `fresh` otherwise meaningless. Simplified to an unconditional call.

### L2 — Low — Misleading `sampleMode: true` on the recipe list API (fixed)

`GET /api/recipes` always returned `sampleMode: true` regardless of stored
recipes. No client read it. Removed.

### L3 — Low — Empty clarification answers were stored as evidence (fixed)

`answerClarification` accepted a blank answer, stored `""` with an
`answered_at` timestamp and family provenance, and the empty string then
flowed into regeneration notes. It now rejects blank answers with
`empty_answer` (400). Covered by a test in `tests/family-evidence.test.ts`.

### L4 — Low — Documentation drift (fixed where cheap)

- `docs/ARCHITECTURE.md` described `src/server/meta|db|media|recipes/`
  folders and Vitest/Playwright; the implementation is flat modules under
  `src/server/` with `node:test`. Corrected by note, not by restructuring.
- `docs/PLAN.md` status table said "D next" after D shipped; README status
  said "Milestones A–C"; home-page copy said live transcription/extraction
  "arrive in later milestones"; layout metadata still said "(Sample)" /
  "Milestone A". All updated in this session.
- Codex-era setup text (`docs/SETUP.md`, guide, `MODEL_USAGE.md`,
  `AGENTS.md`, README launch commands) superseded by the Muse
  playbook update in this session. Historical handoff/feedback entries are
  left as the truthful record of their time.

### Noted, not fixed (accepted limitations)

- Media route has no HTTP Range support; playback was verified in the
  Milestone D headless-Chrome pass, but seeking in some browsers may be
  limited. Revisit only if a real device shows a problem.
- Dish-photo upload is still not wired (row/route support exists;
  `hasPhoto` is never true through the UI). Presentation-only by design;
  do not claim it.
- Upload duration trusts the WAV data-chunk's declared size; a truncated
  file can overstate duration. The provider revalidates real bytes; the
  app limit still bounds the request.
- No authentication: correct for the one-process local MVP. A hosted demo
  must add access control before exposing paid routes (guide §14).

## Open gates (unchanged, Daniel-owned)

- Live Voice proof: `scripts/transcribe-smoke.mjs` with a hidden key, the
  three consented WAV evaluations, and one genuine full live flow. Until
  then C stays "code-complete, not live-proven".
- One family-reviewed real recipe; licence choice; screenshots; the
  ≤3-minute demo video; fresh-clone check from a clean checkout.
- Optional Milestone E remains unstarted by decision.

Checks actually run for this review are listed in `docs/HANDOFF.md`
(28 Oct 2026, final review entry), including the redesigned UI smoke.
