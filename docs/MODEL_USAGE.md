# Model roles and evidence

Prepared 27 October 2026. **All Muse usage below is planned unless explicitly
recorded as successful.** Coding and app inference are independent.

| Context | Exact model | Role | Current evidence |
| --- | --- | --- | --- |
| Codex routine work | muse-spark-1.3, medium | UI, adapters, focused checks, docs and fixes | Profile template prepared; user installation/routing pending |
| Codex architecture/review | muse-wonder-1.0, high | Architecture, difficult debugging, final review | Profile template prepared; user installation/routing pending |
| App transcription | muse-voice-transcribe-1.0 | One transcription per unique recording/options | Direct API smoke passed 27 Oct 2026: HTTP 200, synthetic macOS speech WAV (mono 16-bit PCM 16 kHz, 3.277 s), expected words present. Not family-audio or quality evidence. See sanitized `data/setup/meta-smoke-results.json` (ignored, local only) |
| App extraction | muse-spark-1.3, medium | Approved text → sourced recipe/story/questions | LIVE-VERIFIED 27 Oct 2026 via `scripts/extract-smoke.mjs` (Daniel run): ok:true, 0 errors, 838 in / 6564 out / 7402 total tokens, 5 ingredients / 3 steps / 3 questions, no retry. Re-verified 27 Oct 2026 on Zod-derived schema-v2 (Daniel run): ok:true, 838 in / 4768 out / 5606 total, no retry. Prior Spark text smoke (HTTP 200) still stands. |
| App Wonder retry | muse-wonder-1.0 | Optional explicit difficult retry only if justified | Not planned for initial runtime; not used |
| Translation / decorative images | Optional future work | Approved text translation / decorative cover | Not implemented; not used |

This setup work ran in the pre-existing session. No claim is made that it used
Muse Spark or Wonder. Base Codex configuration selected `gpt-6.1-sol`; creating
profile files does not establish the active session model.

Codex profiles use Meta Responses at `https://api.meta.ai/v1` and `MODEL_API_KEY`.
The future app uses server-only `META_API_KEY`, the same explicit Meta base URL,
Chat Completions JSON Schema for extraction, and `/asr/transcribe` for audio.
Installing the OpenAI client library does not choose the service provider;
requests must explicitly target Meta. Never put either key in a client bundle.

A later sanitized smoke report (`data/setup/meta-smoke-results.json`, checked
2026-10-27T06:00:55Z, 2 live requests) records Spark HTTP 200 (usage 16 in /
379 out / 395 total) and Voice HTTP 200. Direct API success does not prove
Codex routing: `codex_routing` remains `not_verified` and dashboard usage
requires Daniel's check. Do not use self-description as proof.

Use Standard model IDs. No contributor variant, automatic Wonder fallback, web
search, SAM, self-hosted model or synthetic narration is needed for the MVP.
The smoke script's synthetic speech is only a non-personal test input, not an app
feature or a family recording.

Record safe usage, latency, model IDs and version hashes once observed. Do not
log source content or secrets. Published estimates in the guide are not measured
costs; reasoning counts against output budgets. Avoid unnecessary calls.
