// Browser-local recipe box (deployed "local mode" only).
// Recipes, transcripts and audio Blobs live in IndexedDB on the visitor's
// own device; the server stores nothing. The pure record functions below
// mirror src/server/store.ts semantics (approval gating, review resets,
// separate family evidence) so both modes behave the same. AI calls still
// go to stateless server routes that hold the Meta key server-side.
import { assignSegments, type Segment } from "../server/segments.ts";
import { SAMPLE_FIXTURES, sampleFixtureById } from "../server/sample-fixture.ts";
import { validateRecipeDraft, type RecipeDraft } from "../server/validate.ts";

export type LocalMode = "sample" | "live-manual";

export interface LocalTranscriptVersion {
  id: string; text: string; segments: Segment[]; approvedAt: string | null; createdAt: string;
}
export interface LocalDraftVersion {
  id: string; output: RecipeDraft; reviewState: string; createdAt: string; model: string;
}
export interface LocalClarification {
  id: string; question: string; relatedField: string; sourceSegmentIds: string[];
  answer: string | null; provenance: string; answeredAt: string | null;
}
export interface LocalCorrection {
  id: string; targetField: string; correctedValue: unknown; createdAt: string; versionId: string;
}

export interface LocalRecipe {
  id: string; mode: LocalMode; processingState: string;
  cookName: string; dishName: string; languageHint: string;
  createdAt: string; updatedAt: string;
  audioBlob: Blob | null; audioType: string;
  originalTranscript: LocalTranscriptVersion | null;
  editedTranscripts: LocalTranscriptVersion[];
  approvedVersionId: string | null;
  drafts: LocalDraftVersion[];
  clarifications: LocalClarification[];
  corrections: LocalCorrection[];
}

function fail(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}
function now(): string { return new Date().toISOString(); }
function uid(): string { return crypto.randomUUID(); }

export function createSampleLocal(input: { cookName: string; dishName?: string; languageHint?: string; consent: boolean; fixtureId?: string }, audioBlob: Blob | null): LocalRecipe {
  if (!input.consent) fail(400, "consent_required", "consent required");
  if (!input.cookName.trim()) fail(400, "cook_required", "cook name required");
  const fixture = sampleFixtureById(input.fixtureId);
  const createdAt = now();
  const dishName = input.dishName?.trim() || fixture.dishName;
  const segments = assignSegments(fixture.transcriptText);
  const check = validateRecipeDraft(fixture.recipe, segments);
  if (!check.ok) throw new Error("sample fixture invalid: " + check.errors.join("; "));
  const output: RecipeDraft = { ...fixture.recipe, dish_name: dishName === fixture.dishName ? fixture.recipe.dish_name : dishName };
  const tvId = uid(); const rvId = uid();
  return {
    id: uid(), mode: "sample", processingState: "draft_ready",
    cookName: input.cookName.trim(), dishName, languageHint: input.languageHint?.trim() ?? "",
    createdAt, updatedAt: createdAt,
    audioBlob, audioType: "audio/wav",
    originalTranscript: { id: tvId, text: fixture.transcriptText, segments, approvedAt: createdAt, createdAt },
    editedTranscripts: [], approvedVersionId: tvId,
    drafts: [{ id: rvId, output, reviewState: "draft", createdAt, model: "sample-fixture" }],
    clarifications: fixture.recipe.clarifications.map((c) => ({
      id: uid(), question: c.question, relatedField: c.related_field,
      sourceSegmentIds: c.source_segment_ids, answer: null, provenance: "model", answeredAt: null,
    })),
    corrections: [],
  };
}

// Fictional samples to pre-load once; returns only fixtures not already present.
export function missingSampleFixtures(existing: LocalRecipe[]): typeof SAMPLE_FIXTURES {
  const names = new Set(existing.filter((r) => r.mode === "sample").map((r) => r.dishName));
  return SAMPLE_FIXTURES.filter((f) => !names.has(f.dishName));
}

export function createUploadLocal(input: { cookName: string; dishName: string; languageHint?: string; consent: boolean }, audioBlob: Blob): LocalRecipe {
  if (!input.consent) fail(400, "consent_required", "consent required");
  if (!input.cookName.trim()) fail(400, "cook_required", "cook name required");
  if (!input.dishName.trim()) fail(400, "dish_required", "dish name required");
  const createdAt = now();
  return {
    id: uid(), mode: "live-manual", processingState: "uploaded",
    cookName: input.cookName.trim(), dishName: input.dishName.trim(), languageHint: input.languageHint?.trim() ?? "",
    createdAt, updatedAt: createdAt,
    audioBlob, audioType: "audio/wav",
    originalTranscript: { id: uid(), text: "", segments: [], approvedAt: null, createdAt },
    editedTranscripts: [], approvedVersionId: null,
    drafts: [], clarifications: [], corrections: [],
  };
}

