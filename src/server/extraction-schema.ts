import { z } from "zod";

// Zod is the single source of truth: this schema validates responses, and
// the request JSON Schema is derived from it via z.toJSONSchema().
const segId = z.string().regex(/^seg-[0-9]{2,}$/);

const ingredient = z.object({
  name: z.string().min(1),
  quantity_text: z.string().nullable(),
  original_words: z.string(),
  source_segment_ids: z.array(segId).min(1),
  needs_confirmation: z.boolean(),
}).strict();

const step = z.object({
  instruction: z.string().min(1),
  source_segment_ids: z.array(segId).min(1),
  needs_confirmation: z.boolean(),
}).strict();

const quote = z.object({
  text: z.string().min(1),
  source_segment_id: segId,
}).strict();

const story = z.object({
  paraphrase: z.string().describe("Empty string when the source has no story. Always displayed labelled as a paraphrase."),
  source_segment_ids: z.array(segId),
  quotes: z.array(quote),
}).strict();

const clarification = z.object({
  question: z.string().min(1),
  related_field: z.string().min(1),
  source_segment_ids: z.array(segId),
}).strict();

export const ExtractionSchema = z.object({
  dish_name: z.string().nullable().describe("Null if the source never names the dish."),
  ingredients: z.array(ingredient),
  steps: z.array(step),
  story,
  clarifications: z.array(clarification).max(3),
}).strict();

export type ExtractionOutput = z.infer<typeof ExtractionSchema>;

// Flat, non-recursive by construction (no recursive $refs). The $schema
// keyword is stripped: strict response_format schemas reject it.
const derived = z.toJSONSchema(ExtractionSchema) as Record<string, unknown>;
const { $schema: _dropped, ...withoutMeta } = derived;
void _dropped;
export const EXTRACTION_JSON_SCHEMA = withoutMeta;

export const SCHEMA_VERSION = "extraction-schema-v2";
export const PROMPT_VERSION = "extraction-prompt-v1";
export const EXTRACTION_MODEL_DEFAULT = "muse-spark-1.3";
export const MAX_OUTPUT_TOKENS = 8000;
