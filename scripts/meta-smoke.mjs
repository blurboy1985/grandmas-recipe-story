#!/usr/bin/env node
// Two bounded real requests; no secrets, full responses or family content are logged.
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(root, 'data', 'setup', 'meta-smoke-results.json');
const phrase = 'Add some salt. Stir the soup for five minutes.';
const safeLabel = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
const numericUsage = value => Object.fromEntries(Object.entries(value ?? {})
  .filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));

export function validateWav(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('invalid_wav');
  let format, dataSize;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error('invalid_wav_chunk');
    if (name === 'fmt ' && size >= 16) {
      format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2),
        rate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    }
    if (name === 'data') dataSize = size;
    offset = start + size + (size % 2);
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.bits !== 16 ||
      ![16000, 24000].includes(format.rate) || !dataSize) throw new Error('unsupported_wav');
  const durationSeconds = dataSize / (format.rate * 2);
  if (durationSeconds > 20 || bytes.length > 1024 * 1024) throw new Error('smoke_audio_too_large');
  return { ...format, durationSeconds, bytes: bytes.length };
}

async function request(path, body, key, json = false) {
  const start = performance.now();
  try {
    const response = await fetch(`https://api.meta.ai/v1/${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json',
        ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(body) : body,
      redirect: 'error', signal: AbortSignal.timeout(90_000),
    });
    const payload = await response.json().catch(() => null);
    const metadata = { http_status: response.status, elapsed_ms: Math.round(performance.now() - start),
      request_id: safeLabel(response.headers.get('x-request-id')) };
    if (!response.ok) return { result: { ...metadata, status: 'failed',
      error_type: safeLabel(payload?.error?.type ?? payload?.type),
      error_code: safeLabel(payload?.error?.code ?? payload?.code) } };
    return { result: metadata, payload };
  } catch (error) {
    return { result: { status: 'failed', http_status: null,
      elapsed_ms: Math.round(performance.now() - start), error_type: safeLabel(error.name),
      error_code: safeLabel(error.cause?.code) } };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--audio')) {
    console.error('Usage: node scripts/meta-smoke.mjs [--audio /path/to/non-sensitive-short.wav]');
    process.exitCode = 2;
    return;
  }
  const providedAudio = args.length === 2 ? resolve(args[1]) : null;
  const key = process.env.MODEL_API_KEY;
  const report = { checked_at: new Date().toISOString(), live_requests_attempted: 0,
    spark: { status: 'not_run', reason: 'MODEL_API_KEY_missing' },
    voice: { status: 'not_run', reason: 'MODEL_API_KEY_missing' },
    codex_routing: 'not_verified', dashboard_usage: 'requires_user_check' };
  if (key) {
    report.live_requests_attempted++;
    const text = await request('responses', {
      model: 'muse-spark-1.3', input: 'Reply exactly: META_SMOKE_OK',
      reasoning: { effort: 'medium' }, max_output_tokens: 1024, store: false,
    }, key, true);
    const reply = text.payload?.output?.flatMap(item => item.type === 'message' ? item.content ?? [] : [])
      .filter(item => item.type === 'output_text').map(item => item.text).join('').trim();
    report.spark = { ...text.result, requested_model: 'muse-spark-1.3',
      ...(text.payload ? { status: text.payload.status === 'completed' && reply === 'META_SMOKE_OK' ? 'passed' : 'failed',
        returned_model: safeLabel(text.payload.model), response_status: safeLabel(text.payload.status),
        reply_matches: reply === 'META_SMOKE_OK', usage: numericUsage(text.payload.usage) } : {}) };
    if ([401, 403].includes(text.result.http_status)) {
      report.voice = { status: 'not_run', reason: 'text_authentication_failed' };
    } else {
      let temp;
      try {
        let bytes;
        if (providedAudio) {
          bytes = await readFile(providedAudio);
        } else {
          temp = await mkdtemp(join(tmpdir(), 'grandma-meta-smoke-'));
          const aiff = join(temp, 'synthetic.aiff');
          const wav = join(temp, 'synthetic.wav');
          // Built-in macOS speech; explicitly synthetic, no family recording.
          execFileSync('/usr/bin/say', ['-o', aiff, phrase], { stdio: 'ignore', timeout: 30_000 });
          execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav],
            { stdio: 'ignore', timeout: 30_000 });
          bytes = await readFile(wav);
        }
        const audio = validateWav(bytes);
        const form = new FormData();
        form.append('request', new Blob([JSON.stringify({ model: 'muse-voice-transcribe-1.0',
          audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' }));
        form.append('audio', new Blob([bytes], { type: 'audio/wav' }), 'smoke.wav');
        report.live_requests_attempted++;
        const voice = await request('asr/transcribe', form, key);
        const transcript = typeof voice.payload?.transcript === 'string' ? voice.payload.transcript : '';
        report.voice = { ...voice.result, requested_model: 'muse-voice-transcribe-1.0', audio,
          fixture: providedAudio ? 'user-selected local WAV; content and path not logged' : 'macOS synthetic speech; no family audio',
          ...(voice.payload ? { status: transcript.trim() ? 'passed' : 'failed',
            transcript_characters: transcript.length,
            expected_words_present: providedAudio ? null : /salt/i.test(transcript) && /soup/i.test(transcript) && /five|5/i.test(transcript),
            session_id: safeLabel(voice.payload.sessionId),
            returned_model: safeLabel(voice.payload.model) } : {}) };
      } catch (error) {
        report.voice = { status: 'failed', reason: 'local_audio_preparation_or_validation_failed',
          error_type: safeLabel(error.name) };
      } finally {
        if (temp) await rm(temp, { recursive: true, force: true });
      }
    }
  }
  await mkdir(dirname(reportPath), { recursive: true, mode: 0o700 });
  const serialized = JSON.stringify(report, null, 2);
  // Also redact an exact credential if an upstream metadata field ever echoes it.
  const safeReport = key ? serialized.split(key).join('[REDACTED]') : serialized;
  await writeFile(reportPath, `${safeReport}\n`, { mode: 0o600 });
  console.log(safeReport);
  console.log('Safe results saved to data/setup/meta-smoke-results.json (ignored by Git).');
  if (report.spark.status !== 'passed' || report.voice.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Smoke test could not finish; no credentials or raw errors printed.'); process.exitCode = 1; });
}
