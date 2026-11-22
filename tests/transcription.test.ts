import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { transcribeAudio } from "../src/server/meta-transcribe.ts";
import { parseWavHeader } from "../src/server/audio.ts";

// Phase 8 (Worker migration): the server store (src/server/store.ts /
// db.ts) was removed with the vestige local-dev server mode, and with it
// the store-driven cases that used to live here (cache/dedup/state
// machine around requestTranscription). What remains are the adapter
// tests — transcribeAudio is the live path used by both the Next route
// and the Cloudflare Worker. Three error cases that were previously
// asserted through the store (bad_credentials, invalid_audio,
// empty_transcript) are now asserted at the adapter directly; the codes
// originate in the adapter, so the assertions are unchanged in substance.
before(() => {
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

function wavBytesAtRate(rate: number, seconds: number): Uint8Array {
  const n = Math.round(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
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

describe("transcription", () => {
  it("sends the exact multipart request/audio schema", async () => {
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
    const r = await transcribeAudio(wavBytes(120), { fetchImpl });
    assert.equal(r.ok, true);
    assert.ok(seen!.url.endsWith("/asr/transcribe"));
    assert.deepEqual(seen!.requestJson, { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" });
    assert.equal(seen!.audioType, "audio/wav");
    assert.match(seen!.auth ?? "", /^Bearer .+/);
  });

  it("resamples a 32 kHz upload to 24 kHz before the Meta fetch", async () => {
    let audioSeen: Uint8Array | null = null;
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      const form = (init as { body: FormData }).body;
      audioSeen = new Uint8Array(await (form.get("audio") as Blob).arrayBuffer());
      return okResponse("Resampled soup.");
    }) as typeof fetch;
    const r = await transcribeAudio(wavBytesAtRate(32000, 120), { fetchImpl });
    assert.equal(r.ok, true);
    const parsed = parseWavHeader(audioSeen!);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.info?.sampleRate, 24000);
    assert.equal(parsed.info?.durationMs, 120000);
  });

  it("forwards a 16 kHz upload to the Meta fetch byte-identical", async () => {
    const input = wavBytesAtRate(16000, 120);
    let audioSeen: Uint8Array | null = null;
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      const form = (init as { body: FormData }).body;
      audioSeen = new Uint8Array(await (form.get("audio") as Blob).arrayBuffer());
      return okResponse("Untouched soup.");
    }) as typeof fetch;
    const r = await transcribeAudio(input, { fetchImpl });
    assert.equal(r.ok, true);
    assert.deepEqual(audioSeen!, input);
  });

  it("reports missing key visibly instead of sample fallback", async () => {
    const saved = process.env.META_API_KEY;
    delete process.env.META_API_KEY;
    try {
      const r = await transcribeAudio(new Uint8Array([1, 2, 3]), { fetchImpl: (async () => okResponse("x")) as typeof fetch });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, "missing_key");
    } finally { process.env.META_API_KEY = saved; }
  });

  it("surfaces rejected keys as bad_credentials", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const r = await transcribeAudio(wavBytes(120), { fetchImpl });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "bad_credentials");
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
    const fetchImpl = (async () => new Response("{}", { status: 400 })) as typeof fetch;
    const r = await transcribeAudio(wavBytes(120), { fetchImpl });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid_audio");
  });

  it("refuses empty transcript output", async () => {
    const fetchImpl = (async () => okResponse("   ")) as typeof fetch;
    const r = await transcribeAudio(wavBytes(120), { fetchImpl });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "empty_transcript");
  });
});
