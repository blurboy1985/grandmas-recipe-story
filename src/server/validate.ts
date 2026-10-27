import type { Segment } from "./segments.ts";
import { segmentMap } from "./segments.ts";
import type { SampleRecipe } from "./sample-fixture.ts";

export interface RecipeDraft {
  dish_name: string | null;
  ingredients: { name: string; quantity_text: string | null; original_words: string; source_segment_ids: string[]; needs_confirmation: boolean }[];
  steps: { instruction: string; source_segment_ids: string[]; needs_confirmation: boolean }[];
  story: { paraphrase: string; source_segment_ids: string[]; quotes: { text: string; source_segment_id: string }[] };
  clarifications: { question: string; related_field: string; source_segment_ids: string[] }[];
}

const SEG_PATTERN = /^seg-[0-9]{2,}$/;
// A step stating a measurement the cited segments never state must stay
// visibly unconfirmed; it is never silently asserted as fact.
const MEASUREMENT = /(\d+\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?|°\s*[cf]|degrees\s*(celsius|fahrenheit|c|f))|\d+\s*°\s*[cf])/i;
const HAS_DIGIT = /\d/;

export function validateRecipeDraft(draft: unknown, segments: Segment[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const known = segmentMap(segments);
  const d = draft as RecipeDraft;
  if (!d || typeof d !== "object") return { ok: false, errors: ["draft must be an object"] };
  if (d.dish_name !== null && (typeof d.dish_name !== "string" || !d.dish_name.trim())) errors.push("dish_name must be a string or null");
  if (!Array.isArray(d.ingredients)) errors.push("ingredients must be an array");
  if (!Array.isArray(d.steps)) errors.push("steps must be an array");
  if (!d.story || typeof d.story !== "object") errors.push("story must be an object");
  if (!Array.isArray(d.clarifications)) errors.push("clarifications must be an array");
  else if (d.clarifications.length > 3) errors.push("at most 3 clarification questions");

  const checkIds = (ids: unknown, where: string, allowEmpty = false) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      if (!allowEmpty) errors.push(`${where}: at least one source_segment_id required`);
      return;
    }
    for (const id of ids) {
      if (typeof id !== "string" || !SEG_PATTERN.test(id)) { errors.push(`${where}: bad segment id ${String(id)}`); continue; }
      if (!known.has(id)) errors.push(`${where}: unknown segment id ${id}`);
    }
  };

  if (Array.isArray(d.ingredients)) {
    d.ingredients.forEach((ing, i) => {
      const where = `ingredients[${i}]`;
      if (!ing || typeof ing.name !== "string" || !ing.name.trim()) errors.push(`${where}: name required`);
      if (ing.quantity_text !== null && (typeof ing.quantity_text !== "string" || !ing.quantity_text.trim())) errors.push(`${where}: quantity_text must be a string or null`);
      if (typeof ing.original_words !== "string" || !ing.original_words) errors.push(`${where}: original_words required`);
      if (ing.quantity_text === null && ing.needs_confirmation !== true) errors.push(`${where}: null quantity requires needs_confirmation=true`);
      checkIds(ing.source_segment_ids, where);
    });
  }
  if (Array.isArray(d.steps)) {
    d.steps.forEach((s, i) => {
      const where = `steps[${i}]`;
      if (!s || typeof s.instruction !== "string" || !s.instruction.trim()) errors.push(`${where}: instruction required`);
      checkIds(s.source_segment_ids, where);
      if (typeof s.instruction === "string" && MEASUREMENT.test(s.instruction)) {
        const cited = (Array.isArray(s.source_segment_ids) ? s.source_segment_ids : [])
          .map((id: string) => known.get(id) ?? "").join(" ");
        if (!HAS_DIGIT.test(cited) && (s as { needs_confirmation: unknown }).needs_confirmation !== true) {
          errors.push(`${where}: measurements absent from cited segments require needs_confirmation=true`);
        }
      }
    });
  }
  if (d.story && typeof d.story === "object") {
    if (typeof (d.story as { paraphrase: unknown }).paraphrase !== "string") errors.push("story.paraphrase must be a string");
    checkIds((d.story as { source_segment_ids: unknown }).source_segment_ids ?? [], "story", true);
    const quotes = (d.story as { quotes: unknown }).quotes;
    if (!Array.isArray(quotes)) errors.push("story.quotes must be an array");
    else {
      quotes.forEach((q, i) => {
        const qq = q as { text: string; source_segment_id: string };
        if (typeof qq.text !== "string" || !qq.text) { errors.push(`story.quotes[${i}]: text required`); return; }
        if (typeof qq.source_segment_id !== "string" || !SEG_PATTERN.test(qq.source_segment_id)) { errors.push(`story.quotes[${i}]: bad segment id`); return; }
        const segText = known.get(qq.source_segment_id);
        if (segText === undefined) { errors.push(`story.quotes[${i}]: unknown segment id`); return; }
        if (segText !== qq.text) errors.push(`story.quotes[${i}]: quote must match segment text verbatim`);
      });
    }
    const hasStorySource = Array.isArray((d.story as { source_segment_ids: unknown }).source_segment_ids) &&
      ((d.story as unknown as { source_segment_ids: string[] }).source_segment_ids.length > 0);
    if (!hasStorySource && ((d.story as unknown as { paraphrase: string }).paraphrase !== "" || (quotes as unknown[]).length !== 0)) {
      errors.push("story: empty source requires empty paraphrase and no quotes");
    }
  }
  if (Array.isArray(d.clarifications)) {
    d.clarifications.forEach((c, i) => {
      const cc = c as { question: string; related_field: string; source_segment_ids: string[] };
      if (typeof cc.question !== "string" || !cc.question.trim()) errors.push(`clarifications[${i}]: question required`);
      if (typeof cc.related_field !== "string" || !cc.related_field.trim()) errors.push(`clarifications[${i}]: related_field required`);
      checkIds(cc.source_segment_ids ?? [], `clarifications[${i}]`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function sampleFixtureIsValid(segments: Segment[], recipe: SampleRecipe): boolean {
  return validateRecipeDraft(recipe, segments).ok;
}
