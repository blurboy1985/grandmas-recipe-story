import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignSegments } from "../src/server/segments.ts";

describe("assignSegments", () => {
  it("assigns stable ordered IDs per block", () => {
    const segs = assignSegments("Line one.\n\nLine two.\n\nLine three.");
    assert.deepEqual(segs.map((s) => s.id), ["seg-01", "seg-02", "seg-03"]);
    assert.equal(segs[1].text, "Line two.");
  });
  it("returns empty for empty story (empty source stays empty)", () => {
    assert.deepEqual(assignSegments("   \n "), []);
  });
});