function latestDraft(rec: LocalRecipe): LocalDraftVersion | null {
  return rec.drafts[0] ?? null;
}

function resetReview(rec: LocalRecipe): void {
  const d = latestDraft(rec);
  if (d) d.reviewState = "draft";
}

export function editTranscriptLocal(rec: LocalRecipe, text: string): LocalRecipe {
  const clean = text.trim();
  if (!clean) fail(400, "empty_transcript", "transcript empty");
  const createdAt = now();
  const version: LocalTranscriptVersion = {
    id: uid(), text: clean, segments: assignSegments(clean), approvedAt: null, createdAt,
  };
  rec.editedTranscripts = [...rec.editedTranscripts, version];
  rec.approvedVersionId = null;
  if (rec.processingState === "draft_ready") rec.processingState = "transcript_ready";
  rec.updatedAt = createdAt;
  resetReview(rec);
  return rec;
}

export function approveTranscriptLocal(rec: LocalRecipe, versionId: string): LocalRecipe {
  const all = [rec.originalTranscript, ...rec.editedTranscripts].filter(Boolean) as LocalTranscriptVersion[];
  const tv = all.find((t) => t.id === versionId);
  if (!tv) fail(400, "version_not_found", "version not found");
  tv.approvedAt = now();
  rec.approvedVersionId = versionId;
  rec.processingState = rec.mode === "sample" ? "draft_ready"
    : rec.processingState === "draft_ready" ? "draft_ready" : "transcript_ready";
  rec.updatedAt = now();
  return rec;
}

export function applyTranscriptionLocal(rec: LocalRecipe, text: string): LocalRecipe {
  const clean = text.trim();
  if (!clean) fail(502, "empty_transcript", "transcript empty");
  const segments = assignSegments(clean);
  if (!segments.length) fail(502, "empty_transcript", "transcript empty");
  const at = now();
  if (rec.originalTranscript) {
    if (rec.approvedVersionId === rec.originalTranscript.id) rec.approvedVersionId = null;
    rec.originalTranscript = { ...rec.originalTranscript, text: clean, segments, approvedAt: null, createdAt: at };
  } else {
    rec.originalTranscript = { id: uid(), text: clean, segments, approvedAt: null, createdAt: at };
  }
  rec.processingState = "transcript_ready";
  rec.updatedAt = at;
  return rec;
}

export function answerLocal(rec: LocalRecipe, clarificationId: string, answer: string): LocalRecipe {
  const row = rec.clarifications.find((c) => c.id === clarificationId);
  if (!latestDraft(rec)) fail(400, "no_draft", "no draft");
  if (!row) fail(404, "not_found", "question not found");
  const clean = answer.trim().slice(0, 2000);
  if (!clean) fail(400, "empty_answer", "answer empty");
  row.answer = clean; row.answeredAt = now(); row.provenance = "family";
  resetReview(rec);
  return rec;
}

export function correctLocal(rec: LocalRecipe, targetField: string, correctedValue: unknown): LocalRecipe {
  const field = targetField.trim().slice(0, 200);
  if (!field) fail(400, "field_required", "field required");
  const draft = latestDraft(rec);
  if (!draft) fail(400, "no_draft", "no draft");
  rec.corrections = [...rec.corrections, {
    id: uid(), targetField: field, correctedValue, createdAt: now(), versionId: draft.id,
  }];
  resetReview(rec);
  return rec;
}

export function reviewLocal(rec: LocalRecipe, reviewState: string): LocalRecipe {
  if (!["draft", "reviewed_with_unknowns", "confirmed"].includes(reviewState)) fail(400, "bad_state", "bad state");
  const draft = latestDraft(rec);
  if (!draft) fail(400, "no_draft", "no draft");
  draft.reviewState = reviewState;
  rec.updatedAt = now();
  return rec;
}

