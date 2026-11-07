import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWavHeader } from "../src/server/audio.ts";
import { prepareAudioForMeta, resamplePcm16, RESAMPLE_TARGET_RATE } from "../src/server/resample.ts";

// Mono 16-bit PCM WAV filled with a sine wave, in the same Buffer-built
// style as tests/audio.test.ts / tests/transcription.test.ts.
function sineWav(rate: number, seconds: number, freq = 440): Uint8Array {
  const n = Math.round(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}

function samplesOf(wav: Uint8Array): Int16Array {
  const parsed = parseWavHeader(wav);
  assert.equal(parsed.ok, true);
  const view = new DataView(wav.buffer, wav.byteOffset + 44, wav.length - 44);
  const out = new Int16Array((wav.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

// Frequency estimate by rising zero crossings over the middle half of
// the signal (edges avoided), good to well under a hertz here.
function estimateFreq(samples: Int16Array, rate: number): number {
  const start = Math.floor(samples.length / 4);
  const end = Math.floor((samples.length * 3) / 4);
  let crossings = 0;
  for (let i = start + 1; i < end; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
  }
  return (crossings * rate) / (end - start);
}

describe("resample for Meta Voice", () => {
  it("converts a 32000 Hz upload to a canonical 24000 Hz WAV", () => {
    const input = sineWav(32000, 2.5);
    const r = prepareAudioForMeta(input);
    assert.equal(r.resampled, true);
    assert.equal(r.sourceRate, 32000);
    assert.equal(r.sentRate, RESAMPLE_TARGET_RATE);
    const parsed = parseWavHeader(r.bytes);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.info?.sampleRate, 24000);
    assert.equal(parsed.info?.channels, 1);
    assert.equal(parsed.info?.bitsPerSample, 16);
    // RIFF/data sizes describe the actual bytes.
    assert.equal(r.bytes.length, 44 + 60000 * 2);
  });

  it("preserves duration within one output sample", () => {
    for (const [rate, seconds] of [[32000, 2.5], [44100, 1.7], [8000, 3.3], [48000, 0.9]] as const) {
      const input = sineWav(rate, seconds);
      const inSamples = (input.length - 44) / 2;
      const r = prepareAudioForMeta(input);
      const outSamples = (r.bytes.length - 44) / 2;
      const drift = Math.abs(outSamples / RESAMPLE_TARGET_RATE - inSamples / rate);
      assert.ok(drift <= 1 / RESAMPLE_TARGET_RATE, `drift ${drift}s for ${rate} Hz`);
    }
  });

  it("keeps a sine wave's frequency through resampling", () => {
    const r = prepareAudioForMeta(sineWav(32000, 2, 440));
    const freq = estimateFreq(samplesOf(r.bytes), RESAMPLE_TARGET_RATE);
    assert.ok(Math.abs(freq - 440) <= 5, `estimated ${freq} Hz`);
    const up = prepareAudioForMeta(sineWav(8000, 2, 300));
    const upFreq = estimateFreq(samplesOf(up.bytes), RESAMPLE_TARGET_RATE);
    assert.ok(Math.abs(upFreq - 300) <= 5, `estimated ${upFreq} Hz`);
  });

  it("passes 16000 and 24000 Hz inputs through byte-identical", () => {
    for (const rate of [16000, 24000]) {
      const input = sineWav(rate, 1.25);
      const r = prepareAudioForMeta(input);
      assert.equal(r.resampled, false);
      assert.equal(r.sentRate, rate);
      assert.deepEqual(r.bytes, input);
    }
  });

  it("leaves unparseable bytes untouched for the validator to reject", () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    const r = prepareAudioForMeta(junk);
    assert.equal(r.resampled, false);
    assert.deepEqual(r.bytes, junk);
  });

  it("resamplePcm16 handles the tail and the identity rate", () => {
    const same = new Int16Array([100, -200, 300]);
    assert.equal(resamplePcm16(same, 16000, 16000), same);
    // 4 samples at 4 Hz -> 2 samples at 2 Hz: positions 0 and 2 exactly.
    assert.deepEqual([...resamplePcm16(new Int16Array([0, 1000, 2000, 3000]), 4, 2)], [0, 2000]);
    // Upsampling reaches the final input sample without overrunning.
    const up = resamplePcm16(new Int16Array([0, 1000]), 2, 4);
    assert.deepEqual([...up], [0, 500, 1000, 1000]);
  });
});
