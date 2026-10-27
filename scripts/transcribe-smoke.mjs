#!/usr/bin/env node
// Daniel-gated live check (Milestone C): one bounded Voice Transcribe call
// over synthetic speech (or a Daniel-selected non-sensitive WAV via --audio).
// Prints only safe metadata (model, latency, transcript length, word checks).
// Never prints the key, audio bytes, transcript content, or file paths.
// Run locally with a hidden key, e.g.:
//   read -rs 'META_API_KEY?Meta app key (hidden): '; export META_API_KEY
//   node scripts/transcribe-smoke.mjs [--audio /path/to/non-sensitive-short.wav]; unset META_API_KEY
import { readFile } from "node:fs/promises";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phrase = "Add some salt. Stir the soup for five minutes.";

async function main() {
  const key = process.env.META_API_KEY;
  if (!key) { console.error("META_API_KEY is not set; nothing was sent."); process.exit(2); }
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--audio")) {
    console.error("Usage: node scripts/transcribe-smoke.mjs [--audio /path/to/non-sensitive-short.wav]");
    process.exit(2);
  }
  const { transcribeAudio } = await import("../src/server/meta-transcribe.ts");
  let temp = null;
  try {
    let bytes;
    let fixture;
    if (args.length === 2) {
      bytes = new Uint8Array(await readFile(resolve(args[1])));
      fixture = "user-selected local WAV; content and path not logged";
    } else {
      temp = await mkdtemp(join(tmpdir(), "grandma-transcribe-smoke-"));
      const aiff = join(temp, "synthetic.aiff");
      const wav = join(temp, "synthetic.wav");
      // Built-in macOS speech; explicitly synthetic, no family recording.
      execFileSync("/usr/bin/say", ["-o", aiff, phrase], { stdio: "ignore", timeout: 30_000 });
      execFileSync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav],
        { stdio: "ignore", timeout: 30_000 });
      bytes = new Uint8Array(await readFile(wav));
      fixture = "macOS synthetic speech; no family audio";
    }
    const started = Date.now();
    const result = await transcribeAudio(bytes, {});
    const elapsed = Date.now() - started;
    if (!result.ok) {
      console.log(JSON.stringify({ ok: false, code: result.code, retried: result.retried, elapsed_ms: elapsed, fixture }));
      process.exit(1);
    }
    const t = result.transcript;
    console.log(JSON.stringify({
      ok: true,
      model: result.usage.model,
      options_version: result.usage.optionsVersion,
      latency_ms: result.usage.latencyMs,
      retried: result.retried,
      transcript_characters: t.length,
      expected_words_present: args.length === 2 ? null : /salt/i.test(t) && /soup/i.test(t) && /five|5/i.test(t),
      elapsed_ms: elapsed,
      fixture,
    }));
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Smoke test failed (${e?.code ?? "error"}); no credentials printed.`); process.exit(1); });
}
