import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, readdirSync, unlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

before(() => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "grs-evidence-"));
  // Dummy key for mocked-fetch tests only; no network call is ever made.
  process.env.META_API_KEY = "test-dummy-key-never-sent";
});

function jsonResponse(payload: unknown): Response {
  const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

function validOutput() {
  return {
    dish_name: "Test Soup",
    ingredients: [{ name: "water", quantity_text: null, original_words: "some water", source_segment_ids: ["seg-01"], needs_confirmation: true }],
    steps: [{ instruction: "Boil the water.", source_segment_ids: ["seg-01"], needs_confirmation: false }],
    story: { paraphrase: "", source_segment_ids: [], quotes: [] },
    clarifications: [{ question: "How much water?", related_field: "ingredients[water]", source_segment_ids: ["seg-01"] }],
  };
}

function okTranscript(text: string): Response {
  return new Response(JSON.stringify({ transcript: text, model: "muse-voice-transcribe-1.0" }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function makeFullDraft(): Promise<{ store: typeof import("../src/server/store.ts"); jobId: string }> {
  const store = await import("../src/server/store.ts");
  const bytes = new Uint8Array(64);
  const staged = store.stageUpload(bytes, "t.wav");
  const { id } = store.createUploadRecipe(
    { uploadId: staged.uploadId, cookName: "T", dishName: "Evidence Stew", consent: true },
    { durationMs: 120000, byteSize: 64, sha256: `ev-${Math.random()}` }
  );
  await store.requestTranscription(id, { fetchImpl: (async () => okTranscript("Boil some water for soup.")) as typeof fetch });
  const d0 = store.getRecipeDetail(id);
  store.approveTranscript(id, d0!.originalTranscript!.id);
  await store.requestExtraction(id, { fetchImpl: (async () => jsonResponse(validOutput())) as typeof fetch });
  return { store, jobId: id };
}

describe("family evidence (milestone D)", () => {
  it("records answers as family evidence for regeneration", async () => {
    const { store, jobId } = await makeFullDraft();
    const q = store.getRecipeDetail(jobId)!.clarifications[0].id;
    store.answerClarification(jobId, q, "About two cups.");
    const d = store.getRecipeDetail(jobId)!;
    assert.equal(d.clarifications[0].answer, "About two cups.");
    assert.equal(d.clarifications[0].provenance, "family");
    assert.ok(d.clarifications[0].answeredAt);
    const input = store.extractionInputFor(jobId);
    assert.ok(input.notes.some((n) => n.text === "About two cups."));
  });

  it("returns a reviewed draft to draft when an answer is added", async () => {
    const { store, jobId } = await makeFullDraft();
    store.setReviewState(jobId, "confirmed");
    const q = store.getRecipeDetail(jobId)!.clarifications[0].id;
    store.answerClarification(jobId, q, "Two cups.");
    assert.equal(store.getRecipeDetail(jobId)?.draft?.reviewState, "draft");
  });

  it("returns a reviewed draft to draft when a correction is added", async () => {
    const { store, jobId } = await makeFullDraft();
    store.setReviewState(jobId, "reviewed_with_unknowns");
    store.addCorrection(jobId, "ingredients[water]", "2 cups");
    assert.equal(store.getRecipeDetail(jobId)?.draft?.reviewState, "draft");
  });

  it("returns a reviewed draft to draft when the transcript is edited", async () => {
    const { store, jobId } = await makeFullDraft();
    store.setReviewState(jobId, "confirmed");
    store.editTranscript(jobId, "Boil some water for soup, then rest it.");
    const d = store.getRecipeDetail(jobId)!;
    assert.equal(d.draft?.reviewState, "draft");
    assert.equal(d.approvedVersionId, null);
  });

  it("deletes rows, media files, cache entries, and staged files", async () => {
    const { store, jobId } = await makeFullDraft();
    const dbm = await import("../src/server/db.ts");
    const db = dbm.getDb();
    const d = store.getRecipeDetail(jobId)!;
    const refs = [d.originalTranscript!.id, d.draft!.id];
    const audioPath = store.mediaPathFor(jobId, "audio")!;
    assert.ok(existsSync(audioPath));
    const cacheBefore = db.prepare(`SELECT COUNT(*) AS n FROM model_cache WHERE result_ref IN ('${refs[0]}','${refs[1]}')`).get() as { n: number };
    assert.equal(cacheBefore.n, 2);
    store.deleteRecipe(jobId);
    assert.equal(store.getRecipeDetail(jobId), null);
    assert.equal(existsSync(audioPath), false);
    const cacheAfter = db.prepare(`SELECT COUNT(*) AS n FROM model_cache WHERE result_ref IN ('${refs[0]}','${refs[1]}')`).get() as { n: number };
    assert.equal(cacheAfter.n, 0);
    const tmpDir = join(process.env.DATA_DIR!, "tmp-uploads");
    assert.deepEqual(existsSync(tmpDir) ? readdirSync(tmpDir) : [], []);
  });

  it("tombstones missing media on delete and clears it on sweep", async () => {
    const store = await import("../src/server/store.ts");
    const dbm = await import("../src/server/db.ts");
    const { id } = store.createSampleRecipe({ cookName: "T", consent: true });
    const audioPath = store.mediaPathFor(id, "audio")!;
    unlinkSync(audioPath);
    store.deleteRecipe(id);
    const db = dbm.getDb();
    const before = db.prepare("SELECT COUNT(*) AS n FROM tombstones").get() as { n: number };
    assert.equal(before.n, 1);
    dbm.sweepStaleFiles();
    const after = db.prepare("SELECT COUNT(*) AS n FROM tombstones").get() as { n: number };
    assert.equal(after.n, 0);
  });

  it("sweeps stale staged uploads but keeps fresh ones", async () => {
    const store = await import("../src/server/store.ts");
    const dbm = await import("../src/server/db.ts");
    const oldUp = store.stageUpload(new Uint8Array([1, 2, 3]), "old.wav");
    const oldPath = join(process.env.DATA_DIR!, "tmp-uploads", `${oldUp.uploadId}.wav`);
    utimesSync(oldPath, new Date(0), new Date(0));
    const freshUp = store.stageUpload(new Uint8Array([4, 5, 6]), "fresh.wav");
    const freshPath = join(process.env.DATA_DIR!, "tmp-uploads", `${freshUp.uploadId}.wav`);
    dbm.sweepStaleFiles(60 * 1000);
    assert.equal(existsSync(oldPath), false);
    assert.equal(existsSync(freshPath), true);
    store.discardStagedUpload(freshUp.uploadId);
    assert.equal(existsSync(freshPath), false);
    store.discardStagedUpload("does-not-exist");
  });

  it("keeps print rules, print action, and evidence labels", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    assert.match(css, /@media print/);
    assert.match(css, /\.noprint/);
    const page = readFileSync("src/app/recipes/[id]/page.tsx", "utf8");
    assert.ok(page.includes("window.print()"));
    assert.ok(page.includes("may change"));
    assert.ok(page.includes("Family answer"));
    assert.ok(!page.includes("arrives in Milestone B"));
  });
});
