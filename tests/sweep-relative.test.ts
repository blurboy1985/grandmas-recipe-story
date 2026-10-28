import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regression (review M1): with a RELATIVE DATA_DIR (the shipped default
// "./data/app"), the tombstone sweep must still retry/clear pending file
// deletions. Run inside a temp cwd so no repo files are touched.
const workDir = mkdtempSync(join(tmpdir(), "grs-rel-"));

before(() => {
  process.chdir(workDir);
  process.env.DATA_DIR = "./data/app";
});

after(() => {
  process.chdir(join(workDir, ".."));
  rmSync(workDir, { recursive: true, force: true });
});

describe("tombstone sweep with relative DATA_DIR", () => {
  it("clears a tombstone whose file is already gone", async () => {
    const store = await import("../src/server/store.ts");
    const dbm = await import("../src/server/db.ts");
    const { id } = store.createSampleRecipe({ cookName: "T", consent: true });
    const audioPath = store.mediaPathFor(id, "audio")!;
    unlinkSync(audioPath);
    store.deleteRecipe(id);
    const db = dbm.getDb();
    const beforeCount = db.prepare("SELECT COUNT(*) AS n FROM tombstones").get() as { n: number };
    assert.equal(beforeCount.n, 1);
    dbm.sweepStaleFiles();
    const afterCount = db.prepare("SELECT COUNT(*) AS n FROM tombstones").get() as { n: number };
    assert.equal(afterCount.n, 0);
  });
});
