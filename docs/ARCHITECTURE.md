# Architecture — finalized for Milestone A entry

Checked 27 October 2026 against current official docs. This document finalizes
choices for the local MVP. It does not implement Milestone A.

## Stack decisions

| Concern | Decision | Rationale / rejected alternative |
| --- | --- | --- |
| App | Next.js App Router + TypeScript, one Node process | Guide stack; server routes need filesystem/audio. Next.js Route Segment Config documents `runtime = 'nodejs' | 'edge'` with `'nodejs'` as default [S1]. Set `export const runtime = 'nodejs'` explicitly on media, upload, transcription and extraction routes so intent survives defaults/config changes. Edge runtime rejected for these routes. |
| Meta client | OpenAI JS SDK, server-only, explicitly `new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: process.env.META_BASE_URL ?? 'https://api.meta.ai/v1' })` | SDK supports custom `apiKey`/`baseURL` configuration [S2]. Installing the SDK does not select Meta; explicit base URL does. `META_API_KEY` never uses a `NEXT_PUBLIC_` prefix and is never imported by client components. Separate `MODEL_API_KEY` is only for Codex profiles. |
| Validation / schema | One Zod schema as source of truth; derive the request JSON Schema with Zod's `z.toJSONSchema()` [S3]; validate the response again with the same Zod schema plus code checks | Avoids drift between request schema and validator. Emit a flat, non-recursive schema (inline/reused definitions, no cycles) because Meta rejects recursive `$ref` cycles in tool parameters and schema constraints must be checked live in Milestone B [S4]. Additional code checks (not expressible in JSON Schema alone): every `source_segment_ids` value belongs to the approved transcript version; at most 3 clarifications; quantity rules below. |
| Database | SQLite via built-in `node:sqlite` (`Database`; `DatabaseSync` is its deprecated alias on current Node) behind a server-only repository adapter in `src/server/db/` | Local Node is 25.7.0; Node history records v25.7.0 making SQLite a release candidate and v23.4.0/v22.13.0 removing the `--experimental-sqlite` flag [S5]. Zero native build keeps the solo local MVP simple. `better-sqlite3` is the rejected-for-now alternative: mature, but adds a native dependency and Next.js bundling/external-package verification. The adapter boundary is the swap point if the Milestone A spike shows bundling or stability problems; no repository caller depends on driver types. Pin Node >= 22.13 in Milestone A and re-verify. |
| Media | Private files under `DATA_DIR` (outside `public/`), served only via controlled Node routes | Family media must not be statically public. Routes check recording ID, consent state and file containment before streaming. |
| Tests (Milestone A+) | Vitest for unit/validation, Playwright for the sample journey | Named as intent only; verify current setup docs at implementation time. Not installed in this task. |

