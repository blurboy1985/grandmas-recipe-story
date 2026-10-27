import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWavHeader, validateUpload } from "../src/server/audio.ts";

function wav(seconds: number, channels = 1): Uint8Array {
  const rate = 16000, n = rate * seconds * channels;
  const data = Buffer.alloc(n * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}

describe("wav validation", () => {
  it("parses the committed fictional sample tone", () => {
    const bytes = new Uint8Array(readFileSync("samples/sample.wav"));
    const r = parseWavHeader(bytes);
    assert.equal(r.ok, true);
    assert.equal(r.info?.channels, 1);
  });
  it("accepts a 2-minute mono wav", () => {
    assert.equal(validateUpload(wav(120)).ok, true);
  });
  it("rejects too-short audio", () => {
    const r = validateUpload(wav(30));
    assert.equal(r.ok, false);
    assert.equal(r.error, "too_short");
  });
  it("rejects stereo", () => {
    assert.equal(validateUpload(wav(120, 2)).ok, false);
  });
  it("rejects non-wav bytes", () => {
    assert.equal(validateUpload(new Uint8Array(Buffer.from("not audio"))).ok, false);
  });
});
