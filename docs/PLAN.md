# Implementation plan

Initial plan derived from the supplied guide, 27 October 2026. **Architecture finalized 27 October 2026 (see `docs/ARCHITECTURE.md`).** Milestones A–D are code-complete (C not live-proven); Wonder final review completed 28 October 2026 (see `docs/REVIEW.md`). See `docs/HANDOFF.md` for the latest state.

Tooling note (28 Oct 2026): this project now uses **Muse** instead of
Codex. The human starts each session with the intended model (Spark 1.3
medium for routine work, Wonder 1.0 high for architecture/review). The old
Codex profiles and `scripts/muse-codex.py` launcher — built around Meta's
recursive tool-parameter schema rejection — are legacy history; see
`docs/SETUP.md`.

The product promise is to preserve what the relative actually said and make
uncertainty visible. The required journey is upload → transcript review → recipe
and story draft → clarification/correction → saved card with original audio.

| Phase | Coding model (Muse) | Status | Required evidence before completion |
| --- | --- | --- | --- |
| Setup | — | Complete | Versions/docs checked; genuine text/audio smoke results recorded |
| Architecture | Wonder high | Complete (docs only) | `ARCHITECTURE.md` + finalized `DATA_MODEL.md`/`MODEL_USAGE.md`: state machine, extraction JSON Schema, SQLite/media design, cache/dedup, recovery/deletion, open questions recorded |
| A: sample interface | Spark medium | Code-complete | No-key flow, persistent save/reopen, playback/print, mobile review, typecheck/build |
| B: grounded extraction | Spark medium | Code-complete, live-verified once | Real text request, validated sources/schema, semantic cases, cache/dedup checks |
| C: transcription | Spark medium | Code-complete, not live-proven | Validated real WAV flow and failure handling, three recording evaluations |
| D: clarify/save/print | Spark medium | Code-complete | Versioned family answers/corrections, visible unknowns, reopen/delete/playback/print |
| E: browser recording | Spark; Wonder if stuck | Optional, not started | Only after A–D pass; conversion and Safari/iPhone + Chrome checks |
| Final review | Wonder then Spark fixes | Complete 28 Oct 2026 | `docs/REVIEW.md`: two Medium + three Low findings fixed with regression tests; live-flow/family/fresh-clone gates remain Daniel-owned |
| Submission package | Wonder review, Spark edits | Drafts prepared | Public repo, accessible ≤3-minute video, truthful implemented-feature claims |

## Next bounded task: see HANDOFF

Final review is done. Next is the submission package (Daniel-gated items:
licence, screenshots, demo video, live Voice proof), or optional Milestone E
(browser recording; needs FFmpeg, HTTPS phone setup, Safari/iPhone + Chrome
checks) if Daniel chooses it first.

Use one Node.js process, Next.js TypeScript, server routes, SQLite and media on
private persistent disk. Server audio/filesystem routes require the Node runtime.
Use the OpenAI SDK as a client explicitly configured for Meta. Do not add accounts,
payments, public recipes, queues or distributed services. A host must support
persistent disk; temporary serverless files are insufficient.

## Milestone A: sample interface and storage

Build start/consent, short-WAV upload, transcript review, draft review,
clarification, saved card and recipe list. Use an intentionally public fictional
sample with visible sample-mode labeling. Retain original and edited transcripts.
Support private media playback, persistent saves and print layout. Show progress
and recoverable failure states. Saving is ordinary code, never a paid AI call.

Add exact README app setup, `.env.example`, a pinned lockfile and scripts for
typecheck, lint, meaningful tests and build. Choose compatible current versions.
Verify the full no-key sample journey, reload persistence and mobile layout.
Inspect intended public files before staging. Planned commit:
`feat: add sample recipe capture and review flow`.

## Milestone B: source-grounded extraction

Begin with pasted, approved text. Assign stable segment IDs before a single
server-only Spark request. Verify current Meta Chat Completions JSON Schema
support, constrain output and validate with Zod plus source-ID membership checks.
Return ingredients, original quantity wording (unknown → null), steps, attributed
story paraphrase and at most three questions. No source story → empty story.
Conflicting transcript/user notes must be surfaced. Photo contents are not recipe
evidence by default. Record only safe model/usage/version metadata.

Cache by approved input hash, model and prompt/schema versions; deduplicate
running jobs. Refresh/save/manual edits are free of model calls. Use a measured
output budget (guide starts near 8000 total tokens), at most one bounded retry
for relevant malformed/truncated or transient failures, and visible final errors.

Verify missing salt quantities, empty stories, conflicting timings, nonsense input,
prompt-injection text, invalid source IDs, caching and concurrent duplicate requests.
Separate mocked tests from real API evidence. Planned commit:
`feat: generate sourced recipe drafts with Muse Spark`.

## Milestone C: real transcription

Validate actual RIFF/WAVE PCM, mono, 16-bit, 16/24 kHz, duration and file/request
size; do not trust MIME/extension. App limits: 1–5 minutes, 20 MB; provider
limits documented separately. Use the exact current multipart schema, hash/options
cache and safe timeout/401/403/429/invalid-audio handling. Preserve original audio
and unedited transcript. Require edited-transcript approval before extraction.
Do not repeat successful transcription on refresh.

Evaluate clear English, supported-language code-switching, and noisy/local-name
audio with permission. Record actual transcription corrections and limitations.
Do not claim dialect support without evidence. Planned commit:
`feat: transcribe family recordings with Meta Voice`.

## Milestone D: family evidence, persistence and print

Store answers and field edits as separate evidence. Explicit regeneration creates
a new version and warns about generated-field changes; never silently overwrite
manual edits. Unknowns remain visible. Verify save/reopen, delete (rows, media,
cache and temporary files), original audio playback and browser Print/Save as PDF.
Review status is not a proof of factual accuracy. Planned commit:
`feat: preserve family corrections and printable recipe cards`.

## Optional milestone E

Only after A–D pass: microphone MIME detection, five-minute timer and preview;
safe FFmpeg conversion through argument arrays with UUID temp paths, timeout,
limits and cleanup, preserving the original. Test Safari on iPhone and Chrome;
keep upload fallback. Secure context is required. Translation and decorative
cover generation are optional, explicit, cached requests with truthful labels.
Cut optional scope first if the schedule slips.

## Review and release gates

Wonder reviews concrete evidence with severity and file references: grounding,
unknowns, source validity, secret exposure, consent, media validation/deletion,
cost/retry limits, persistence and reproducibility. Spark applies focused fixes.
Require at least three meaningful reference cases, one family-reviewed recipe,
one genuine complete live flow, and separate no-key sample mode.

Run documented typecheck/lint/tests/build, complete the sample flow manually,
and verify a fresh clone using `npm ci`. Check persistence after restart and
confirm browser bundles/staged files contain no credentials or personal assets.
Record what actually ran; a small passing set does not establish universal accuracy.

Prepare the README, architecture/model-usage docs, known limitations, deliberate
licence choice, feedback, public repository and three-minute demo. Check repository
and video access while signed out. Final claims must match observed behavior.
The agent must not submit the entry or accept terms.

After every phase, update `docs/HANDOFF.md` with files, checks, failures, remaining
work and the next bounded task. Switch profiles by restarting, never by assertion.
