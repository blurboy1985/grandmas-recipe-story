# Handoff — Milestone D complete; Daniel decision next (E vs final review)

Updated 28 October 2026 (Muse session, Asia/Singapore).

---

## Milestone D complete (28 Oct 2026, Asia/Singapore)

Family evidence, persistence and print. No live Meta calls made in-session.
Committed and pushed 28 Oct 2026 (`348710b` route fix + `642425a` Milestone
D); the published repo now includes `src/app/api/uploads/route.ts`.

### Changed / added files

- `src/server/store.ts`: answers/corrections/transcript edits reset the
  latest draft to `draft`; `deleteRecipe` removes rows + media + cache rows
  referencing the job's versions in one transaction; `discardStagedUpload`
  + `stagedPath` validation (also hardens `createUploadRecipe` against
  path traversal); clarification detail gains `provenance`/`answeredAt`
- `src/server/db.ts`: `sweepStaleFiles` (stale staged uploads + tombstone
  retry/clear), wired into startup recovery
- `src/app/api/uploads/route.ts`: staged file discarded if recipe creation
  fails after staging
- `src/app/recipes/[id]/page.tsx`: regen warning (fields may change, versions
  + answers + corrections kept); family-answer vs model-question labels;
  review-reset note; two stale Milestone B strings fixed
- `tests/family-evidence.test.ts` (new, 8 tests) — written first, observed
  failing, then implemented to green
- `.gitignore`: `uploads/` → `/uploads/` — the old pattern silently excluded
  `src/app/api/uploads/route.ts` from the published repo; verified it was the
  only wrongly ignored source file, and the route is now untracked-visible
- `README.md` (Milestone D section, 44 tests), `docs/PLAN.md` (D
  code-complete, next = Daniel decision), `AGENTS.md` (phase line), handoff

### Checks run (actual results)

- `tsc --noEmit`: pass. `lint`: pass (38 files). `node --test`: 44/44 pass
  (36 existing + 8 D: answer-as-evidence, 3× review-reset, delete
  rows/media/cache/tmp, tombstone+sweep, staged sweep/discard, print/labels).
- `next build`: pass (8 routes; `/recipes/[id]` + `/api/uploads` rebuilt).
- Live HTTP smoke (`/tmp/smoke-d.mjs`, throwaway, not committed): 14/14
  pass against `next start` — sample create, provenance/answeredAt fields,
  answer + correction review-resets, WAV playback route, page shell,
  delete + gone. Port binding worked in this session.
- Headless-Chrome browser pass (28 Oct; your installed Chrome 156, fresh
  throwaway profile, never touched your open windows): 390px mobile and
  768px desktop screenshots render correctly; CDP measurement at forced
  390px shows zero overflowing elements; print-media emulation hides all
  10 `.noprint` controls (nav, progress, buttons, audio player) with the
  title and content visible; `--print-to-pdf` produced a 3-page Letter PDF.
  Found and fixed: audio player printed as a dead control (now `.noprint`).
  Earlier 390px CLI screenshots looked clipped, but element-level
  measurement disproved it — a headless-screenshot artifact, not a bug.
  Cleanup done: smoke recipe deleted via API, servers stopped, /tmp files
  removed, `data/app` holds no recipes.
- Lesson: never run `next build` while `next dev` serves from the same
  `.next/` — the dev server breaks with `Cannot find module './897.js'`.
  Fixed by stopping dev, deleting `.next/`, and restarting.

### Limitations (truthful, not silent)

- Rendering verified in headless Chrome as above; no check in a visible
  browser window with human eyes yet. Daniel may still open
  http://localhost:3000 after `npm run dev` for a final look, but it is no
  longer a verification gap.
- `audio.ts` still accepts 8–48 kHz (plan note says 16/24 kHz); untouched —
  tighten only if Wonder review requires it.
- Per-field inline editing not added: free-text corrections stay the MVP
  mechanism (generated `output_json` is never mutated by corrections).
- Photo upload still absent (row/route support exists); not in D scope.
- Live Voice proof still outstanding (Daniel-gated transcribe smoke +
  three consented WAVs + one full live flow).

### Remaining / next task (Daniel decision, then a fresh session)

Option 1 — optional Milestone E (Spark; heavy device setup):

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone E."
```

Option 2 — final review first (Wonder, high), then submission package:

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-wonder "Read AGENTS.md and docs/HANDOFF.md. Perform only the final review; report findings with severity and evidence, do not refactor."
```

