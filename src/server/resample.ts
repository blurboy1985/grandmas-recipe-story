// Server-side resampling for the Voice Transcribe path.
//
// Meta's Transcribe endpoint accepts mono 16-bit PCM WAV only at 16 kHz
// or 24 kHz (docs: TranscribeRequest schema — "a RIFF/WAVE container
// holding mono integer PCM at 16 kHz or 24 kHz"). Upload validation
// (audio.ts) accepts 8000–48000 Hz and, before this module, forwarded the
// bytes unchanged — Meta answers an unsupported rate with a misleading
// HTTP 503 (diagnosis 2026-11-07: the same narration at 32 kHz failed
// with 502/provider_error via staging; at 24 kHz it returned HTTP 200).
//
// prepareAudioForMeta is called by the transcribe adapter after upload
// validation: files already at a Meta rate pass through untouched
// (byte-identical — the browser recorder's 16 kHz path is unchanged);
// any other valid rate is resampled to RESAMPLE_TARGET_RATE (24 kHz,
// Meta's native rate, proven end-to-end 2026-11-07) and rebuilt as a
// canonical WAV. Unparseable bytes are returned unchanged: rejecting
// them stays the validator's job, never this module's.
import { parseWav } from "./audio.ts";

export const META_SAMPLE_RATES: readonly number[] = [16000, 24000];
export const RESAMPLE_TARGET_RATE = 24000;

export interface PreparedAudio {
  bytes: Uint8Array;
  sourceRate: number | null;
  sentRate: number | null;
  resampled: boolean;
}

// Linear-interpolation resample of mono int16 PCM. Output length is the
// input duration re-expressed at the target rate (within half an output
// sample), so duration is preserved. The interpolation position of the
// final output sample can reach into the last input sample only, so the
// tail holds that sample rather than reading past the end.
export function resamplePcm16(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const outLength = Math.round((samples.length * toRate) / fromRate);
  const out = new Int16Array(outLength);
  const step = fromRate / toRate;
  for (let i = 0; i < outLength; i++) {
    const pos = i * step;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx];
    const b = idx + 1 < samples.length ? samples[idx + 1] : a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

// Canonical 44-byte-header WAV (same layout as src/lib/recorder.ts
// encodeWav): RIFF/WAVE, PCM, mono, 16-bit, with correct chunk sizes.
function buildWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const tag = (o: number, t: string) => { for (let i = 0; i < t.length; i++) view.setUint8(o + i, t.charCodeAt(i)); };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return out;
}

export function prepareAudioForMeta(bytes: Uint8Array): PreparedAudio {
  const parsed = parseWav(bytes);
  if (!parsed.ok || !parsed.info || parsed.dataOffset === undefined || parsed.dataLength === undefined) {
    return { bytes, sourceRate: null, sentRate: null, resampled: false };
  }
  const sourceRate = parsed.info.sampleRate;
  if (META_SAMPLE_RATES.includes(sourceRate)) {
    return { bytes, sourceRate, sentRate: sourceRate, resampled: false };
  }
  // Clamp the header's claimed data size to the bytes actually present,
  // whole int16 samples only.
  const available = bytes.length - parsed.dataOffset;
  const usable = Math.max(0, Math.min(parsed.dataLength, available) - (Math.min(parsed.dataLength, available) % 2));
  const inView = new DataView(bytes.buffer, bytes.byteOffset + parsed.dataOffset, usable);
  const samples = new Int16Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = inView.getInt16(i * 2, true);
  const resampled = resamplePcm16(samples, sourceRate, RESAMPLE_TARGET_RATE);
  return { bytes: buildWav(resampled, RESAMPLE_TARGET_RATE), sourceRate, sentRate: RESAMPLE_TARGET_RATE, resampled: true };
}
