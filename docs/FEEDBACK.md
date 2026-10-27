# Observed feedback

| Date | Surface / model | Expected | Actual observation | Action / limit |
| --- | --- | --- | --- | --- |
| 2026-10-27 | Codex CLI 0.164.0 | Separate user profile support | Installed help and official docs agree on `<name>.config.toml` | Templates created; installation to user config denied by session filesystem boundary |
| 2026-10-27 | Profile installer, local synthetic config | Preserve existing provider/settings | Base bytes preserved; repeat install safe; collisions refused; mode 0600 | Local filesystem verification, not inference evidence |
| 2026-10-27 | Spark / Voice smoke runner | Live access check once key exists | Key missing; 0 requests; both NOT RUN; exit 1 | User terminal key entry and rerun pending |
| 2026-10-27 | Smoke runner, mocked transport | Bounded safe success/failure reporting | Six scenarios passed: success, auth, network, rate, incomplete text, empty voice; exact credential redacted | No network requests; not Meta reliability evidence |
| 2026-10-27 | macOS local speech tools | Generate nonempty synthetic speech WAV | Zero audio data produced in this session; validation rejected it | User terminal may differ; optional non-sensitive WAV input added; no audio uploaded |

No model-quality, dialect-support, latency, cost, dashboard-credit or runtime
reliability claims have been established. Add dated real observations after testing:
exact model, permitted case, expected vs actual, human correction, workaround,
safe usage/timing and a specific improvement request. Never add family content
without permission for a public feedback record.