export function extractionInputLocal(rec: LocalRecipe): { segments: Segment[]; dishName: string; notes: { label: string; text: string }[] } {
  if (!rec.approvedVersionId) fail(400, "no_approved_transcript", "approve a transcript first");
  const all = [rec.originalTranscript, ...rec.editedTranscripts].filter(Boolean) as LocalTranscriptVersion[];
  const tv = all.find((t) => t.id === rec.approvedVersionId);
  if (!tv) fail(400, "version_not_found", "approved version missing");
  if (!tv.text.trim() || !tv.segments.length) fail(400, "empty_transcript", "approved transcript is empty");
  const notes: { label: string; text: string }[] = [];
  for (const a of rec.clarifications) {
    if (a.answer) notes.push({ label: `Family answer (${a.question.slice(0, 80)})`, text: a.answer });
  }
  const draft = latestDraft(rec);
  for (const c of rec.corrections) {
    if (!draft || c.versionId === draft.id) notes.push({ label: `Family correction (${c.targetField})`, text: JSON.stringify(c.correctedValue) });
  }
  return { segments: tv.segments, dishName: rec.dishName, notes };
}

export function applyExtractionLocal(rec: LocalRecipe, output: RecipeDraft, model: string): LocalRecipe {
  const { segments } = extractionInputLocal(rec);
  const check = validateRecipeDraft(output, segments);
  if (!check.ok) fail(502, "invalid_output", "Model output failed grounding checks: " + check.errors.slice(0, 3).join("; "));
  const rvId = uid(); const createdAt = now();
  rec.drafts = [{ id: rvId, output, reviewState: "draft", createdAt, model }, ...rec.drafts];
  rec.clarifications = (output.clarifications ?? []).map((c) => ({
    id: uid(), question: c.question, relatedField: c.related_field,
    sourceSegmentIds: c.source_segment_ids, answer: null, provenance: "model", answeredAt: null,
  }));
  rec.processingState = "draft_ready";
  rec.updatedAt = createdAt;
  return rec;
}

export interface LocalDetail {
  id: string; mode: string; processingState: string;
  cookName: string; dishName: string; languageHint: string; consentAt: string; createdAt: string;
  audioUrl: string; hasPhoto: boolean;
  originalTranscript: { id: string; text: string; segments: Segment[] } | null;
  editedTranscripts: { id: string; text: string; approvedAt: string | null; createdAt: string }[];
  approvedVersionId: string | null;
  draft: { id: string; output: RecipeDraft; reviewState: string; createdAt: string } | null;
  clarifications: LocalClarification[];
  corrections: LocalCorrection[];
  versions: { id: string; createdAt: string; reviewState: string; model: string }[];
}

export function toDetail(rec: LocalRecipe): LocalDetail {
  const draft = latestDraft(rec);
  return {
    id: rec.id, mode: rec.mode, processingState: rec.processingState,
    cookName: rec.cookName, dishName: rec.dishName, languageHint: rec.languageHint,
    consentAt: rec.createdAt, createdAt: rec.createdAt,
    audioUrl: "", hasPhoto: false,
    originalTranscript: rec.originalTranscript
      ? { id: rec.originalTranscript.id, text: rec.originalTranscript.text, segments: rec.originalTranscript.segments }
      : null,
    editedTranscripts: rec.editedTranscripts.map((t) => ({ id: t.id, text: t.text, approvedAt: t.approvedAt, createdAt: t.createdAt })),
    approvedVersionId: rec.approvedVersionId,
    draft: draft ? { id: draft.id, output: draft.output, reviewState: draft.reviewState, createdAt: draft.createdAt } : null,
    clarifications: rec.clarifications,
    corrections: rec.corrections,
    versions: rec.drafts.map((d) => ({ id: d.id, createdAt: d.createdAt, reviewState: d.reviewState, model: d.model })),
  };
}

export function toListItem(rec: LocalRecipe): { id: string; dishName: string; mode: string; processingState: string; reviewState: string | null; updatedAt: string } {
  return {
    id: rec.id, dishName: rec.dishName, mode: rec.mode, processingState: rec.processingState,
    reviewState: latestDraft(rec)?.reviewState ?? null, updatedAt: rec.updatedAt,
  };
}

/* ---- IndexedDB persistence (browser only; called lazily) ---- */

const DB_NAME = "grandma-recipe-box";
const STORE = "recipes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function localSave(rec: LocalRecipe): Promise<void> {
  await tx("readwrite", (s) => s.put(rec));
}
export async function localGet(id: string): Promise<LocalRecipe | null> {
  return (await tx<LocalRecipe | undefined>("readonly", (s) => s.get(id))) ?? null;
}
export async function localList(): Promise<LocalRecipe[]> {
  const all = await tx<LocalRecipe[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function localDelete(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
