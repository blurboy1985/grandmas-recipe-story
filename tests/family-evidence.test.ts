import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phase 8 (Worker migration): the server store (src/server/store.ts /
// db.ts) and its store-driven family-evidence cases were removed with the
// vestige local-dev server mode. The one case below never touched the
// store — it pins live UI behaviour (print rules + family-evidence
// labels on the recipe page) — so it is kept.
describe("family evidence (milestone D)", () => {
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
