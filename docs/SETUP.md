# Environment and Muse setup

Checked 27 October 2026, Singapore time. This is a record of actual local checks;
documentation verification is separate from authenticated API access.

| Item | Observed result |
| --- | --- |
| OS / architecture | macOS 27.0.1, build 26A434, Darwin arm64 |
| Login shell | `/bin/zsh` |
| Shell version | zsh 5.9 (arm64-apple-darwin26.0) |
| Node.js | v25.7.0 |
| npm | 11.21.1 |
| Git | 2.53.0 |
| Codex CLI | 0.164.0 |
| Python | 3.14.3; includes `tomllib` |
| FFmpeg / ffprobe | Not found on PATH; needed for later media validation/conversion |
| macOS synthetic audio tools | `/usr/bin/say` and `/usr/bin/afconvert` found |
| GitHub CLI | `/opt/homebrew/bin/gh` found; authentication not checked |
| Project Git repository | Not initialized |
| Base Codex model | `gpt-6.1-sol`, high effort |
| Base provider setting | Unset; official default is `openai` |
| Existing grandma profiles / grandma_meta provider | None found |
| MODEL_API_KEY / META_API_KEY | Neither available to the checked process |

The CLI emitted a PATH-alias creation permission warning inside this restricted
session; its version and help commands completed. No CLI or Node upgrade was
applied. Check framework support before pinning the app's Node/package versions.

## Official documentation verification

Fetched current official pages before preparing profiles:

