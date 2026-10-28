import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { transcribeAudio } from "../src/server/meta-transcribe.ts";
import { transcriptionCacheKey } from "../src/server/store.ts";

before(() => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "grs-transcribe-"));
  // Dummy key for mocked-fetch tests only; no network call is ever made.
  process.env.META_API_KEY = "test-dummy-key-never-sent";
});

function wavBytes(seconds: number): Uint8Array {
  const rate = 16000, n = rate * seconds;
  const data = Buffer.alloc(n * 2, 1);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}

function okResponse(transcript: string): Response {
  return new Response(JSON.stringify({ transcript, model: "muse-voice-transcribe-1.0" }), { status: 200, headers: { "Content-Type": "application/json" } });
}

let jobSeq = 0;
async function makeLiveJob(): Promise<{ store: typeof import("../src/server/store.ts"); jobId: string }> {
  const store = await import("../src/server/store.ts");
  jobSeq++;
  const bytes = wavBytes(120);
  // Unique sha per job so cache entries never leak across tests.
  const sha = createHash("sha256").update(bytes).update(String(jobSeq)).digest("hex");
  const staged = store.stageUpload(bytes, "t.wav");
  const { id } = store.createUploadRecipe(
    { uploadId: staged.uploadId, cookName: "T", dishName: `Live Dish ${jobSeq}`, consent: true },
    { durationMs: 120000, byteSize: bytes.length, sha256: sha }
  );
  return { store, jobId: id };
}

