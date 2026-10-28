# Grandma's Recipe Story

A planned mobile-friendly app for preserving a short cooking recording as an
editable recipe and family story, with original audio and visible uncertainty.

**Status (28 Oct 2026): Milestones A–D are code-complete — sample flow,
Spark extraction, Voice transcription, and family evidence/print. Wonder
final review done (see [review](docs/REVIEW.md)); the interface now wears a
vintage recipe-box design. One live Spark extraction verified; live Voice
transcription not yet verified; no demo video yet.**

The implementation guide is
[Grandmas_Recipe_Story_Codex_Muse_Build_Guide.md](Grandmas_Recipe_Story_Codex_Muse_Build_Guide.md)
(now the Muse playbook; filename kept for link stability).
Start with [setup](docs/SETUP.md), [plan](docs/PLAN.md) and [handoff](docs/HANDOFF.md).

Development happens in **Muse**: Daniel starts each session from the
project folder with the model the task needs — Muse Spark 1.3 (medium) for
routine work, Muse Wonder 1.0 (high) for architecture and review — then
opens with "Read AGENTS.md and docs/HANDOFF.md" plus one bounded task. Model
switching means starting a new session. See [setup](docs/SETUP.md).

For the optional live API smoke (Daniel's terminal, hidden key prompt):

```zsh
cd /Users/danielquek/grandma-receipe-story
zsh scripts/with-meta-key.zsh node scripts/meta-smoke.mjs
```

The helper prompts for a Meta key without echoing or saving it. The smoke test
sends one short Spark request and, unless authentication fails, one synthetic
speech recording to Voice Transcribe. It records sanitized results in ignored
`data/setup/meta-smoke-results.json`. No family recording is required.

The older Codex profiles and `scripts/muse-codex.py` launcher (27 Oct 2026)
are legacy history — they worked around Meta's recursive tool-schema
rejection; see [the compatibility diagnosis](docs/SETUP.md#legacy-recursive-json-schema-error-codex-era-27-oct-2026).

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
npm test               # node:test, 47 tests across 9 suites
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

## Final review + vintage recipe-box design (28 Oct 2026)

The Wonder final review ([docs/REVIEW.md](docs/REVIEW.md)) checked grounding,
unknowns, source validity, secrets, media validation/deletion, cost/retry
limits and persistence. Two Medium findings (tombstone sweep under the
default relative `DATA_DIR`; re-transcription inheriting approval) and three
Low findings were fixed, each with a regression test that failed first.

The interface was also redesigned as a vintage recipe box: aged index cards
with ruled lines and ring holes, sepia ink, rubber-stamp mode badges and
hand-lettered accents — system font stacks only, so it works offline, and
the print view stays a clean card. Development now runs in Muse
(Spark medium / Wonder high); the Codex-era setup is legacy history in
[docs/SETUP.md](docs/SETUP.md).
