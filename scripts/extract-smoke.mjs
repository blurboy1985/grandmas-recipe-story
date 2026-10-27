#!/usr/bin/env node
// Daniel-gated live check (Milestone B): one bounded Spark extraction over the
// FICTIONAL sample transcript, validated with the app's own grounding rules.
// Prints only safe metadata (model, usage counts, latency, validation result).
// Never prints the key, transcript content, or model output.
// Run locally with a hidden key, e.g.:
//   read -rs 'META_API_KEY?Meta app key (hidden): '; export META_API_KEY
//   node scripts/extract-smoke.mjs; unset META_API_KEY
import { readFileSync } from "node:fs";

const key = process.env.META_API_KEY;
if (!key) { console.error("META_API_KEY is not set; nothing was sent."); process.exit(2); }

const { assignSegments } = await import("../src/server/segments.ts");
const { SAMPLE_TRANSCRIPT_TEXT } = await import("../src/server/sample-fixture.ts");
const { buildExtractionMessages } = await import("../src/server/extraction-prompt.ts");
const { extractRecipe } = await import("../src/server/meta-extract.ts");
const { validateRecipeDraft } = await import("../src/server/validate.ts");

const segments = assignSegments(SAMPLE_TRANSCRIPT_TEXT);
const { system, user } = buildExtractionMessages(segments, "Smoke Dish (fictional)", []);
const started = Date.now();
const result = await extractRecipe(system, user, {});
if (!result.ok) {
  console.log(JSON.stringify({ ok: false, code: result.code, retried: result.retried, elapsed_ms: Date.now() - started }));
  process.exit(1);
}
const check = validateRecipeDraft(result.output, segments);
const out = result.output;
console.log(JSON.stringify({
  ok: check.ok,
  errors: check.errors.slice(0, 5),
  model: result.usage.model,
  prompt_version: result.usage.promptVersion,
  schema_version: result.usage.schemaVersion,
  input_tokens: result.usage.inputTokens,
  output_tokens: result.usage.outputTokens,
  total_tokens: result.usage.totalTokens,
  latency_ms: result.usage.latencyMs,
  retried: result.retried,
  ingredients: out.ingredients?.length ?? null,
  steps: out.steps?.length ?? null,
  clarifications: out.clarifications?.length ?? null,
  elapsed_ms: Date.now() - started,
}));
process.exit(check.ok ? 0 : 1);