Daniel-gated regardless: commit/push this work, Meta key for live Voice
proof, three consented WAVs, licence choice, screenshots, ≤3-minute demo
video. No form or terms submitted.

---

## Publication (28 Oct 2026, Asia/Singapore)

Daniel asked: create a GitHub repo, commit and push. Done:
`https://github.com/blurboy1985/grandmas-recipe-story` (public, `main`).

### Changed files (truthfulness fixes before publishing)

- `README.md`: status now Milestones A–C code-complete; `npm ci`; 36 tests /
  7 suites; lockfile pinned; Zod/OpenAI follow-ups marked done.
- `AGENTS.md`, `docs/PLAN.md`: phase/status/next-task lines now say A–C
  code-complete (C not live-proven), D next.
- This handoff: publication entry.

### Checks run (actual results)

- `tsc --noEmit`: pass. `lint`: pass (37 files). `node --test`: 36/36 pass.
- `next build`: pass (8 routes incl. extract + transcribe).
- Pre-commit review: no `.env` files; secret-pattern scan clean; `data/`,
  `node_modules/`, `.next/`, `.DS_Store`, `__pycache__` verified ignored;
  `tsconfig.tsbuildinfo` left untracked; staged 59 intended files only.
- Note: `gh` used the keyring login (the `GITHUB_TOKEN` env value was
  invalid, so it was unset for the `gh` call only; nothing printed).

### Remaining / next task

Start a new session with the Spark profile:

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone D."
```

Still outstanding: Milestone D; live Voice proof (transcribe smoke + three
consented WAVs + one full live flow); licence choice; screenshots; demo
video. No form or terms submitted.

---

## Milestone C complete (Spark session, 27 Oct 2026, Asia/Singapore)

Real Voice Transcribe flow over validated mono PCM WAVs. No live Meta calls made
in-session (sandbox: no key; network only reached the npm registry for install
checks — no registry packages were added).

### Changed / added files

- `src/server/meta-transcribe.ts` (new: multipart `request`/`audio` adapter to
  `POST https://api.meta.ai/v1/asr/transcribe`, bearer auth, 90 s timeout, safe
  codes, one bounded retry, injectable fetch; never logs keys/audio)
- `src/server/store.ts` (`transcriptionCacheKey` = recording SHA-256 + model +
  options version, `runningTranscriptions` dedup, `requestTranscription`:
  original audio kept, returned text fills the kept original transcript version
  with code-assigned segments; extraction still needs approval)
- `src/app/api/recipes/[id]/transcribe/route.ts` (new explicit paid-call route,
  nodejs runtime), `src/app/recipes/[id]/page.tsx` (Voice panel for live uploads
  only; cache-reuse/failure notes; truthful badge wording)
- `tests/transcription.test.ts` (10 tests, mocked fetch),
  `scripts/transcribe-smoke.mjs` (Daniel-gated live check; missing-key path
  verified exit 2, nothing sent)
- `README.md`, this handoff

### Checks run (actual results)

- `tsc --noEmit`: pass. `lint`: pass (37 files). `node --test`: 36/36 pass
  (16 Milestone A + 10 extraction + 10 transcription: cache hit, concurrent
  dedup, exact multipart schema, missing_key, bad_credentials, 429-retry,
  invalid_audio, empty refusal, sample-mode refusal, key stability).
- `next build`: pass (transcribe + extract routes listed; prerender intact).

### Limitations (truthful, not silent)

- Live Voice transcription NOT yet verified: Daniel-gated
  `scripts/transcribe-smoke.mjs` (hidden key + network + synthetic or
  consented WAV) is still outstanding, as are the three consented-recording
  evaluations (clear English, code-switched, noisy/local names) and one genuine
  full live flow (upload → transcribe → approve → extract). Until then,
  Milestone C is code-complete but not live-proven.
- No live browser click-through (sandbox blocks port binding); the Voice panel
  was verified at store/handler level plus build output.
- `audio.ts` validation still accepts 8–48 kHz (broader than the 16/24 kHz plan
  note); left unchanged to avoid breaking Milestone A fixtures — tighten in D
  if Wonder review requires it.

### Remaining / next task (fresh-session handoff for Milestone D)

