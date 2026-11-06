// Worker-migration export build.
//
// `output: "export"` cannot include API route handlers, but the route
// files under src/app/api stay in the repo (they are still the local
// server-mode app, and the three live ones are the reference for the
// Worker port). So this script temporarily moves src/app/api aside,
// runs the LOCAL-mode static export build, and always restores it —
// even when the build fails. If a crash ever leaves `.api-stash/`
// behind, just move it back to `src/app/api` by hand.
import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";

const API_DIR = "src/app/api";
const STASH_DIR = ".api-stash";

function restore() {
  if (existsSync(STASH_DIR) && !existsSync(API_DIR)) {
    renameSync(STASH_DIR, API_DIR);
    console.log("[build-worker] restored src/app/api");
  }
}

if (existsSync(STASH_DIR)) {
  console.error("[build-worker] .api-stash already exists — a previous build was interrupted. Move it back to src/app/api first.");
  process.exit(1);
}

let stashed = false;
try {
  if (existsSync(API_DIR)) {
    renameSync(API_DIR, STASH_DIR);
    stashed = true;
    console.log("[build-worker] stashed src/app/api for the export build");
  }
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_LOCAL_MODE: "1" },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (stashed) restore();
}
