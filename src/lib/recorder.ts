// Milestone E: browser recording helpers.
// Recording stays in the browser (MediaRecorder); conversion to the app's
// supported format (mono 16-bit PCM WAV) also happens in the browser via
// Web Audio, so no FFmpeg/server conversion is needed and the existing
// byte-level WAV validation remains the gate.

export const RECORD_MAX_MS = 300_000;
export const RECORD_MIN_MS = 60_000;
export const RECORD_SAMPLE_RATE = 16_000;

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];

export function pickMimeType(isSupported: (mime: string) => boolean): string {
  for (const mime of MIME_CANDIDATES) {
    if (!mime || isSupported(mime)) return mime;
  }
  return "";
}

export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Encode mono Float32 samples (-1..1) as 16-bit PCM WAV bytes.
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeTag = (offset: number, tag: string) => { for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i)); };
  writeTag(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

// Decode any browser-recorded blob and resample to mono 16 kHz WAV.
export async function recordedBlobToWav(blob: Blob): Promise<{ wav: Blob; durationMs: number }> {
  const AudioCtx: typeof AudioContext = window.AudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * RECORD_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, RECORD_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const wavBytes = encodeWav(samples, RECORD_SAMPLE_RATE);
    // Copy into a fresh ArrayBuffer for Blob (Uint8Array view may be offset).
    const copy = new Uint8Array(wavBytes.length);
    copy.set(wavBytes);
    return { wav: new Blob([copy.buffer], { type: "audio/wav" }), durationMs: Math.round(decoded.duration * 1000) };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function recorderSupported(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window.MediaRecorder !== "undefined"
    && window.isSecureContext;
}