Start a new session with the Spark profile (human selects the profile; files
never switch a running session):

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone D."
```

Scope for that session (Spark, medium): family evidence, persistence and print
per `docs/PLAN.md` Milestone D only. Do not start E.

Daniel-gated items (not the agent): Meta key for live calls (hidden prompt,
never in chat), three short consented WAVs (1–5 min, ≤20 MB, kept out of Git),
and one genuine full live flow before Milestone C is marked live-proven.
Milestones A+B stay green: typecheck, lint, 36 tests, build.

---

Updated 27 October 2026. Architecture finalized as documents only; no app
code, `package.json`, Git repo, or package installs were created.

---

## Milestone B complete (Spark session, 27 Oct 2026, Asia/Singapore)

Source-grounded extraction over approved transcripts. No live Meta calls made
in-session (sandbox: no registry, no key, no port binding).

### Changed / added files

- `src/server/extraction-schema.ts` (flat schema + versions + 8k token budget),
  `extraction-prompt.ts` (untrusted-data framing), `meta-extract.ts`
  (fetch adapter, safe codes, one bounded retry, injectable fetch)
- `src/server/validate.ts` (measurement rule; empty-story IDs allowed),
  `db.ts` (`usage_json` migration), `store.ts` (cache key, running dedup,
  `requestExtraction`, version history in detail)
- `src/app/api/recipes/[id]/extract/route.ts` (explicit paid-call route),
  `src/app/recipes/[id]/page.tsx` (extract/regenerate panel + versions)
- `tests/extraction.test.ts` (10 tests, mocked fetch), `scripts/extract-smoke.mjs`
  (Daniel-gated live check; missing-key path verified exit 2, nothing sent)
- `README.md`, this handoff

### Checks run (actual results)

- `tsc --noEmit`: pass. `lint`: pass (33 files). `node --test`: 26/26 pass
  (16 Milestone A + 10 extraction: cache hit, concurrent dedup, invalid IDs,
  retry-after-malformed, missing_key, measurement rule, injection-as-data,
  empty refusal, regenerate-preserves, key stability).
- `next build`: pass (extract route listed; home prerender intact).

### Limitations (truthful, not silent)

- Live Spark extraction VERIFIED 27 Oct 2026 (Daniel ran
  `scripts/extract-smoke.mjs`): `{"ok":true,"errors":[],"model":"muse-spark-1.3",
  "input_tokens":838,"output_tokens":6564,"total_tokens":7402}` — Chat
  Completions `response_format` accepts the union-type schema; output passed
  all grounding checks first try; 6564 output tokens fits the 8000 budget.
- Zod/OpenAI follow-up DONE (same session, network restored): `zod@4.6.7` +
  `openai@7.45.0` pinned; `extraction-schema.ts` is now a Zod source of truth
  with `z.toJSONSchema()` (`extraction-schema-v2`, `$schema` stripped);
  adapter uses the SDK pointed at Meta with typed errors, 90 s timeout, no
  SDK retries, and `RECIPE_REASONING_EFFORT` sent only when explicitly set.
  Static checks + 26/26 mocked tests + build pass. LIVE RE-VERIFIED 27 Oct
  2026 (Daniel ran `extract-smoke.mjs`): `{"ok":true,"errors":[],
  "model":"muse-spark-1.3","schema_version":"extraction-schema-v2",
  "input_tokens":838,"output_tokens":4768,"total_tokens":5606}` — Zod-derived
  schema accepted live, first try, no retry; 5 ingredients / 3 steps /
  2 clarifications this run.
- No live browser click-through (sandbox blocks port binding).

### Remaining / next task (fresh-session handoff for Milestone C)

Start a new session with the Spark profile (human selects the profile; files
never switch a running session):

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone C."
```

Scope for that session (Spark, medium): real Voice Transcribe flow over
validated mono PCM WAVs — exact multipart `request`/`audio` schema against
`https://api.meta.ai/v1/asr/transcribe`, hash/options cache, safe
timeout/401/403/429/invalid-audio handling, original audio + unedited
transcript preserved, edited-transcript approval before extraction. Verify
with three consented recordings and record corrections/limitations.
Do not start D or E.

Daniel-gated items (not the agent): Meta key for live calls (hidden prompt,
never in chat), three short consented WAVs (1–5 min, ≤20 MB, kept out of Git;
macOS `/usr/bin/afconvert` can convert — FFmpeg is only required for
Milestone E), and one genuine full live flow before Milestone C is marked
complete. Milestones A+B stay green: typecheck, lint, 26 tests, build.

---

## Milestone A complete (Spark session, 27 Oct 2026, Asia/Singapore)

Sample interface + storage implemented and verified. No live Meta calls.

### Changed / added files

