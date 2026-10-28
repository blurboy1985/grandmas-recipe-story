import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, uuid, nowIso, dataDir } from "./db.ts";
import { assignSegments } from "./segments.ts";
import { SAMPLE_FIXTURES, sampleFixtureById } from "./sample-fixture.ts";
import { validateRecipeDraft } from "./validate.ts";

export type ProcessingState = "uploaded" | "transcribing" | "transcript_ready" | "extracting" | "draft_ready" | "failed";
export type ReviewState = "draft" | "reviewed_with_unknowns" | "confirmed";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function recDir(): string {
  const dir = join(dataDir(), "recordings");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function sampleAudioPath(): string {
  // Committed fictional fixture; copied into DATA_DIR on sample creation.
  return join(process.cwd(), "samples", "sample.wav");
}

export interface CreateSampleInput { cookName: string; dishName?: string; languageHint?: string; consent: boolean; fixtureId?: string; }
export interface CreateUploadInput { uploadId: string; cookName: string; dishName: string; languageHint?: string; consent: boolean; }

export function createSampleRecipe(input: CreateSampleInput): { id: string } {
  if (!input.consent) throw Object.assign(new Error("consent required"), { status: 400, code: "consent_required" });
  if (!input.cookName.trim()) throw Object.assign(new Error("cook name required"), { status: 400, code: "cook_required" });
  const fixture = sampleFixtureById(input.fixtureId);
  const db = getDb();
  const createdAt = nowIso();
  const recordingId = uuid();
  const jobId = uuid();
  const dishName = input.dishName?.trim() || fixture.dishName;
  const wavSrc = sampleAudioPath();
  const bytes = existsSync(wavSrc) ? readFileSync(wavSrc) : Buffer.from("RIFF----WAVE", "utf8");
  const hash = sha256(bytes);
  const relPath = `recordings/${recordingId}.wav`;
  mkdirSync(recDir(), { recursive: true });
  if (existsSync(wavSrc)) copyFileSync(wavSrc, join(dataDir(), relPath));
  else writeFileSync(join(dataDir(), relPath), bytes);
  const segments = assignSegments(fixture.transcriptText);
  const check = validateRecipeDraft(fixture.recipe, segments);
  if (!check.ok) throw new Error("sample fixture invalid: " + check.errors.join("; "));
  const tvId = uuid();
  const rvId = uuid();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO recordings (id, relative_path, sha256, format, duration_ms, byte_size, consent_at, created_at, cook_name, dish_name, language_hint) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(recordingId, relPath, hash, "wav-sample-tone", 2000, bytes.length, createdAt, createdAt, input.cookName.trim(), dishName, input.languageHint?.trim() ?? "");
    db.prepare("INSERT INTO jobs (id, recording_id, mode, processing_state, approved_transcript_version_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(jobId, recordingId, "sample", "draft_ready", tvId, createdAt, createdAt);
    db.prepare("INSERT INTO transcript_versions (id, recording_id, kind, text, segments_json, created_at, approved_at) VALUES (?,?,?,?,?,?,?)")
      .run(tvId, recordingId, "original", fixture.transcriptText, JSON.stringify(segments), createdAt, createdAt);
    const output = { ...fixture.recipe, dish_name: dishName === fixture.dishName ? fixture.recipe.dish_name : dishName };
    db.prepare("INSERT INTO recipe_versions (id, job_id, transcript_version_id, input_hash, model, prompt_version, schema_version, output_json, review_state, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(rvId, jobId, tvId, "sample-v1", "sample-fixture", "sample-prompt-v1", "sample-schema-v1", JSON.stringify(output), "draft", createdAt);
    for (const c of fixture.recipe.clarifications) {
      db.prepare("INSERT INTO clarifications (id, recipe_version_id, question, related_field, source_segment_ids_json, provenance) VALUES (?,?,?,?,?,?)")
        .run(uuid(), rvId, c.question, c.related_field, JSON.stringify(c.source_segment_ids), "model");
    }
    db.exec("COMMIT");
  } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
  return { id: jobId };
}

// Pre-load the fictional samples once (idempotent by dish name). No family
// data is involved, so no family consent is claimed for these cards.
export function seedSampleRecipes(): { ids: string[]; created: number } {
  const db = getDb();
  const existing = new Set(
    (db.prepare("SELECT r.dish_name FROM jobs j JOIN recordings r ON r.id=j.recording_id WHERE j.mode='sample'").all() as { dish_name: string }[])
      .map((r) => r.dish_name),
  );
  const ids: string[] = [];
  let created = 0;
  for (const f of SAMPLE_FIXTURES) {
    if (existing.has(f.dishName)) continue;
    ids.push(createSampleRecipe({ cookName: "Sample Cook (fictional)", dishName: f.dishName, consent: true, fixtureId: f.id }).id);
    created++;
  }
  return { ids, created };
}

export function stageUpload(bytes: Uint8Array, originalName: string): { uploadId: string; byteSize: number } {
  const dir = join(dataDir(), "tmp-uploads");
  mkdirSync(dir, { recursive: true });
  const uploadId = uuid();
  writeFileSync(join(dir, `${uploadId}.wav`), bytes);
  void originalName;
  return { uploadId, byteSize: bytes.length };
}

function stagedPath(uploadId: string): string | null {
  if (!/^[0-9a-f-]{1,64}$/i.test(uploadId)) return null;
  return join(dataDir(), "tmp-uploads", `${uploadId}.wav`);
}

export function discardStagedUpload(uploadId: string): void {
  const p = stagedPath(uploadId);
  if (!p) return;
  try { unlinkSync(p); } catch {}
}

export function createUploadRecipe(input: CreateUploadInput, info: { durationMs: number; byteSize: number; sha256: string }): { id: string } {
  if (!input.consent) throw Object.assign(new Error("consent required"), { status: 400, code: "consent_required" });
  if (!input.cookName.trim()) throw Object.assign(new Error("cook name required"), { status: 400, code: "cook_required" });
  if (!input.dishName.trim()) throw Object.assign(new Error("dish name required"), { status: 400, code: "dish_required" });
  const db = getDb();
  const createdAt = nowIso();
  const tmpPath = stagedPath(input.uploadId);
  if (!tmpPath || !existsSync(tmpPath)) throw Object.assign(new Error("upload expired"), { status: 400, code: "upload_expired" });
  const recordingId = uuid();
  const jobId = uuid();
  const relPath = `recordings/${recordingId}.wav`;
  mkdirSync(recDir(), { recursive: true });
  copyFileSync(tmpPath, join(dataDir(), relPath));
  try { unlinkSync(tmpPath); } catch {}
  const tvId = uuid();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO recordings (id, relative_path, sha256, format, duration_ms, byte_size, consent_at, created_at, cook_name, dish_name, language_hint) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(recordingId, relPath, info.sha256, "wav-pcm-mono", info.durationMs, info.byteSize, createdAt, createdAt, input.cookName.trim(), input.dishName.trim(), input.languageHint?.trim() ?? "");
    db.prepare("INSERT INTO jobs (id, recording_id, mode, processing_state, approved_transcript_version_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(jobId, recordingId, "live-manual", "uploaded", null, createdAt, createdAt);
    db.prepare("INSERT INTO transcript_versions (id, recording_id, kind, text, segments_json, created_at, approved_at) VALUES (?,?,?,?,?,?,?)")
      .run(tvId, recordingId, "original", "", JSON.stringify([]), createdAt, null);
    db.exec("COMMIT");
  } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
  return { id: jobId };
}

export interface RecipeDetail {
  id: string; mode: string; processingState: ProcessingState;
  cookName: string; dishName: string; languageHint: string; consentAt: string; createdAt: string;
  audioUrl: string; hasPhoto: boolean;
  originalTranscript: { id: string; text: string; segments: { id: string; text: string }[] } | null;
  editedTranscripts: { id: string; text: string; approvedAt: string | null; createdAt: string }[];
  approvedVersionId: string | null;
  draft: { id: string; output: unknown; reviewState: ReviewState; createdAt: string } | null;
  clarifications: { id: string; question: string; relatedField: string; sourceSegmentIds: string[]; answer: string | null; provenance: string; answeredAt: string | null }[];
  corrections: { id: string; targetField: string; correctedValue: unknown; createdAt: string; versionId: string }[];
  versions: { id: string; createdAt: string; reviewState: string; model: string }[];
}

export function getRecipeDetail(jobId: string): RecipeDetail | null {
  const db = getDb();
  const job = db.prepare("SELECT j.*, r.cook_name, r.dish_name, r.language_hint, r.consent_at, r.created_at AS rec_created, r.photo_relative_path FROM jobs j JOIN recordings r ON r.id=j.recording_id WHERE j.id=?").get(jobId) as Record<string, string | null> | undefined;
  if (!job) return null;
  const recordingId = (db.prepare("SELECT recording_id FROM jobs WHERE id=?").get(jobId) as { recording_id: string }).recording_id;
  const tvs = db.prepare("SELECT * FROM transcript_versions WHERE recording_id=? ORDER BY created_at ASC").all(recordingId) as Record<string, string | null>[];
  const original = tvs.find((t) => t.kind === "original") ?? null;
  const edited = tvs.filter((t) => t.kind === "edited");
  const rv = db.prepare("SELECT * FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as Record<string, string> | undefined;
  const clar = rv ? (db.prepare("SELECT * FROM clarifications WHERE recipe_version_id=?").all(rv.id) as Record<string, string | null>[]) : [];
  const corr = (db.prepare("SELECT c.* FROM family_corrections c JOIN recipe_versions v ON v.id=c.recipe_version_id WHERE v.job_id=? ORDER BY c.created_at ASC").all(jobId) as Record<string, string>[]);
  const vers = (db.prepare("SELECT id, created_at, review_state, model FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC").all(jobId) as Record<string, string>[])
    .map((v) => ({ id: String(v.id), createdAt: String(v.created_at), reviewState: String(v.review_state), model: String(v.model) }));
  return {
    id: jobId, mode: String(job.mode), processingState: String(job.processing_state) as ProcessingState,
    cookName: String(job.cook_name ?? ""), dishName: String(job.dish_name ?? ""), languageHint: String(job.language_hint ?? ""),
    consentAt: String(job.consent_at ?? ""), createdAt: String(job.rec_created ?? ""),
    audioUrl: `/api/media/${jobId}?type=audio`, hasPhoto: !!job.photo_relative_path,
    originalTranscript: original ? { id: String(original.id), text: String(original.text), segments: JSON.parse(String(original.segments_json)) } : null,
    editedTranscripts: edited.map((t) => ({ id: String(t.id), text: String(t.text), approvedAt: t.approved_at ? String(t.approved_at) : null, createdAt: String(t.created_at) })),
    approvedVersionId: job.approved_transcript_version_id ? String(job.approved_transcript_version_id) : null,
    draft: rv ? { id: String(rv.id), output: JSON.parse(String(rv.output_json)), reviewState: String(rv.review_state) as ReviewState, createdAt: String(rv.created_at) } : null,
    clarifications: clar.map((c) => ({ id: String(c.id), question: String(c.question), relatedField: String(c.related_field), sourceSegmentIds: JSON.parse(String(c.source_segment_ids_json)), answer: c.answer ? String(c.answer) : null, provenance: String(c.provenance ?? "model"), answeredAt: c.answered_at ? String(c.answered_at) : null })),
    corrections: corr.map((c) => ({ id: String(c.id), targetField: String(c.target_field), correctedValue: JSON.parse(String(c.corrected_value_json)), createdAt: String(c.created_at), versionId: String(c.recipe_version_id) })),
    versions: vers,
  };
}

export function listRecipes(): { id: string; dishName: string; mode: string; processingState: string; reviewState: string | null; updatedAt: string }[] {
  const db = getDb();
  const rows = db.prepare("SELECT j.id, j.mode, j.processing_state, j.updated_at, r.dish_name, (SELECT review_state FROM recipe_versions WHERE job_id=j.id ORDER BY created_at DESC LIMIT 1) AS review_state FROM jobs j JOIN recordings r ON r.id=j.recording_id ORDER BY j.updated_at DESC").all() as Record<string, string | null>[];
  return rows.map((r) => ({ id: String(r.id), dishName: String(r.dish_name), mode: String(r.mode), processingState: String(r.processing_state), reviewState: r.review_state ? String(r.review_state) : null, updatedAt: String(r.updated_at) }));
}

export function editTranscript(jobId: string, text: string): { versionId: string } {
  const clean = text.trim();
  if (!clean) throw Object.assign(new Error("transcript empty"), { status: 400, code: "empty_transcript" });
  const db = getDb();
  const rec = db.prepare("SELECT recording_id FROM jobs WHERE id=?").get(jobId) as { recording_id: string } | undefined;
  if (!rec) throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
  const segments = assignSegments(clean);
  const versionId = uuid();
  const createdAt = nowIso();
  db.prepare("INSERT INTO transcript_versions (id, recording_id, kind, text, segments_json, created_at, approved_at) VALUES (?,?,?,?,?,?,?)")
    .run(versionId, rec.recording_id, "edited", clean, JSON.stringify(segments), createdAt, null);
  // Editing clears approval until re-approved; job returns to uploaded/transcript_ready base.
  db.prepare("UPDATE jobs SET approved_transcript_version_id=NULL, processing_state=CASE WHEN processing_state='draft_ready' THEN 'transcript_ready' ELSE processing_state END, updated_at=? WHERE id=?").run(createdAt, jobId);
  // New evidence returns the latest draft to draft until re-reviewed.
  const latest = db.prepare("SELECT id FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as { id: string } | undefined;
  if (latest) db.prepare("UPDATE recipe_versions SET review_state='draft' WHERE id=?").run(latest.id);
  return { versionId };
}

export function approveTranscript(jobId: string, versionId: string): void {
  const db = getDb();
  const rec = db.prepare("SELECT recording_id FROM jobs WHERE id=?").get(jobId) as { recording_id: string } | undefined;
  if (!rec) throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
  const tv = db.prepare("SELECT * FROM transcript_versions WHERE id=? AND recording_id=?").get(versionId, rec.recording_id) as Record<string, string> | undefined;
  if (!tv) throw Object.assign(new Error("version not found"), { status: 400, code: "version_not_found" });
  const at = nowIso();
  db.prepare("UPDATE transcript_versions SET approved_at=? WHERE id=?").run(at, versionId);
  const job = db.prepare("SELECT mode, processing_state FROM jobs WHERE id=?").get(jobId) as { mode: string; processing_state: string };
  const next: ProcessingState = job.mode === "sample" ? "draft_ready" : job.processing_state === "draft_ready" ? "draft_ready" : "transcript_ready";
  db.prepare("UPDATE jobs SET approved_transcript_version_id=?, processing_state=?, updated_at=? WHERE id=?").run(versionId, next, at, jobId);
}

export function answerClarification(jobId: string, clarificationId: string, answer: string): void {
  const db = getDb();
  const rv = db.prepare("SELECT id FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as { id: string } | undefined;
  if (!rv) throw Object.assign(new Error("no draft"), { status: 400, code: "no_draft" });
  const row = db.prepare("SELECT * FROM clarifications WHERE id=? AND recipe_version_id=?").get(clarificationId, rv.id) as Record<string, string> | undefined;
  if (!row) throw Object.assign(new Error("question not found"), { status: 404, code: "not_found" });
  // Treat content as data; cap length to keep the local MVP safe.
  const clean = answer.trim().slice(0, 2000);
  if (!clean) throw Object.assign(new Error("answer empty"), { status: 400, code: "empty_answer" });
  db.prepare("UPDATE clarifications SET answer=?, answered_at=?, provenance='family' WHERE id=?").run(clean, nowIso(), clarificationId);
  // New evidence returns the draft to draft until re-reviewed.
  db.prepare("UPDATE recipe_versions SET review_state='draft' WHERE id=?").run(rv.id);
}

export function addCorrection(jobId: string, targetField: string, correctedValue: unknown): { id: string } {
  const field = targetField.trim().slice(0, 200);
  if (!field) throw Object.assign(new Error("field required"), { status: 400, code: "field_required" });
  const db = getDb();
  const rv = db.prepare("SELECT id FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as { id: string } | undefined;
  if (!rv) throw Object.assign(new Error("no draft"), { status: 400, code: "no_draft" });
  const id = uuid();
  db.prepare("INSERT INTO family_corrections (id, recipe_version_id, target_field, previous_value_json, corrected_value_json, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, rv.id, field, JSON.stringify(null), JSON.stringify(correctedValue), nowIso());
  // New evidence returns the draft to draft until re-reviewed.
  db.prepare("UPDATE recipe_versions SET review_state='draft' WHERE id=?").run(rv.id);
  return { id };
}

export function setReviewState(jobId: string, reviewState: ReviewState): void {
  if (!["draft", "reviewed_with_unknowns", "confirmed"].includes(reviewState)) throw Object.assign(new Error("bad state"), { status: 400, code: "bad_state" });
  const db = getDb();
  const rv = db.prepare("SELECT id FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as { id: string } | undefined;
  if (!rv) throw Object.assign(new Error("no draft"), { status: 400, code: "no_draft" });
  db.prepare("UPDATE recipe_versions SET review_state=? WHERE id=?").run(reviewState, rv.id);
  db.prepare("UPDATE jobs SET updated_at=? WHERE id=?").run(nowIso(), jobId);
}

export function deleteRecipe(jobId: string): void {
  const db = getDb();
  const rec = db.prepare("SELECT recording_id FROM jobs WHERE id=?").get(jobId) as { recording_id: string } | undefined;
  if (!rec) return;
  const recRow = db.prepare("SELECT relative_path, photo_relative_path FROM recordings WHERE id=?").get(rec.recording_id) as { relative_path: string; photo_relative_path: string | null } | undefined;
  const rvIds = (db.prepare("SELECT id FROM recipe_versions WHERE job_id=?").all(jobId) as { id: string }[]).map((r) => r.id);
  const tvIds = (db.prepare("SELECT id FROM transcript_versions WHERE recording_id=?").all(rec.recording_id) as { id: string }[]).map((r) => r.id);
  const refs = [...rvIds, ...tvIds];
  db.exec("BEGIN");
  try {
    if (refs.length) db.prepare(`DELETE FROM model_cache WHERE result_ref IN (${refs.map(() => "?").join(",")})`).run(...refs);
    db.prepare("DELETE FROM recordings WHERE id=?").run(rec.recording_id);
    db.exec("COMMIT");
  } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
  for (const rel of [recRow?.relative_path, recRow?.photo_relative_path].filter(Boolean) as string[]) {
    try { unlinkSync(join(dataDir(), rel)); } catch {
      try { db.prepare("INSERT INTO tombstones (id, relative_path, created_at) VALUES (?,?,?)").run(uuid(), rel, nowIso()); } catch {}
    }
  }
}

export function mediaPathFor(jobId: string, kind: "audio" | "photo"): string | null {
  const db = getDb();
  const row = db.prepare("SELECT r.relative_path, r.photo_relative_path FROM jobs j JOIN recordings r ON r.id=j.recording_id WHERE j.id=?").get(jobId) as { relative_path: string; photo_relative_path: string | null } | undefined;
  if (!row) return null;
  return kind === "audio" ? join(dataDir(), row.relative_path) : row.photo_relative_path ? join(dataDir(), row.photo_relative_path) : null;
}

/* ---- Milestone B: source-grounded extraction ---- */
import { createHash as createHashForCache } from "node:crypto";
import { EXTRACTION_MODEL_DEFAULT, PROMPT_VERSION, SCHEMA_VERSION } from "./extraction-schema.ts";
import { buildExtractionMessages, type FamilyNote } from "./extraction-prompt.ts";
import { extractRecipe, type FetchImpl } from "./meta-extract.ts";

export interface ExtractionRequest {
  recipeVersionId: string;
  cached: boolean;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function extractionCacheKey(input: unknown, model: string): string {
  return createHashForCache("sha256")
    .update(`${canonicalJson(input)}|${model}|${PROMPT_VERSION}|${SCHEMA_VERSION}`)
    .digest("hex");
}

// Single-process dedup guard: concurrent extractions for one cache key share
// a single paid call. Persisted model_cache 'running' rows cover restarts
// (cleared to failed/interrupted on startup in db.ts).
const runningExtractions = new Map<string, Promise<ExtractionRequest>>();

export function extractionInputFor(jobId: string): { segments: { id: string; text: string }[]; notes: FamilyNote[]; dishName: string; versionId: string } {
  const db = getDb();
  const job = db.prepare("SELECT approved_transcript_version_id FROM jobs WHERE id=?").get(jobId) as { approved_transcript_version_id: string | null } | undefined;
  if (!job) throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
  if (!job.approved_transcript_version_id) throw Object.assign(new Error("approve a transcript first"), { status: 400, code: "no_approved_transcript" });
  const tv = db.prepare("SELECT text, segments_json FROM transcript_versions WHERE id=?").get(job.approved_transcript_version_id) as { text: string; segments_json: string } | undefined;
  if (!tv) throw Object.assign(new Error("approved version missing"), { status: 400, code: "version_not_found" });
  if (!tv.text.trim()) throw Object.assign(new Error("approved transcript is empty"), { status: 400, code: "empty_transcript" });
  const segments = JSON.parse(tv.segments_json) as { id: string; text: string }[];
  if (!segments.length) throw Object.assign(new Error("approved transcript is empty"), { status: 400, code: "empty_transcript" });
  const rec = db.prepare("SELECT dish_name FROM recordings WHERE id=(SELECT recording_id FROM jobs WHERE id=?)").get(jobId) as { dish_name: string };
  const notes: FamilyNote[] = [];
  const latest = db.prepare("SELECT id FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(jobId) as { id: string } | undefined;
  if (latest) {
    const answers = db.prepare("SELECT question, answer FROM clarifications WHERE recipe_version_id=? AND answer IS NOT NULL").all(latest.id) as { question: string; answer: string }[];
    for (const a of answers) notes.push({ label: `Family answer (${a.question.slice(0, 80)})`, text: a.answer });
    const corrs = db.prepare("SELECT target_field, corrected_value_json FROM family_corrections WHERE recipe_version_id=?").all(latest.id) as { target_field: string; corrected_value_json: string }[];
    for (const c of corrs) notes.push({ label: `Family correction (${c.target_field})`, text: c.corrected_value_json });
  }
  return { segments, notes, dishName: rec.dish_name, versionId: job.approved_transcript_version_id };
}

export async function requestExtraction(
  jobId: string,
  opts?: { regenerate?: boolean; fetchImpl?: FetchImpl }
): Promise<ExtractionRequest> {
  const db = getDb();
  const model = process.env.RECIPE_MODEL || EXTRACTION_MODEL_DEFAULT;
  const { segments, notes, versionId } = extractionInputFor(jobId);
  const key = extractionCacheKey({ segments, notes }, model);
  const cacheKind = `extraction:${key}`;

  const running = runningExtractions.get(cacheKind);
  if (running) return running;

  const existing = db.prepare("SELECT state, result_ref FROM model_cache WHERE cache_key=?").get(cacheKind) as { state: string; result_ref: string | null } | undefined;
  if (existing?.state === "running") throw Object.assign(new Error("extraction already running"), { status: 409, code: "extraction_running" });
  if (existing?.state === "complete" && existing.result_ref && !opts?.regenerate) {
    const hit = db.prepare("SELECT id, job_id FROM recipe_versions WHERE id=?").get(existing.result_ref) as { id: string; job_id: string } | undefined;
    if (hit && hit.job_id === jobId) return { recipeVersionId: hit.id, cached: true };
  }

  const job = db.prepare("SELECT processing_state FROM jobs WHERE id=?").get(jobId) as { processing_state: string };
  const priorState = job.processing_state;

  const task = (async (): Promise<ExtractionRequest> => {
    db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
      .run(cacheKind, "extraction", "running", null, nowIso());
    db.prepare("UPDATE jobs SET processing_state='extracting', updated_at=? WHERE id=?").run(nowIso(), jobId);
    try {
      const { system, user } = buildExtractionMessages(segments, (db.prepare("SELECT dish_name FROM recordings WHERE id=(SELECT recording_id FROM jobs WHERE id=?)").get(jobId) as { dish_name: string }).dish_name, notes);
      const result = await extractRecipe(system, user, { model, fetchImpl: opts?.fetchImpl });
      if (!result.ok) throw Object.assign(new Error(result.detail), { status: result.code === "missing_key" || result.code === "bad_credentials" ? 400 : 502, code: result.code });
      const check = validateRecipeDraft(result.output, segments);
      if (!check.ok) throw Object.assign(new Error("Model output failed grounding checks: " + check.errors.slice(0, 3).join("; ")), { status: 502, code: "invalid_output" });
      const out = result.output as { dish_name: string | null; clarifications: { question: string; related_field: string; source_segment_ids: string[] }[] };
      const rvId = uuid();
      const createdAt = nowIso();
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO recipe_versions (id, job_id, transcript_version_id, input_hash, model, prompt_version, schema_version, output_json, review_state, created_at, usage_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(rvId, jobId, versionId, key, result.usage.model, result.usage.promptVersion, result.usage.schemaVersion, JSON.stringify(result.output), "draft", createdAt, JSON.stringify({ ...result.usage, retried: result.retried }));
        for (const c of out.clarifications ?? []) {
          db.prepare("INSERT INTO clarifications (id, recipe_version_id, question, related_field, source_segment_ids_json, provenance) VALUES (?,?,?,?,?,?)")
            .run(uuid(), rvId, c.question, c.related_field, JSON.stringify(c.source_segment_ids), "model");
        }
        db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
          .run(cacheKind, "extraction", "complete", rvId, createdAt);
        db.prepare("UPDATE jobs SET processing_state='draft_ready', updated_at=? WHERE id=?").run(createdAt, jobId);
        db.exec("COMMIT");
      } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
      return { recipeVersionId: rvId, cached: false };
    } catch (e) {
      try {
        db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
          .run(cacheKind, "extraction", "failed", null, nowIso());
        db.prepare("UPDATE jobs SET processing_state=?, updated_at=? WHERE id=?").run(priorState === "extracting" ? "transcript_ready" : priorState, nowIso(), jobId);
      } catch {}
      throw e;
    } finally {
      runningExtractions.delete(cacheKind);
    }
  })();
  runningExtractions.set(cacheKind, task);
  return task;
}

export function listRecipeVersions(jobId: string): { id: string; createdAt: string; reviewState: string; model: string }[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, created_at, review_state, model FROM recipe_versions WHERE job_id=? ORDER BY created_at DESC").all(jobId) as Record<string, string>[];
  return rows.map((r) => ({ id: String(r.id), createdAt: String(r.created_at), reviewState: String(r.review_state), model: String(r.model) }));
}

/* ---- Milestone C: real Voice Transcribe flow ---- */
import { TRANSCRIBE_MODEL_DEFAULT, TRANSCRIBE_OPTIONS_VERSION, transcribeAudio, type FetchImpl as TranscribeFetch } from "./meta-transcribe.ts";

export interface TranscriptionRequest { transcriptVersionId: string; cached: boolean; }

export function transcriptionCacheKey(recordingSha256: string, model: string): string {
  return createHashForCache("sha256")
    .update(`transcribe|${recordingSha256}|${model}|${TRANSCRIBE_OPTIONS_VERSION}`)
    .digest("hex");
}

// Single-process dedup guard: concurrent transcriptions for one cache key
// share a single paid call. Persisted model_cache 'running' rows cover
// restarts (cleared to failed/interrupted on startup in db.ts).
const runningTranscriptions = new Map<string, Promise<TranscriptionRequest>>();

export async function requestTranscription(
  jobId: string,
  opts?: { fetchImpl?: TranscribeFetch }
): Promise<TranscriptionRequest> {
  const db = getDb();
  const model = process.env.TRANSCRIBE_MODEL || TRANSCRIBE_MODEL_DEFAULT;
  const job = db.prepare("SELECT id, recording_id, mode, processing_state FROM jobs WHERE id=?").get(jobId) as
    { id: string; recording_id: string; mode: string; processing_state: string } | undefined;
  if (!job) throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
  if (job.mode === "sample") throw Object.assign(new Error("sample recipes use the fictional transcript"), { status: 400, code: "sample_mode" });
  const rec = db.prepare("SELECT relative_path, sha256 FROM recordings WHERE id=?").get(job.recording_id) as
    { relative_path: string; sha256: string } | undefined;
  if (!rec) throw Object.assign(new Error("recording missing"), { status: 404, code: "not_found" });
  const key = transcriptionCacheKey(rec.sha256, model);
  const cacheKind = `transcription:${key}`;

  const running = runningTranscriptions.get(cacheKind);
  if (running) return running;

  const existing = db.prepare("SELECT state, result_ref FROM model_cache WHERE cache_key=?").get(cacheKind) as
    { state: string; result_ref: string | null } | undefined;
  if (existing?.state === "running") throw Object.assign(new Error("transcription already running"), { status: 409, code: "transcription_running" });
  if (existing?.state === "complete" && existing.result_ref) {
    const hit = db.prepare("SELECT id, recording_id FROM transcript_versions WHERE id=?").get(existing.result_ref) as
      { id: string; recording_id: string } | undefined;
    if (hit && hit.recording_id === job.recording_id) return { transcriptVersionId: hit.id, cached: true };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(join(dataDir(), rec.relative_path)));
  } catch {
    throw Object.assign(new Error("audio file missing"), { status: 410, code: "audio_missing" });
  }
  if (!bytes.length) throw Object.assign(new Error("audio file empty"), { status: 410, code: "audio_missing" });

  const priorState = job.processing_state;
  const task = (async (): Promise<TranscriptionRequest> => {
    db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
      .run(cacheKind, "transcription", "running", null, nowIso());
    db.prepare("UPDATE jobs SET processing_state='transcribing', updated_at=? WHERE id=?").run(nowIso(), jobId);
    try {
      const result = await transcribeAudio(bytes, { model, fetchImpl: opts?.fetchImpl });
      if (!result.ok) {
        const status = result.code === "missing_key" || result.code === "bad_credentials" || result.code === "invalid_audio" ? 400
          : result.code === "rate_limited" ? 429 : 502;
        throw Object.assign(new Error(result.detail), { status, code: result.code });
      }
      const text = result.transcript;
      const segments = assignSegments(text);
      if (!segments.length) throw Object.assign(new Error("transcript empty"), { status: 502, code: "empty_transcript" });
      const original = db.prepare("SELECT id, text FROM transcript_versions WHERE recording_id=? AND kind='original' ORDER BY created_at ASC LIMIT 1").get(job.recording_id) as
        { id: string; text: string } | undefined;
      const at = nowIso();
      db.exec("BEGIN");
      try {
        let versionId: string;
        if (original) {
          versionId = original.id;
          db.prepare("UPDATE transcript_versions SET text=?, segments_json=?, created_at=?, approved_at=NULL WHERE id=?")
            .run(text, JSON.stringify(segments), at, versionId);
          // New source words must be approved again before extraction can
          // use them (changed text clears approval, as edits do).
          const jobRow = db.prepare("SELECT approved_transcript_version_id FROM jobs WHERE id=?").get(jobId) as
            { approved_transcript_version_id: string | null };
          if (jobRow.approved_transcript_version_id === versionId) {
            db.prepare("UPDATE jobs SET approved_transcript_version_id=NULL WHERE id=?").run(jobId);
          }
        } else {
          versionId = uuid();
          db.prepare("INSERT INTO transcript_versions (id, recording_id, kind, text, segments_json, created_at, approved_at) VALUES (?,?,?,?,?,?,?)")
            .run(versionId, job.recording_id, "original", text, JSON.stringify(segments), at, null);
        }
        db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
          .run(cacheKind, "transcription", "complete", versionId, at);
        db.prepare("UPDATE jobs SET processing_state='transcript_ready', safe_error_code=NULL, updated_at=? WHERE id=?").run(at, jobId);
        db.exec("COMMIT");
        return { transcriptVersionId: versionId, cached: false };
      } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
    } catch (e) {
      try {
        db.prepare("INSERT OR REPLACE INTO model_cache (cache_key, kind, state, result_ref, created_at) VALUES (?,?,?,?,?)")
          .run(cacheKind, "transcription", "failed", null, nowIso());
        const err = e as { code?: string };
        db.prepare("UPDATE jobs SET processing_state=?, safe_error_code=?, updated_at=? WHERE id=?")
          .run(priorState === "transcribing" ? "uploaded" : priorState, typeof err.code === "string" ? err.code : "failed", nowIso(), jobId);
      } catch {}
      throw e;
    } finally {
      runningTranscriptions.delete(cacheKind);
    }
  })();
  runningTranscriptions.set(cacheKind, task);
  return task;
}
