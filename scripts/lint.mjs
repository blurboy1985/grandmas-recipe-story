// Milestone A project lint (offline-friendly): privacy + grounding guards.
// Fails on: public-prefixed secret exposure, committed private media/DB, recursive $ref,
// sample files missing their fictional label, .env.example containing secrets.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const errors = [];
const textFiles = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "data", "__pycache__"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js|json|md|example|toml)$/.test(name)) textFiles.push(p);
  }
}
walk("src"); walk("scripts"); walk("tests"); walk("samples");
for (const f of ["package.json", ".env.example", "next.config.mjs", "tsconfig.json"]) if (existsSync(f)) textFiles.push(f);

for (const f of textFiles) {
  const s = readFileSync(f, "utf8");
  if (f !== "scripts/lint.mjs" && /NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)/.test(s)) errors.push(f + ": public-prefixed secret exposure");
  if (f !== "scripts/lint.mjs" && /"\$ref"/.test(s) && /seg-|clarif|ingredient/i.test(s)) errors.push(f + ": possible recursive schema reference");
}
const envExample = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
if (/sk-|META_API_KEY=\S+/.test(envExample)) errors.push(".env.example: must not contain real keys");
for (const f of ["samples/sample-transcript.txt", "samples/sample-recipe.json", "samples/README.md"]) {
  if (!existsSync(f)) errors.push(`${f}: missing`);
}
if (existsSync("samples/README.md") && !/fictional/i.test(readFileSync("samples/README.md", "utf8"))) errors.push("samples/README.md: must say fictional");
const banned = ["samples/sample.sqlite", "samples/recording.wav"];
for (const f of banned) if (existsSync(f)) errors.push(`${f}: private media must not be committed`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`lint ok (${textFiles.length} files checked)`);
