# Model roles and evidence

Prepared 27 October 2026; tooling updated 28 October 2026. **All Muse usage
below is planned unless explicitly recorded as successful.** Coding and app
inference are independent budgets.

| Context | Exact model | Role | Current evidence |
| --- | --- | --- | --- |
| Muse routine work | muse-spark-1.3, medium | UI, adapters, focused checks, docs and fixes | Used for Milestones A–D implementation sessions (Daniel-selected sessions); dashboard routing not independently verified |
| Muse architecture/review | muse-wonder-1.0, high | Architecture, difficult debugging, final review | Architecture session 27 Oct 2026; final review + vintage redesign 28 Oct 2026 (`docs/REVIEW.md`) |
| App transcription | muse-voice-transcribe-1.0 | One transcription per unique recording/options | Direct API smoke passed 27 Oct 2026: HTTP 200, synthetic macOS speech WAV (mono 16-bit PCM 16 kHz, 3.277 s), expected words present. Not family-audio or quality evidence, and the app flow itself is not yet live-proven. See sanitized `data/setup/meta-smoke-results.json` (ignored, local only) |
| App extraction | muse-spark-1.3, medium | Approved text → sourced recipe/story/questions | LIVE-VERIFIED 27 Oct 2026 via `scripts/extract-smoke.mjs` (Daniel run): ok:true, 0 errors, 838 in / 6564 out / 7402 total tokens, 5 ingredients / 3 steps / 3 questions, no retry. Re-verified 27 Oct 2026 on Zod-derived schema-v2 (Daniel run): ok:true, 838 in / 4768 out / 5606 total, no retry. Prior Spark text smoke (HTTP 200) still stands. |
| App Wonder retry | muse-wonder-1.0 | Optional explicit difficult retry only if justified | Not planned for initial runtime; not used |
| Translation / decorative images | Optional future work | Approved text translation / decorative cover | Not implemented; not used |

Coding now runs in **Muse**: Daniel starts each session with the model
above (Spark medium by default; Wonder high for architecture/review). Model
switching means starting a new session; a model's self-description is not
routing proof, and dashboard usage remains Daniel's check. The earlier Codex
setup (user profiles + `scripts/muse-codex.py`, 27 Oct 2026) is legacy: it
worked around Meta's recursive tool-schema rejection, and those files remain
in the repo as history only.

The app uses server-only `META_API_KEY` with the explicit Meta base URL,
Chat Completions JSON Schema for extraction, and `/asr/transcribe` for audio.
Installing the OpenAI client library does not choose the service provider;
requests must explicitly target Meta. Never put either key in a client bundle.

A sanitized smoke report (`data/setup/meta-smoke-results.json`, checked
2026-10-27T06:00:55Z, 2 live requests) records Spark HTTP 200 (usage 16 in /
379 out / 395 total) and Voice HTTP 200. Direct API success does not prove
coding-harness routing; do not use self-description as proof.

Use Standard model IDs. No contributor variant, automatic Wonder fallback, web
search, SAM, self-hosted model or synthetic narration is needed for the MVP.
The smoke script's synthetic speech is only a non-personal test input, not an app
feature or a family recording.

Record safe usage, latency, model IDs and version hashes once observed. Do not
log source content or secrets. Published estimates in the guide are not measured
costs; reasoning counts against output budgets. Avoid unnecessary calls.
