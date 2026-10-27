import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SAMPLE_RECIPE, SAMPLE_TRANSCRIPT_TEXT } from "../src/server/sample-fixture.ts";

describe("samples/ mirrors server fixture", () => {
  it("transcript matches", () => {
    const file = readFileSync("samples/sample-transcript.txt", "utf8").trim();
    assert.equal(file, SAMPLE_TRANSCRIPT_TEXT);
  });
  it("recipe matches", () => {
    const file = JSON.parse(readFileSync("samples/sample-recipe.json", "utf8"));
    assert.deepEqual(file, SAMPLE_RECIPE);
  });
  it("README marks fiction", () => {
    assert.match(readFileSync("samples/README.md", "utf8"), /fictional/i);
  });
});