Sources checked 27 Oct 2026: S1 Next.js Route Segment Config
(https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config);
S2 OpenAI JS SDK README custom `baseURL`/`apiKey`
(https://github.com/openai/openai-node); S3 Zod JSON Schema `z.toJSONSchema()`
(https://zod.dev/json-schema); S4 Meta structured-output schema constraints
(https://dev.meta.ai/docs/structured-output#stay-within-schema-constraints);
S5 Node.js SQLite (https://nodejs.org/api/sqlite.html). Meta transcription
contract sources are already listed in `docs/SETUP.md`.

## Module boundaries

- `src/server/meta/` — transcription + extraction adapters; only place that
  reads `META_API_KEY`; returns typed results or safe error codes, never raw
  provider bodies to the client.
- `src/server/db/` — SQLite adapter + repositories; only place with SQL.
- `src/server/media/` — path resolution under `DATA_DIR`, byte/duration
  validation, streaming, deletion.
- `src/server/recipes/` — segment assignment, hashing/canonicalization,
  cache/dedup, state-transition guards, evidence validation.
- `src/app/api/` — thin Node-runtime route handlers calling the above.
- Client components never receive keys, absolute paths, or raw transcripts
  beyond what the current user flow displays.

## Server-controlled workflow

```text
Start/consent -> Upload WAV (+ optional dish photo)
  -> Transcript review (original vs edited; approve a version)
  -> Extraction (explicit, only from approved version)
  -> Draft -> Clarification (<=3) / family corrections
  -> Saved card (recipe, story, original audio playback, print)
  -> List / reopen / delete
```

Two independent state dimensions (never conflated):

1. **Job processing state** (server-set only):
   `uploaded -> transcribing -> transcript_ready -> extracting -> draft_ready`,
   or `failed` from `transcribing`/`extracting`. `failed` returns to the
   prior stable state on explicit user retry (`transcript_ready` or
   `uploaded`); retry is a new explicit action, never automatic paid fallback.
2. **Recipe review state**: `draft -> reviewed_with_unknowns -> confirmed`,
   and back to `draft` when evidence changes. A click never asserts factual
   truth; `confirmed` means "family reviewed", unknowns remain visible.

Transcript approval is data, not a job state: `approved_transcript_version_id`
on the job. Extraction requires it non-null. Editing a transcript creates a
new version and clears approval until re-approved.

### Who may trigger paid calls

| Action | Paid call? |
| --- | --- |
| Upload, validate bytes/duration, save | No |
| Transcribe button (validated recording, cache miss) | Yes — Voice model, once per cache key |
| Approve transcript, edit transcript, add notes | No |
| Extract button (approved version, cache miss, none running) | Yes — Spark, once per cache key |
| Refresh, reopen, save, print, play audio, delete | Never |
| Explicit regenerate | Yes — new recipe version; preserves prior versions and manual edits |
| Retry after failure | Only via the same explicit Transcribe/Extract buttons |

Missing key or live failure is shown as such. There is no silent fallback to
sample data; sample mode is an explicit `APP_MODE=sample` UI state.

## Grounding invariants

- Segment IDs (`seg-01`, `seg-02`, ...) are assigned in code per transcript
  version, in order, before any model call. The model may only cite IDs from
  the approved version; unknown IDs reject the whole extraction result.
- Preserve source wording. Missing quantity => `quantity_text: null` plus
  `original_words` with the vague wording and `needs_confirmation: true`.
  Never invent quantities, ingredients, timestamps, temperatures or history.
- Empty source story => story with empty paraphrase and no quotes.
- Generated story prose is labelled a paraphrase. Exact quotes are stored
  separately and only shown if the quoted string matches the segment text
  verbatim (code-verified).
- A dish photo is presentation by default and is not recipe evidence.
- Transcripts, notes and uploaded content are untrusted data, never
  instructions. Extraction uses no tools and no web search.
- Original transcript, edited versions, family answers, manual corrections
  and generated versions are stored separately (see `DATA_MODEL.md`).
  Conflicting evidence is surfaced for confirmation, not merged silently.

## Cost and reliability controls

- Start near 8,000 total output tokens for extraction; at most one bounded
  retry for malformed/truncated output or transient provider failure.
  Reasoning counts against output budget. No hidden Wonder fallback.
- Cache: transcription by recording-bytes hash + model/options version;
  extraction by canonical hash of approved transcript + notes + answers +
  model + prompt version + schema version. Edits change the hash (invalidate);
  refresh/save/print do not. A unique running-request guard per cache key
  deduplicates concurrent paid calls in the single process (also persisted
  as a DB uniqueness constraint so a restart cannot double-run a key marked
  running without recovery review).

## Failure recovery and deletion

- On process start, any job left in `transcribing`/`extracting` is moved to
  `failed` with safe code `interrupted` and its running-cache guard cleared;
  the user retries explicitly. Partial files go to a temp area and are only
  promoted on validated completion; startup sweeps stale temp artifacts.
- Provider/validation failures keep prior stable data intact; a failed
  extraction never overwrites a good recipe version.
- Delete (user-confirmed): delete child rows (corrections, clarifications,
  recipe versions, transcript versions, cache entries) and the recording row
  in one transaction, then delete original/converted media and temp files.
  If file deletion fails, record a tombstone and retry on startup sweep;
  the UI no longer lists the recipe. Paths are always resolved inside
  `DATA_DIR`; no user-controlled path is ever used.

## Audio limits (app-level, stricter than provider)

Supported mono PCM WAV only, 1–5 minutes, at most 20 MB. Validate actual
bytes (header/format) and duration in code, not the file extension or
browser-reported type. Browser recording/conversion is Milestone E only.

## Open questions (do not block Milestone A sample mode)

- Live Meta JSON Schema (`response_format`) acceptance of the derived schema
  must be proven in Milestone B; extraction has not been live-tested.
- Whether `node:sqlite` bundles cleanly under the pinned Next.js version —
  Milestone A spike; swap adapter to `better-sqlite3` if it fails.
- Exact prompt wording and semantic test fixtures — Milestone B.
- Hosting with persistent disk — deferred; local MVP first.

