import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

before(() => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "grs-test-"));
});

describe("sqlite save / reopen", () => {
  it("creates, edits, approves, answers, reviews, reloads and deletes", async () => {
    const store = await import("../src/server/store.ts");
    const { id } = store.createSampleRecipe({ cookName: "Test Mei", consent: true });
    let d = store.getRecipeDetail(id);
    assert.ok(d);
    assert.equal(d?.processingState, "draft_ready");
    assert.equal(d?.clarifications.length, 3);

    // Saving/reopening preserves: fresh read returns the same card.
    const again = store.getRecipeDetail(id);
    assert.equal(again?.dishName, d?.dishName);

    // Edit clears approval; re-approve restores draft_ready for samples.
    store.editTranscript(id, "Today I am making tomato egg stir-fry.\n\nHeat the wok with oil.");
    d = store.getRecipeDetail(id);
    assert.equal(d?.approvedVersionId, null);
    const editedId = d?.editedTranscripts.at(-1)?.id;
    assert.ok(editedId);
    store.approveTranscript(id, editedId!);
    d = store.getRecipeDetail(id);
    assert.equal(d?.approvedVersionId, editedId);

    // Answer + correction + review state persist.
    const q = d?.clarifications[0].id;
    assert.ok(q);
    store.answerClarification(id, q!, "Half a teaspoon.");
    store.addCorrection(id, "ingredients[salt]", "1/2 teaspoon");
    store.setReviewState(id, "confirmed");
    d = store.getRecipeDetail(id);
    assert.equal(d?.clarifications[0].answer, "Half a teaspoon.");
    assert.equal(d?.corrections.length, 1);
    assert.equal(d?.draft?.reviewState, "confirmed");

    // Delete removes the card.
    store.deleteRecipe(id);
    assert.equal(store.getRecipeDetail(id), null);
    assert.deepEqual(store.listRecipes().filter((r) => r.id === id), []);
  });
});
