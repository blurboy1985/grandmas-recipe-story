# Grandma's Recipe Story

A planned mobile-friendly app for preserving a short cooking recording as an
editable recipe and family story, with original audio and visible uncertainty.

**Status (27 Oct 2026): Milestones A–C are code-complete — sample flow,
Spark extraction, and Voice transcription. One live Spark extraction verified;
live Voice transcription not yet verified; no demo video yet.**

The implementation guide is
[Grandmas_Recipe_Story_Codex_Muse_Build_Guide.md](Grandmas_Recipe_Story_Codex_Muse_Build_Guide.md).
Start with [setup](docs/SETUP.md), [plan](docs/PLAN.md) and [handoff](docs/HANDOFF.md).

On Daniel's Mac, run in your own terminal:

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/install-muse-profiles.py
zsh scripts/with-meta-key.zsh node scripts/meta-smoke.mjs
```

The helper prompts for a Meta key without echoing or saving it. The smoke test
sends one short Spark request and, unless authentication fails, one synthetic
speech recording to Voice Transcribe. It records sanitized results in ignored
`data/setup/meta-smoke-results.json`. No family recording is required.

Then start the bounded architecture session:

```zsh
python3 scripts/muse-codex.py grandma-wonder "Read AGENTS.md and docs/HANDOFF.md. Complete only the next bounded architecture task; do not implement Milestone A yet."
```

Both profiles preserve the existing default provider. Creating files does not
change the running model. `--no-daemon` starts a separate CLI process rather than
attaching to the shared background server. Verify provider/model routing during
the new session and inspect Meta dashboard usage.

The launcher excludes inherited apps, plugins and configured MCP servers for this
Muse process to avoid Meta's recursive tool-schema rejection. It uses the hidden
key helper and leaves user configuration, approvals and sandbox settings intact.
See [the compatibility diagnosis](docs/SETUP.md#recursive-json-schema-error).

The hackathon scope is **Indie developer track / Build for Your World**, a public
GitHub repository, and an accessible video of at most three minutes.
[Submission preparation](docs/SUBMISSION.md) and [demo storyboard](docs/DEMO.md)
remain drafts until the app works and evidence is captured. No form or legal
terms will be submitted or accepted by the agent.

Screenshots, licence choice and demo links are still pending. Judges can run
the visibly labelled sample mode without credentials or Codex (see Milestone A
below).

---

## Milestone A app (sample mode, no key required)

Implemented 27 October 2026 (Spark session): start/consent, WAV upload with
byte-level validation, editable transcript with approval, fictional sample
draft with visible unknowns, at most three clarification answers, family
corrections, saved-card list/reopen/delete, private audio playback and a
print-friendly card. Saving is ordinary code, never a model call.

Run in your own terminal with network access (this sandbox has none):

```zsh
npm ci
cp .env.example .env   # defaults run sample mode; no keys needed
npm run dev            # http://localhost:3000
```

Checks (all passing in the implementation session):

```zsh
npm run typecheck
npm run lint           # offline project guard (privacy + grounding)
npm test               # node:test, 44 assertions across 8 suites
npm run build
```

Notes and limits: `package-lock.json` is pinned; install with `npm ci`. A live
server could not bind a port in the sandbox, so the journey was verified at
the store/handler level plus `next build` static output instead of a browser
click-through. Mobile/print layout was verified by stylesheet and markup
inspection only. Private runtime data stays in `DATA_DIR` (`./data/app`,
ignored); only the fictional `samples/` ships.

---

## Milestone B: grounded extraction (Spark, explicit paid call)

Implemented 27 October 2026: approving a transcript unlocks one explicit
Spark extraction (`POST /api/recipes/:id/extract`). Output is constrained by
a flat non-recursive JSON Schema (`src/server/extraction-schema.ts`) and
re-validated in code (segment-ID membership, null-quantity confirmation,
verbatim quotes, ≤3 questions, measurements flagged). Cache key = canonical
input hash + model + prompt/schema versions; concurrent calls share one
request; refresh/save/print/reopen never call the model. Regeneration inserts
a new version and keeps prior versions plus manual corrections. Missing keys
and live failures surface as visible safe codes — never silent sample fallback.

Mocked tests cover cache/dedup, retry, invalid IDs, injection-as-data,
measurement rule, empty-transcript refusal, and regeneration. The one live
Spark extraction is Daniel-gated (needs key + network):

```zsh
read -rs 'META_API_KEY?Meta app key (hidden): '; export META_API_KEY
node scripts/extract-smoke.mjs; unset META_API_KEY
```

Follow-ups done 27 Oct 2026: `zod@4.6.7` + `openai@7.45.0` pinned; the schema
is derived via `z.toJSONSchema()` (`extraction-schema-v2`) and the adapter
routes through the OpenAI SDK pointed at Meta; `response_format` acceptance
re-verified live.

## Milestone C: real transcription (Voice, explicit paid call)

Implemented 27 October 2026: validated mono PCM WAV uploads gain one explicit
Voice Transcribe call (`POST /api/recipes/:id/transcribe`). The adapter
(`src/server/meta-transcribe.ts`) posts the exact verified multipart schema —
`request` JSON (`model`/`audioEncoding`/`mode`) plus the `audio` WAV part — to
`https://api.meta.ai/v1/asr/transcribe` with bearer auth and a 90 s timeout.
Cache key = recording SHA-256 + model + options version; concurrent calls share
one request; refresh/save/print/reopen never call the model. The original audio
file is kept unchanged and the returned text fills the kept original transcript
version (segmented in code); extraction still requires approving a version.
Missing keys and live failures (401/403, 429 with one bounded retry, timeout,
invalid audio, empty output) surface as visible safe codes — never silent
sample fallback. Sample recipes cannot be transcribed.

Mocked tests cover cache/dedup, the multipart schema, missing-key/401/429/
invalid-audio/empty handling, and sample-mode refusal. The live Voice check is
Daniel-gated (needs key + network; uses synthetic speech unless `--audio` names
a non-sensitive WAV):

```zsh
read -rs 'META_API_KEY?Meta app key (hidden): '; export META_API_KEY
node scripts/transcribe-smoke.mjs [--audio /path/to/non-sensitive-short.wav]; unset META_API_KEY
```

## Milestone D: family evidence, persistence and print

Implemented 28 October 2026: answers and corrections are stored as separate
family evidence with provenance and timestamps, and any new answer,
correction, or transcript edit returns the draft to `draft` until re-reviewed
(`confirmed` still means family-reviewed, never proven fact). Regeneration
warns that AI-generated fields may change while keeping all versions, answers,
and corrections. Delete removes rows, media files, and cache entries in one
transaction (failed file deletions tombstone for retry); staged uploads are
discarded if creation fails and swept with tombstones on startup. Print CSS
hides interactive sections for browser Print / Save as PDF. Save/reopen,
delete, original-audio playback, and print were verified at store/handler
level plus `next build` output, a 14-check live HTTP smoke, and a
headless-Chrome pass (mobile/desktop screenshots, print-to-PDF,
print-media emulation with zero overflow at 390px).
