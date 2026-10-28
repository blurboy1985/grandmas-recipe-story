import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerLocal, applyExtractionLocal, applyTranscriptionLocal, approveTranscriptLocal,
  correctLocal, createSampleLocal, createUploadLocal, editTranscriptLocal,
  extractionInputLocal, reviewLocal, toDetail, toListItem,
} from "../src/lib/local-recipes.ts";
import { SAMPLE_RECIPE } from "../src/server/sample-fixture.ts";

test("sample card is created locally with a grounded draft", () => {
  const rec = createSampleLocal({ cookName: "Mei", consent: true }, null);
  const detail = toDetail(rec);
  assert.equal(detail.mode, "sample");
  assert.equal(detail.processingState, "draft_ready");
  assert.equal(detail.approvedVersionId, detail.originalTranscript?.id);
  assert.ok(detail.draft);
  assert.equal(detail.clarifications.length, SAMPLE_RECIPE.clarifications.length);
  assert.equal(toListItem(rec).dishName, detail.dishName);
});

test("sample creation requires consent and a cook name", () => {
  assert.throws(() => createSampleLocal({ cookName: "Mei", consent: false }, null), /consent/);
  assert.throws(() => createSampleLocal({ cookName: " ", consent: true }, null), /cook/);
});

test("editing a transcript clears approval and resets review", () => {
  const rec = createSampleLocal({ cookName: "Mei", consent: true }, null);
  reviewLocal(rec, "confirmed");
  editTranscriptLocal(rec, "Beat three eggs. Add tomatoes.");
  assert.equal(rec.approvedVersionId, null);
  assert.equal(rec.drafts[0].reviewState, "draft");
  assert.throws(() => extractionInputLocal(rec), /approve/);
  const edited = rec.editedTranscripts.at(-1);
  assert.ok(edited);
  approveTranscriptLocal(rec, edited.id);
  const input = extractionInputLocal(rec);
  assert.equal(input.segments.length, 2);
});

test("transcription replaces the original and clears its approval", () => {
  const rec = createUploadLocal({ cookName: "Mei", dishName: "Soup", consent: true }, new Blob(["x"]));
  applyTranscriptionLocal(rec, "Boil water. Add noodles.");
  assert.equal(rec.processingState, "transcript_ready");
  approveTranscriptLocal(rec, rec.originalTranscript!.id);
  applyTranscriptionLocal(rec, "Boil water. Add rice.");
  assert.equal(rec.approvedVersionId, null);
  assert.match(rec.originalTranscript!.text, /rice/);
});

test("blank clarification answers are rejected, answers reset review", () => {
  const rec = createSampleLocal({ cookName: "Mei", consent: true }, null);
  const c = rec.clarifications[0];
  assert.throws(() => answerLocal(rec, c.id, "   "), /empty/);
  reviewLocal(rec, "confirmed");
  answerLocal(rec, c.id, "Half a teaspoon.");
  assert.equal(rec.clarifications[0].provenance, "family");
  assert.equal(rec.drafts[0].reviewState, "draft");
});

test("corrections are stored separately and extraction validates grounding", () => {
  const rec = createSampleLocal({ cookName: "Mei", consent: true }, null);
  correctLocal(rec, "ingredients[salt]", "1/2 teaspoon");
  assert.equal(rec.corrections.length, 1);
  const before = rec.drafts.length;
  applyExtractionLocal(rec, SAMPLE_RECIPE, "muse-spark-1.3");
  assert.equal(rec.drafts.length, before + 1);
  assert.equal(rec.drafts[0].model, "muse-spark-1.3");
  assert.throws(
    () => applyExtractionLocal(rec, {
      ...SAMPLE_RECIPE,
      ingredients: [{ ...SAMPLE_RECIPE.ingredients[0], source_segment_ids: ["seg-99"] }],
    }, "muse-spark-1.3"),
    /grounding/,
  );
});
