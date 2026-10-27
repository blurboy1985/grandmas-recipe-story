// Server-only Spark extraction adapter (OpenAI SDK explicitly pointed at
// Meta). Reads META_API_KEY at call time; never imported by client
// components. Returns typed results or safe error codes, never raw provider
// bodies.
import OpenAI from "openai";
import { EXTRACTION_JSON_SCHEMA, MAX_OUTPUT_TOKENS, PROMPT_VERSION, SCHEMA_VERSION } from "./extraction-schema.ts";

export type FetchImpl = typeof fetch;

export interface ExtractUsage { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; latencyMs: number; requestId: string | null; model: string; promptVersion: string; schemaVersion: string; }
export interface ExtractSuccess { ok: true; output: unknown; usage: ExtractUsage; retried: boolean; }
export interface ExtractFailure { ok: false; code: string; detail: string; retried: boolean; }
export type ExtractResult = ExtractSuccess | ExtractFailure;

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

function baseUrl(): string {
  return process.env.META_BASE_URL || "https://api.meta.ai/v1";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function extractRecipe(
  system: string,
  user: string,
  opts?: { model?: string; fetchImpl?: FetchImpl }
): Promise<ExtractResult> {
  const key = process.env.META_API_KEY;
  if (!key) return { ok: false, code: "missing_key", detail: "META_API_KEY is not set. Live extraction needs a key; sample mode stays available.", retried: false };
  const model = opts?.model || process.env.RECIPE_MODEL || "muse-spark-1.3";
  const effort = process.env.RECIPE_REASONING_EFFORT;
  const client = new OpenAI({
    apiKey: key,
    baseURL: baseUrl(),
    timeout: 90_000,
    maxRetries: 0, // one bounded retry below, with full result typing
    fetch: opts?.fetchImpl ?? fetch,
  });
  let retried = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    try {
      const { data, response } = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "recipe_extraction", strict: true, schema: EXTRACTION_JSON_SCHEMA as Record<string, unknown> },
        },
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(effort && EFFORTS.has(effort) ? { reasoning_effort: effort as "medium" } : {}),
      }).withResponse();
      const latencyMs = Date.now() - start;
      const text = data.choices?.[0]?.message?.content ?? "";
      const finish = data.choices?.[0]?.finish_reason;
      if (finish === "length" || !text) {
        if (attempt === 0) { retried = true; continue; }
        return { ok: false, code: "truncated", detail: "Output was truncated even after one retry.", retried };
      }
      let output: unknown;
      try { output = JSON.parse(text); } catch {
        if (attempt === 0) { retried = true; continue; }
        return { ok: false, code: "invalid_output", detail: "Model output was not valid JSON after one retry.", retried };
      }
      return {
        ok: true, output, retried,
        usage: {
          inputTokens: num(data.usage?.prompt_tokens),
          outputTokens: num(data.usage?.completion_tokens),
          totalTokens: num(data.usage?.total_tokens),
          latencyMs,
          requestId: response.headers?.get("x-request-id"),
          model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION,
        },
      };
    } catch (e: unknown) {
      if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
        return { ok: false, code: "bad_credentials", detail: "The key was rejected (401/403). Check META_API_KEY.", retried };
      }
      if (e instanceof OpenAI.RateLimitError) {
        if (attempt === 0) { retried = true; continue; }
        return { ok: false, code: "rate_limited", detail: "Rate limited (429) after one retry.", retried };
      }
      if (e instanceof OpenAI.APIConnectionError || e instanceof OpenAI.APIConnectionTimeoutError || e instanceof OpenAI.InternalServerError) {
        if (attempt === 0) { retried = true; continue; }
        const code = e instanceof OpenAI.InternalServerError ? "provider_error" : e instanceof OpenAI.APIConnectionTimeoutError ? "timeout" : "network_error";
        return { ok: false, code, detail: "Network, timeout, or provider error after one retry.", retried };
      }
      if (attempt === 0) { retried = true; continue; }
      return { ok: false, code: "provider_error", detail: "Provider error after one retry.", retried };
    }
  }
  return { ok: false, code: "provider_error", detail: "Exhausted retries.", retried: true };
}
