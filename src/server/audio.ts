// Milestone A upload validation: actual bytes, not extension/MIME.
// Supported: RIFF/WAVE PCM, mono, 16-bit, 1–5 minutes, <= 20 MB.
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MIN_DURATION_MS = 60_000;
export const MAX_DURATION_MS = 300_000;

export interface WavInfo { durationMs: number; sampleRate: number; channels: number; bitsPerSample: number; byteSize: number; }

export function parseWavHeader(bytes: Uint8Array): { ok: boolean; error?: string; info?: WavInfo } {
  if (bytes.length < 44) return { ok: false, error: "too_small" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const tag = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (tag(0, 4) !== "RIFF" || tag(8, 4) !== "WAVE") return { ok: false, error: "not_wav" };
  if (tag(12, 4) !== "fmt ") return { ok: false, error: "bad_fmt" };
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  if (audioFormat !== 1) return { ok: false, error: "not_pcm" };
  if (channels !== 1) return { ok: false, error: "not_mono" };
  if (bitsPerSample !== 16) return { ok: false, error: "not_16bit" };
  if (![8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate)) return { ok: false, error: "bad_rate" };
  // Find data chunk (durable for JUNK/LIST headers).
  let offset = 12;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "data") { dataBytes = size; break; }
    offset += 8 + size + (size % 2);
  }
  if (!dataBytes) return { ok: false, error: "no_data" };
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  const durationMs = Math.round((dataBytes / bytesPerSecond) * 1000);
  return { ok: true, info: { durationMs, sampleRate, channels, bitsPerSample, byteSize: bytes.length } };
}

export function validateUpload(bytes: Uint8Array): { ok: boolean; error?: string; info?: WavInfo } {
  if (bytes.length > MAX_AUDIO_BYTES) return { ok: false, error: "too_large" };
  const parsed = parseWavHeader(bytes);
  if (!parsed.ok || !parsed.info) return parsed;
  if (parsed.info.durationMs < MIN_DURATION_MS) return { ok: false, error: "too_short" };
  if (parsed.info.durationMs > MAX_DURATION_MS) return { ok: false, error: "too_long" };
  return parsed;
}
