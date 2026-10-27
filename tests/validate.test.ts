import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignSegments } from "../src/server/segments.ts";
import { SAMPLE_RECIPE, SAMPLE_TRANSCRIPT_TEXT } from "../src/server/sample-fixture.ts";
import { validateRecipeDraft } from "../src/server/validate.ts";

const segments = assignSegments(SAMPLE_TRANSCRIPT_TEXT);

describe("sample fixture grounding", () => {
  it("validates cleanly", () => {
    const r = validateRecipeDraft(SAMPLE_RECIPE, segments);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });
  it("rejects unknown segment IDs", () => {
    const bad = JSON.parse(JSON.stringify(SAMPLE_RECIPE));
    bad.ingredients[0].source_segment_ids = ["seg-99"];
    assert.equal(validateRecipeDraft(bad, segments).ok, false);
  });
  it("rejects null quantity without confirmation", () => {
    const bad = JSON.parse(JSON.stringify(SAMPLE_RECIPE));
    bad.ingredients[1].needs_confirmation = false;
    const r = validateRecipeDraft(bad, segments);
    assert.equal(r.ok, false);
  });
  it("rejects more than three questions", () => {
    const bad = JSON.parse(JSON.stringify(SAMPLE_RECIPE));
    bad.clarifications.push({ question: "Extra?", related_field: "x", source_segment_ids: ["seg-01"] });
    assert.equal(validateRecipeDraft(bad, segments).ok, false);
  });
  it("rejects non-verbatim quotes", () => {
    const bad = JSON.parse(JSON.stringify(SAMPLE_RECIPE));
    bad.story.quotes[0].text = "almost the same words";
    assert.equal(validateRecipeDraft(bad, segments).ok, false);
  });
});
