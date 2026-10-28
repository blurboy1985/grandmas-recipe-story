import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, formatTimer, pickMimeType, RECORD_SAMPLE_RATE } from "../src/lib/recorder.ts";
import { parseWavHeader, validateUpload } from "../src/server/audio.ts";

test("pickMimeType prefers webm/opus and falls back to empty", () => {
  assert.equal(pickMimeType((m) => m === "audio/webm"), "audio/webm");
  assert.equal(pickMimeType(() => false), "");
  assert.equal(pickMimeType(() => true), "audio/webm;codecs=opus");
});

test("formatTimer renders m:ss", () => {
  assert.equal(formatTimer(0), "0:00");
  assert.equal(formatTimer(65_000), "1:05");
  assert.equal(formatTimer(300_000), "5:00");
});

test("encodeWav produces a valid mono 16-bit PCM header", () => {
  const samples = new Float32Array(RECORD_SAMPLE_RATE); // 1 second of silence
  const bytes = encodeWav(samples, RECORD_SAMPLE_RATE);
  const parsed = parseWavHeader(bytes);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.info?.sampleRate, RECORD_SAMPLE_RATE);
  assert.equal(parsed.info?.channels, 1);
  assert.equal(parsed.info?.bitsPerSample, 16);
  assert.equal(parsed.info?.durationMs, 1000);
  // 1 second is below the app minimum, so upload validation rejects it.
  assert.equal(validateUpload(bytes).error, "too_short");
});

test("encodeWav of 60 seconds passes upload validation", () => {
  const bytes = encodeWav(new Float32Array(RECORD_SAMPLE_RATE * 60), RECORD_SAMPLE_RATE);
  assert.equal(validateUpload(bytes).ok, true);
});