- `package.json` (pinned: next 15.5.27, react/react-dom 19.3.0, typescript
  5.9.3, @types/node 22.20.5, @types/react/react-dom 19.3.0),
  `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `.env.example`
- `src/server/`: `segments.ts` (stable seg-IDs), `sample-fixture.ts`
  (fictional dish), `validate.ts` (grounding rules), `audio.ts` (WAV bytes),
  `db.ts` (`node:sqlite` + schema + crash recovery), `store.ts` (CRUD,
  approval, answers, corrections, review state, delete)
- `src/app/`: `layout.tsx`, `globals.css` (mobile + print), `page.tsx`
  (start/upload/list), `recipes/[id]/page.tsx` (full flow),
  `api/recipes[/[id]]`, `api/uploads`, `api/media/[id]` (all nodejs runtime)
- `samples/`: `README.md`, `sample-transcript.txt`, `sample-recipe.json`,
  `sample.wav` (2 s fictional tone, generated by `scripts/make-sample-wav.mjs`)
- `scripts/lint.mjs` (privacy/grounding guard), `tests/*.test.ts` (5 suites)
- `README.md` (Milestone A setup section)

### Checks run (actual results)

- `tsc --noEmit`: pass. `node scripts/lint.mjs`: pass (27 files).
- `node --test tests/*.test.ts`: 16 pass / 0 fail (segments, grounding
  incl. 4 negative cases, WAV incl. sample tone, sample/file consistency,
  SQLite save→edit→approve→answer→correct→review→reload→delete).
- `next build`: pass (6 routes; `/` prerender contains sample flow).
- Store-level end-to-end: sample create→draft_ready with 3 questions→answer→
  reviewed; 2-minute WAV validates (120000 ms)→manual card with no fake
  draft; media served from private `DATA_DIR`, never `public/`.

### Limitations (truthful, not silent)

- Sandbox DNS blocks the npm registry, so `npm install` could not run here;
  `package-lock.json` generated by Daniel via `npm install` on 27 Oct 2026
  and re-verified (`npm ls`, typecheck, lint, 16/16 tests, `next build` all
  pass). Zod/Vitest/Playwright/`server-only` deferred to B+.
- Sandbox blocks port binding, so no live `next start` browser click-through;
  journey verified at store level + static build output. Mobile/print
  verified by stylesheet + markup inspection only.
- No `git init`/commit made (publication is a separate Daniel step).

### Remaining / next task

Milestone B (Spark): server-only Spark extraction over approved text with
Zod→JSON Schema, source-ID validation, cache/dedup, semantic + injection
tests. Live Meta schema acceptance still unproven (architecture open Q).
Outstanding Daniel-only items: `npm install` (lockfile), Meta dashboard
routing check, FFmpeg install (E), Git init/publication review.

---

## This task (bounded architecture)

- Created `docs/ARCHITECTURE.md`: Next.js Node-runtime routes, server-only
  OpenAI-SDK-to-Meta client, Zod -> JSON Schema pipeline, `node:sqlite`
  behind a db adapter (better-sqlite3 rejected for now), private media,
  two-dimension state machine, paid-call triggers, grounding invariants,
  ~8,000 output-token start / one bounded retry, crash recovery, deletion.
- Finalized `docs/DATA_MODEL.md`: tables, cache keys, full flat
  non-recursive extraction JSON Schema and code-level evidence rules.
- Updated `docs/PLAN.md` (Architecture complete-docs-only; A-E not started)
  and `docs/MODEL_USAGE.md` (sanitized smoke: Spark + Voice HTTP 200 on
  2026-10-27T06:00:55Z; Codex routing still `not_verified`).
- Official docs checked 27 Oct 2026: Next.js route-segment config, OpenAI
  JS SDK `baseURL`/`apiKey`, Zod `z.toJSONSchema()`, Meta structured-output
  constraints, Node `node:sqlite`. URLs in `ARCHITECTURE.md`.
- This session's model/provider is not verified Muse routing; no such
  claim is made. Daniel's dashboard check remains outstanding.

## Checks run

- Doc consistency grep for model IDs, states, limits across the four docs.
- Markdown/link sanity by inspection. No app tests exist yet.

## Remaining / next task

Exit, then Spark for Milestone A only:

```zsh
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone A."
```

Outstanding Daniel-only items (later, not blocking A sample mode): Meta
dashboard usage/routing verification, FFmpeg install (Milestone E), Git
init/publication review.

---

## Prior history (setup)

Updated 27 October 2026. Guide read in full; current official OpenAI/Meta setup
pages fetched before configuration preparation. No app implementation has begun.
This session has not switched to Muse.

## Latest follow-up: recursive tool-schema compatibility

**Latest user confirmation:** Daniel reports that the corrected launcher now
works in his terminal. This is user-reported successful launch/inference, not an
independently inspected response, dashboard usage record or runtime API smoke
result. The next task is the bounded Wonder architecture session below. Check
the session's configured provider/model and Meta dashboard usage; retain the
separate text/audio smoke-test requirements. No app milestone has started.

**Latest correction:** Daniel's first launcher attempt failed locally with
`invalid transport` in `mcp_servers."computer-use"`. Reproduced: Codex treats
quotes in a CLI override path literally, creating a second server entry without
a transport. Fixed `scripts/muse-codex.py` to use bare names and refuse names that
cannot safely be represented (anything outside letters/digits/underscore/hyphen).
The initial isolated TOML checks did not establish how the real CLI parses paths.
Before the hidden key helper, every launch now runs the installed Codex
`mcp list --json` with the same overrides and requires all returned servers to be
disabled. No tools or model inference are started by this preflight; raw output
is never printed. Both Wonder and Spark pass real `--check`. Base config/profile
bytes remain unchanged. `docs/SETUP.md` documents the correction. Live Muse
inference was still pending at that check; Daniel's subsequent confirmation is
recorded above. No application milestone was started.

Daniel reported `Recursive JSON schemas are not currently supported` with
`param=parameters`. Current Meta documentation explicitly rejects recursive
`$ref` cycles in tool parameters on Responses and Chat Completions, including
when strict mode is off. The profiles inherit enabled MCP/plugins/apps from the
base config; an inherited schema is the leading cause, but the exact offending
tool has not been isolated. This is setup troubleshooting, not architecture or
an application milestone.

Both user profiles now exist and match the templates. Base config SHA256 remains
`c07b3cc65fbffebbd9352b8a2f49a82fe82d9fa1a5727870ea6a165cef99bace`.
The earlier installation blocker below is historical and superseded by this check.
No user config/profile was changed in this follow-up.

Changed files: new `scripts/muse-codex.py`; updated `README.md`, `docs/SETUP.md`,
`docs/PLAN.md` and this handoff. The launcher disables apps/plugins and all MCP
entries declared in base/profile/project config using per-process CLI overrides,
retains `--no-daemon`, and invokes the existing hidden key helper. It preserves
the selected profile, default provider, approval and sandbox settings. Normal
built-in coding tools remain; third-party tools are excluded from this process.

Initial isolated checks (superseded by the real CLI preflight above): MCP exclusion,
exact literal prompt argument, missing-profile refusal, no-prompt launch,
unchanged config/profile bytes and no security overrides. Installed Codex reports
`apps=false` and `plugins=false` with these flags. Real `--check` finds all three
configured MCP entries. Read-only `node_repl` discovery found four input schemas
with no `$ref`; no tool or database was used. CLI help established that strict
config validation is not supported by `codex features`; the non-strict flag-state
check passed. No authenticated request or live fix verification was performed.

Next: exit the failed session, launch a fresh Wonder process below, confirm a tiny
successful inference and actual provider/model routing, then perform only the
bounded architecture task. Do not resume the failed thread with old tool context.
If rejection persists, isolate the actual outgoing tool schemas; do not claim the
specific inherited tool is proven or silently change models/transports.

```zsh
python3 scripts/muse-codex.py grandma-wonder --check
python3 scripts/muse-codex.py grandma-wonder "Reply only SETUP_OK; do not run tools or start architecture."
```

After that succeeds, start the architecture command below in another new session.

## Completed and verified

- Checked macOS 27.0.1 arm64, zsh 5.9, Node 25.7.0, npm 11.21.1,
  Git 2.53.0, Codex CLI 0.164.0 and Python 3.14.3.
- Verified separate user profile format, current provider fields, Meta Responses
  endpoint/model IDs and current file-transcription contract. Sources: `SETUP.md`.
- Created guide-matching profile templates under `config/muse/`; no base config edits.
- Added safe profile installer, hidden zsh key helper and bounded dependency-free
  Node smoke runner. No key stored or printed.
- Verified installer with a temporary existing custom-provider config: base bytes
  and default provider preserved, idempotent installation, profile conflict refusal,
  inherited provider conflict refusal, mode 0600.
- Node syntax and zsh syntax checks passed. Initial smoke runner correctly reported
  missing key, zero requests, both NOT RUN and exit 1.
- Six isolated mocked smoke scenarios passed: success, auth, network, rate limit,
  incomplete output and empty voice; checked request counts, safe errors, report
  permissions and exact credential redaction. No network requests in those checks.
- Optional WAV input passed mocked valid/invalid-file checks; invalid audio caused
  no transcription upload. The key helper correctly refused noninteractive entry
  without a key. Final Node/zsh syntax checks passed.
- Markdown links and Git-ignore coverage passed in an isolated temporary repo.
- Original base config SHA256 remained
  `c07b3cc65fbffebbd9352b8a2f49a82fe82d9fa1a5727870ea6a165cef99bace`.

## Remaining setup blockers

The real user-level install returned a filesystem permission denial. This session
can write the project and temporary folders; `~/.codex` is outside that boundary.
Both user profiles are still absent at the last check. This is not an automatic
approval-review rejection. Run the prepared installer in Daniel's own terminal.

Neither `MODEL_API_KEY` nor `META_API_KEY` was available to the checked process.
No authenticated Meta request was attempted. The safe latest report is
`data/setup/meta-smoke-results.json` (ignored). A separate terminal export does
not update the old process environment. Do not request or print the key.

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/install-muse-profiles.py
zsh scripts/with-meta-key.zsh node scripts/meta-smoke.mjs
```

After the user runs these, read the sanitized report and report actual HTTP/model/
usage outcomes. Do not upgrade NOT RUN, mocked or sample results to success.
Dashboard credit balance and usage require Daniel's inspection. FFmpeg/ffprobe
are not installed on PATH. No Git repo/remote/publication exists yet.

A real local-only speech synthesis check returned zero audio data from macOS
`say`/`afconvert` in this session; validation correctly rejected it. If Daniel's
local terminal has the same issue, use the smoke script's `--audio` option with
a deliberately non-sensitive spoken WAV (≤20 seconds, ≤1 MB, mono 16-bit PCM
at 16/24 kHz). See `SETUP.md`. Do not confuse this local preparation failure
with a failed transcription API request.

## Next bounded architecture task, after restart

Start Wonder, high effort, with the installed profile and key:

```zsh
python3 scripts/muse-codex.py grandma-wonder "Read AGENTS.md and docs/HANDOFF.md. Complete only the next bounded architecture task; do not implement Milestone A yet."
```

Verify the new session's actual configured provider/model and a tiny successful
inference turn; inspect Meta dashboard usage. The model's self-description is
not routing evidence. Stop and diagnose catalog/discovery failures using current
official docs; do not silently ignore them or apply unrelated app-server fixes.

Finalize `PLAN.md`, `DATA_MODEL.md`, `MODEL_USAGE.md` and create
`ARCHITECTURE.md`. Specify the upload → transcript review → extraction →
clarification → saved-card workflow, source-grounded structured schema, SQLite/
private media design, evidence/version separation, cache/dedup invariants,
failure recovery/deletion and milestone acceptance checks. Use current library
docs before selecting dependencies. Do not install packages or implement A in
the architecture task. Existing data-model/plan files are seeds pending that review.

Then update this handoff, exit Wonder, and start Spark for Milestone A:

```zsh
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only Milestone A."
```

All A–E and final review are pending. Spark handles routine work; Wonder handles
architecture, hard debugging after two focused failed Spark attempts and final
review. Work sequentially with no additional agents. Verify before marking complete.

## Files prepared

- `AGENTS.md`, `.gitignore`, `README.md`.
- `config/muse/grandma-{spark,wonder}.config.toml` (templates).
- `scripts/install-muse-profiles.py`, `scripts/with-meta-key.zsh`, `scripts/meta-smoke.mjs`.
- `docs/SETUP.md`, `PLAN.md`, `DATA_MODEL.md`, `MODEL_USAGE.md`, `FEEDBACK.md`,
  `SUBMISSION.md`, `DEMO.md` and this handoff.
- Ignored `data/setup/meta-smoke-results.json`: setup diagnostic only.

Do not initialize another nested project folder; use the current
`/Users/danielquek/grandma-receipe-story` folder. Initialize Git and make intentional
commits when filesystem permissions permit. Inspect files before staging; keep
private recordings and secrets out of public materials.

Hackathon requirements remain Indie developer track, Build for Your World, public
GitHub source and an accessible ≤3-minute demo. Submission/demo drafts make no
working-app claims. Public repo, video, family review, licence choice and genuine
live evidence are outstanding. Daniel submits the form and accepts any terms;
the agent must not perform either action.
