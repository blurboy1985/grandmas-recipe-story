// Server-only Voice Transcribe adapter. Reads META_API_KEY at call time;
// never imported by client components. Returns typed results or safe error
// codes, never raw provider bodies or credentials.
// Contract verified 27 Oct 2026 (docs/SETUP.md): POST multipart
// https://api.meta.ai/v1/asr/transcribe with `request` (JSON:
// model/audioEncoding/mode) and `audio` (WAV bytes) parts, bearer auth,
// JSON response carrying the transcript field.
export type FetchImpl = typeof fetch;

export const TRANSCRIBE_MODEL_DEFAULT = "muse-voice-transcribe-1.0";
export const TRANSCRIBE_OPTIONS_VERSION = "transcribe-options-v1";
const TRANSCRIBE_TIMEOUT_MS = 90_000;

export interface TranscribeUsage { model: string; optionsVersion: string; latencyMs: number; requestId: string | null; }
export interface TranscribeSuccess { ok: true; transcript: string; usage: TranscribeUsage; retried: boolean; }
export interface TranscribeFailure { ok: false; code: string; detail: string; retried: boolean; }
export type TranscribeResult = TranscribeSuccess | TranscribeFailure;

function baseUrl(): string {
  return process.env.META_BASE_URL || "https://api.meta.ai/v1";
}

function safeRequestId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v) ? v : null;
}

export async function transcribeAudio(
  bytes: Uint8Array,
  opts?: { model?: string; fetchImpl?: FetchImpl; filename?: string }
): Promise<TranscribeResult> {
  const key = process.env.META_API_KEY;
  if (!key) return { ok: false, code: "missing_key", detail: "META_API_KEY is not set. Live transcription needs a key; sample mode stays available.", retried: false };
  if (!bytes.length) return { ok: false, code: "invalid_audio", detail: "Empty audio.", retried: false };
  const model = opts?.model || process.env.TRANSCRIBE_MODEL || TRANSCRIBE_MODEL_DEFAULT;
  const runFetch: FetchImpl = opts?.fetchImpl ?? fetch;
  const filename = opts?.filename || "recording.wav";
  let retried = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify({ model, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
    const copy = new Uint8Array(bytes);
    form.append("audio", new Blob([copy.buffer as ArrayBuffer], { type: "audio/wav" }), filename);
    const start = Date.now();
    let res: Response;
    try {
      res = await runFetch(`${baseUrl()}/asr/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
    } catch (e: unknown) {
      const name = (e as { name?: string }).name ?? "";
      const isTimeout = name === "TimeoutError" || name === "AbortError";
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: isTimeout ? "timeout" : "network_error", detail: isTimeout ? "Transcription timed out after one retry." : "Network error during transcription after one retry.", retried };
    }
    const latencyMs = Date.now() - start;
    const usage: TranscribeUsage = { model, optionsVersion: TRANSCRIBE_OPTIONS_VERSION, latencyMs, requestId: safeRequestId(res.headers?.get("x-request-id")) };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: "bad_credentials", detail: "The key was rejected (401/403). Check META_API_KEY.", retried };
    }
    if (res.status === 429) {
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: "rate_limited", detail: "Rate limited (429) after one retry.", retried };
    }
    if (res.status === 400 || res.status === 413 || res.status === 422) {
      return { ok: false, code: "invalid_audio", detail: `The audio was rejected (HTTP ${res.status}). Re-check the WAV format.`, retried };
    }
    if (!res.ok) {
      if (attempt === 0 && res.status >= 500) { retried = true; continue; }
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: "provider_error", detail: `Transcription failed (HTTP ${res.status}) after one retry.`, retried };
    }
    let payload: unknown;
    try { payload = await res.json(); } catch {
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: "invalid_output", detail: "Transcription response was not valid JSON after one retry.", retried };
    }
    const transcript = (payload as { transcript?: unknown }).transcript;
    if (typeof transcript !== "string" || !transcript.trim()) {
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: "empty_transcript", detail: "Transcription returned no usable text after one retry.", retried };
    }
    return { ok: true, transcript: transcript.trim(), usage, retried };
  }
  return { ok: false, code: "provider_error", detail: "Exhausted retries.", retried: true };
}