- [OpenAI advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced): Codex 0.134.0+ loads `~/.codex/<name>.config.toml` as a layer above base user configuration. Project config cannot redirect providers. Use separate top-level profile files.
- [OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): checked model/provider keys, `env_key`, `wire_api`, context/compaction settings, `requires_openai_auth` and `supports_websockets`.
- [Meta coding agents](https://dev.meta.ai/docs/coding-agents): checked Codex Responses transport, `https://api.meta.ai/v1`, bearer environment authentication, exact Spark/Wonder IDs and 1,048,576-token context.
- [Meta quickstart](https://dev.meta.ai/docs/quickstart) and [Responses protocol](https://dev.meta.ai/docs/protocols/responses): checked direct text smoke request.
- [Meta models](https://dev.meta.ai/docs/models) and [reasoning](https://dev.meta.ai/docs/reasoning): checked `muse-spark-1.3`, `muse-wonder-1.0`, and medium/high effort. Standard model IDs are used.
- [Meta file transcription reference](https://dev.meta.ai/docs/api-reference/voice/transcribe), [speech guide](https://dev.meta.ai/docs/speech-to-text) and [voice schemas](https://dev.meta.ai/docs/api-reference/voice/schemas): checked multipart `request`/`audio`, exact endpoint/model, WAV settings and response transcript field.

These pages establish the configuration/API contract; they do not establish
account access, successful requests, remaining credits or actual coding routing.
Recheck docs when implementing each integration. Pricing is not independently
revalidated for this setup task; guide estimates must not be treated as measured spend.

## Install profiles without changing defaults

Templates are in `config/muse/` and exactly follow section 5 of the guide.
Spark uses medium effort; Wonder uses high. Both use provider `grandma_meta`,
Responses, `MODEL_API_KEY`, a 1M context and a 200,000-token compaction threshold.
That threshold is a project choice. Approval and sandbox settings are inherited.

The session's writable folders exclude `~/.codex`. A real installation attempt
returned a filesystem permission denial. **User-level installation is pending.**
No approval-review rejection occurred; this was a filesystem restriction.

Run in your own local terminal:

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/install-muse-profiles.py
```

The installer creates `~/.codex/grandma-spark.config.toml` and
`~/.codex/grandma-wonder.config.toml` with mode 0600. It never edits `config.toml`,
refuses differing existing profiles/provider conflicts, and can be rerun safely.
It uses the existing `CODEX_HOME` location if one is already configured; it does
not change that variable. `--config-dir` is available for isolated checks.

The original base config SHA256 was:

```text
c07b3cc65fbffebbd9352b8a2f49a82fe82d9fa1a5727870ea6a165cef99bace
```

It remained unchanged after the denied installation attempt and server restart.
No unrelated credentials or complete config contents were printed or copied.

## Provide the key securely

Create a key in the [Meta dashboard](https://dev.meta.ai/) using your own account.
Check access, credits and available spending controls yourself. Do not paste
the key in this conversation. Do not enter it as a literal shell command, store
it in the repository or add it to shell startup files for this setup.

The preferred helper disables shell tracing/verbose output and reads hidden input:

```zsh
zsh scripts/with-meta-key.zsh node scripts/meta-smoke.mjs
```

The key is passed in the environment only to that command; it is not saved by
the helper. The next command can prompt again. Exporting a key in a separate
terminal does not update this already-running session's environment.

If you prefer one terminal session that retains the key until you unset it,
these commands match your actual zsh shell (the guide's `read -p` example is Bash):

```zsh
unsetopt XTRACE VERBOSE
read -rs 'MODEL_API_KEY?Meta API key (hidden): '
print
export MODEL_API_KEY
node scripts/meta-smoke.mjs
# Later, when finished with that terminal session:
unset MODEL_API_KEY
```

Never run `echo "$MODEL_API_KEY"`, `env`, `set`, verbose HTTP tracing, or commands
that place a bearer key in process arguments. The helper/smoke script does not
load `.env` files. The future app will use the separate server-only variable
`META_API_KEY`; a separate runtime key is preferable for tracking and revocation.

## Minimal live checks and actual results

`node scripts/meta-smoke.mjs` performs at most two requests, without retries:

1. Spark Responses: exact short acknowledgement, medium effort, 1024 total output
   tokens maximum. Check completion status and returned model metadata.
2. Voice Transcribe: a few seconds of macOS synthetic speech, validated mono,
   16-bit PCM WAV at 16 kHz. No personal audio. Authentication failure in the
   first call skips the second. Temporary audio is removed afterward.

The script reports HTTP status, elapsed time, safe model identifiers and numeric
usage where returned. It never dumps request headers, keys, raw errors or full
responses. It checks the expected acknowledgement and records whether expected
speech words were found. Voice API success with nonempty text is an access
check, not a transcription quality benchmark.

Actual recorded run at `2026-10-27T05:44:47.677Z`:

| Check | Actual result |
| --- | --- |
| Spark | NOT RUN: `MODEL_API_KEY_missing` |
| Voice Transcribe | NOT RUN: `MODEL_API_KEY_missing` |
| Live requests attempted | 0 |
| Smoke process exit | 1 (setup incomplete) |
| Codex inference through Muse | Not verified |
| Dashboard usage / credits | Not checked |

Safe results are in ignored `data/setup/meta-smoke-results.json`. Rerun after
entering a key. A missing-key result is not an API error or an API success.
For HTTP 401/403 check the key/account access; for 429 inspect limits rather than
looping. For network/TLS errors inspect connectivity without disabling TLS.
If output is incomplete, record that result before choosing another budget.

A separate local-only audio check found that `say`/`afconvert` returned a WAV
with zero audio data in this session (including explicit Samantha/Fred voices).
The validator rejected it; no audio upload occurred. This does not establish
whether speech synthesis works in your unrestricted local terminal. If it also
fails there, use a deliberately non-sensitive short spoken sample:

```zsh
zsh scripts/with-meta-key.zsh node scripts/meta-smoke.mjs --audio /absolute/path/to/non-sensitive-short.wav
```

Replace that path with an actual file. Smoke limits are 20 seconds and 1 MB,
mono 16-bit PCM WAV at 16/24 kHz. This optional command sends that selected audio
to Meta; do not choose private family audio. The script does not log its path
or transcript. The smoke limit is deliberately smaller than the app's limit.

Local verification also passed six mocked request scenarios (success, auth,
network, rate limit, incomplete output, empty voice), bounded call counts and
credential-redaction checks. Mock reports were isolated in temporary folders.
Installer preservation/conflict checks, Markdown links and Git-ignore coverage
passed. These checks do not establish live access.

## Restart with the correct profile

Architecture comes next, so start Wonder in a new process:

```zsh
cd /Users/danielquek/grandma-receipe-story
python3 scripts/muse-codex.py grandma-wonder "Read AGENTS.md and docs/HANDOFF.md. Complete only the next bounded architecture task; do not implement Milestone A yet."
```

The launcher also accepts an already exported key through the hidden helper.
For an interactive session without an initial prompt:

```zsh
python3 scripts/muse-codex.py grandma-wonder
```

Inspect the new session's provider/model information and Meta dashboard usage.
A successful direct API call does not prove Codex routing. Complete one tiny
coding-harness request and check its actual outcome. Do not ignore catalog errors
or infer the provider from the model's own answer. Do not apply an app-server
catalog workaround unless current docs and an observed error justify it.

After architecture, update the handoff, exit Wonder, and start routine work with:

```zsh
python3 scripts/muse-codex.py grandma-spark "Read AGENTS.md and docs/HANDOFF.md. Implement and verify only the current milestone."
```

Starting these profiles never changes the default provider in base configuration.
This setup session has not switched to Muse.

## Recursive JSON schema error

Follow-up checked 27 October 2026. Both user profiles now exist and match the
repository templates. The base config hash still matches the original. Earlier
installation-pending statements above describe the previous session.

Reported error: `Recursive JSON schemas are not currently supported`, parameter
`parameters`. [Meta's schema constraints](https://dev.meta.ai/docs/structured-output#stay-within-schema-constraints)
reject recursive `$ref` cycles in function-tool parameters on both Responses and
Chat Completions, regardless of `strict`. Switching transport or setting
`strict=false` does not address this constraint.

The profiles inherit user MCP/plugin configuration. This Mac has configured
`sqlite`, `node_repl` and disabled `computer-use` MCP entries, enabled plugins,
and app integrations enabled by default. An inherited tool is the leading cause;
the exact offending tool has **not** been isolated. A read-only `node_repl`
`tools/list` check found no `$ref` in its four input schemas. No tool was executed
and no database or auth file was read.

`scripts/muse-codex.py` supplies per-process `--disable apps --disable plugins`
and `mcp_servers.<name>.enabled=false` overrides for servers declared in the base
config, selected profile and this project's config. These use the installed CLI's
feature flags and [documented MCP settings](https://learn.chatgpt.com/docs/config-file/config-reference).
Codex CLI paths use bare server names here: literal TOML quotes create a different
server entry and cause `invalid transport`. The first launcher version had this
bug. It is corrected for names containing letters, digits, underscores and
hyphens; other names are refused safely. Before requesting a key, the launcher
now runs the real CLI's `mcp list --json` with its exact overrides and checks that
all returned servers are disabled. Raw output is captured privately and never
printed because it may include credential-bearing configuration.

The launcher retains the selected model, provider, approval policy and sandbox;
it does not edit profiles or base settings. Built-in coding tools remain available.
Third-party tools must be checked for schema compatibility before re-enabling.

Validate locally without a key or model request:

```zsh
python3 scripts/muse-codex.py grandma-wonder --check
```

Then exit the failed session and launch a **new** process using the command above.
Start with a tiny acknowledgement and verify the provider/model and dashboard
usage before the architecture task. Do not resume a failed thread with old tool
context. No successful live Muse inference is claimed by this workaround.

The earlier isolated TOML/argument checks missed the CLI's literal-quote behavior.
Follow-up reproduced `invalid transport` with the old quoted override and verified
that the corrected overrides parse successfully in the installed Codex CLI.
Both profiles pass the real `--check` preflight with all returned MCP servers
disabled. No key or paid request was used. Live Muse inference remains unverified.
The base config SHA256 remains unchanged.