describe("transcription", () => {
  it("transcribes once, then serves cache without a second call", async () => {
    const { store, jobId } = await makeLiveJob();
    let calls = 0;
    const fetchImpl = (async () => { calls++; return okResponse("Add salt and stir the soup."); }) as typeof fetch;
    const first = await store.requestTranscription(jobId, { fetchImpl });
    assert.equal(first.cached, false);
    assert.equal(calls, 1);
    const second = await store.requestTranscription(jobId, { fetchImpl });
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
    assert.equal(second.transcriptVersionId, first.transcriptVersionId);
    const d = store.getRecipeDetail(jobId);
    assert.equal(d?.processingState, "transcript_ready");
    assert.equal(d?.originalTranscript?.text, "Add salt and stir the soup.");
    assert.ok((d?.originalTranscript?.segments.length ?? 0) >= 1);
  });

  it("deduplicates concurrent requests into one call", async () => {
    const { store, jobId } = await makeLiveJob();
    let calls = 0;
    const fetchImpl = (async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return okResponse("Simmer the broth gently."); }) as typeof fetch;
    const [a, b] = await Promise.all([store.requestTranscription(jobId, { fetchImpl }), store.requestTranscription(jobId, { fetchImpl })]);
    assert.equal(calls, 1);
    assert.equal(a.transcriptVersionId, b.transcriptVersionId);
  });

  it("sends the exact multipart request/audio schema", async () => {
    const { store, jobId } = await makeLiveJob();
    let seen: { url: string; requestJson: unknown; audioType: string | null; auth: string | null } | null = null;
    const fetchImpl = (async (url: unknown, init: unknown) => {
      const form = (init as { body: FormData }).body;
      const reqPart = form.get("request");
      const audioPart = form.get("audio");
      seen = {
        url: String(url),
        requestJson: JSON.parse(await (reqPart as Blob).text()),
        audioType: (audioPart as Blob).type,
        auth: (init as { headers: Record<string, string> }).headers.Authorization ?? null,
      };
      return okResponse("Schema check soup.");
    }) as typeof fetch;
    await store.requestTranscription(jobId, { fetchImpl });
    assert.ok(seen!.url.endsWith("/asr/transcribe"));
    assert.deepEqual(seen!.requestJson, { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" });
    assert.equal(seen!.audioType, "audio/wav");
    assert.match(seen!.auth ?? "", /^Bearer .+/);
  });

  it("reports missing key visibly instead of sample fallback", async () => {
    const saved = process.env.META_API_KEY;
    delete process.env.META_API_KEY;
    try {
      const r = await transcribeAudio(new Uint8Array([1, 2, 3]), { fetchImpl: (async () => okResponse("x")) as typeof fetch });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, "missing_key");
      const { store, jobId } = await makeLiveJob();
      await assert.rejects(store.requestTranscription(jobId, { fetchImpl: (async () => okResponse("x")) as typeof fetch }), (e: unknown) => (e as { code?: string }).code === "missing_key");
      assert.equal(store.getRecipeDetail(jobId)?.processingState, "uploaded");
    } finally { process.env.META_API_KEY = saved; }
  });

  it("surfaces rejected keys without writing a transcript", async () => {
    const { store, jobId } = await makeLiveJob();
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    await assert.rejects(store.requestTranscription(jobId, { fetchImpl }), (e: unknown) => (e as { code?: string }).code === "bad_credentials");
    const d = store.getRecipeDetail(jobId);
    assert.equal(d?.originalTranscript?.text, "");
    assert.equal(d?.processingState, "uploaded");
  });

  it("retries once on 429, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response("{}", { status: 429 });
      return okResponse("Retry stew broth.");
    }) as typeof fetch;
    const r = await transcribeAudio(wavBytes(120), { fetchImpl });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.retried, true);
    assert.equal(calls, 2);
  });

  it("rejects provider-invalid audio visibly", async () => {
    const { store, jobId } = await makeLiveJob();
    const fetchImpl = (async () => new Response("{}", { status: 400 })) as typeof fetch;
    await assert.rejects(store.requestTranscription(jobId, { fetchImpl }), (e: unknown) => (e as { code?: string }).code === "invalid_audio");
    assert.equal(store.getRecipeDetail(jobId)?.processingState, "uploaded");
  });

  it("refuses empty transcript output without keeping partial state", async () => {
    const { store, jobId } = await makeLiveJob();
    const fetchImpl = (async () => okResponse("   ")) as typeof fetch;
    await assert.rejects(store.requestTranscription(jobId, { fetchImpl }), (e: unknown) => (e as { code?: string }).code === "empty_transcript");
    const d = store.getRecipeDetail(jobId);
    assert.equal(d?.originalTranscript?.text, "");
    assert.equal(d?.processingState, "uploaded");
  });

  it("refuses transcription for sample mode", async () => {
    const store = await import("../src/server/store.ts");
    const { id } = store.createSampleRecipe({ cookName: "T", consent: true });
    await assert.rejects(
      store.requestTranscription(id, { fetchImpl: (async () => okResponse("x")) as typeof fetch }),
      (e: unknown) => (e as { code?: string }).code === "sample_mode"
    );
  });

  it("clears approval when transcription replaces the approved original", async () => {
    const { store, jobId } = await makeLiveJob();
    // Approve the still-empty original placeholder (possible via the API),
    // then transcribe: the new words must not inherit that approval.
    const originalId = store.getRecipeDetail(jobId)!.originalTranscript!.id;
    store.approveTranscript(jobId, originalId);
    assert.equal(store.getRecipeDetail(jobId)!.approvedVersionId, originalId);
    const fetchImpl = (async () => okResponse("Fresh words from grandma.")) as typeof fetch;
    await store.requestTranscription(jobId, { fetchImpl });
    const d = store.getRecipeDetail(jobId)!;
    assert.equal(d.originalTranscript?.text, "Fresh words from grandma.");
    assert.equal(d.approvedVersionId, null);
  });

  it("cache keys are stable per recording hash and model", () => {
    const k1 = transcriptionCacheKey("sha-aaa", "muse-voice-transcribe-1.0");
    const k2 = transcriptionCacheKey("sha-aaa", "muse-voice-transcribe-1.0");
    assert.equal(k1, k2);
    assert.notEqual(k1, transcriptionCacheKey("sha-bbb", "muse-voice-transcribe-1.0"));
  });
});
