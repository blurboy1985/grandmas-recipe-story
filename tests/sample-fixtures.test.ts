import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_FIXTURES, sampleFixtureById } from "../src/server/sample-fixture.ts";
import { assignSegments } from "../src/server/segments.ts";
import { validateRecipeDraft } from "../src/server/validate.ts";
import { createSampleLocal, missingSampleFixtures } from "../src/lib/local-recipes.ts";

test("three distinct fictional samples, each grounded in its transcript", () => {
  assert.equal(SAMPLE_FIXTURES.length, 3);
  assert.equal(new Set(SAMPLE_FIXTURES.map((f) => f.dishName)).size, 3);
  for (const f of SAMPLE_FIXTURES) {
    const check = validateRecipeDraft(f.recipe, assignSegments(f.transcriptText));
    assert.deepEqual(check.errors, [], f.id);
    assert.equal(f.recipe.dish_name, f.dishName);
  }
});

test("sampleFixtureById falls back to the first fixture", () => {
  assert.equal(sampleFixtureById("steamed-egg").dishName, "Steamed Egg with Minced Pork (Sample)");
  assert.equal(sampleFixtureById("nope").id, "tomato-egg");
  assert.equal(sampleFixtureById(undefined).id, "tomato-egg");
});

test("missingSampleFixtures is idempotent after seeding", () => {
  const seeded = SAMPLE_FIXTURES.map((f) => createSampleLocal({ cookName: "Sample Cook (fictional)", dishName: f.dishName, consent: true, fixtureId: f.id }, null));
  assert.deepEqual(missingSampleFixtures(seeded), []);
  assert.equal(missingSampleFixtures(seeded.slice(0, 1)).length, 2);
  for (const rec of seeded) assert.equal(rec.drafts[0].output.dish_name, rec.dishName);
});
