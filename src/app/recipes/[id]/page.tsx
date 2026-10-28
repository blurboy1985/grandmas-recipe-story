"use client";
import { use, useCallback, useEffect, useState } from "react";
import {
  answerLocal, applyExtractionLocal, applyTranscriptionLocal, approveTranscriptLocal,
  correctLocal, editTranscriptLocal, extractionInputLocal, localDelete, localGet,
  localSave, reviewLocal, toDetail,
} from "@/lib/local-recipes";
import type { RecipeDraft } from "@/server/validate";

const LOCAL = process.env.NEXT_PUBLIC_LOCAL_MODE === "1";

interface Detail {
  id: string; mode: string; processingState: string;
  cookName: string; dishName: string; languageHint: string;
  audioUrl: string;
  originalTranscript: { id: string; text: string; segments: { id: string; text: string }[] } | null;
  editedTranscripts: { id: string; text: string; approvedAt: string | null }[];
  approvedVersionId: string | null;
  draft: { id: string; reviewState: string; output: {
    dish_name: string | null;
    ingredients: { name: string; quantity_text: string | null; original_words: string; source_segment_ids: string[]; needs_confirmation: boolean }[];
    steps: { instruction: string; source_segment_ids: string[]; needs_confirmation: boolean }[];
    story: { paraphrase: string; source_segment_ids: string[]; quotes: { text: string; source_segment_id: string }[] };
  } } | null;
  clarifications: { id: string; question: string; relatedField: string; sourceSegmentIds: string[]; answer: string | null; provenance: string; answeredAt: string | null }[];
  corrections: { id: string; targetField: string; correctedValue: unknown; versionId: string }[];
  versions: { id: string; createdAt: string; reviewState: string; model: string }[];
}

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [editText, setEditText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [correctField, setCorrectField] = useState("");
  const [correctValue, setCorrectValue] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeNote, setTranscribeNote] = useState("");
  const [audioObjectUrl, setAudioObjectUrl] = useState("");

  async function extract(regenerate: boolean) {
    if (regenerate && !confirm("Generate a new draft version? AI-generated fields may change; earlier versions, your answers, and your manual corrections are kept.")) return;
    setError(""); setExtractNote(""); setExtracting(true);
    try {
      if (LOCAL) {
        const rec = await localGet(id);
        if (!rec) { setError("Could not load this recipe."); return; }
        let input;
        try { input = extractionInputLocal(rec); } catch (err) {
          setError((err as { message?: string }).message ?? "extraction failed");
          return;
        }
        const res = await fetch("/api/ai/extract", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json() as { output?: RecipeDraft; model?: string; error?: string; code?: string };
        if (!res.ok || !data.output) { setError(data.code ? `${data.error} (code: ${data.code})` : (data.error ?? "extraction failed")); return; }
        applyExtractionLocal(rec, data.output, data.model ?? "muse-spark-1.3");
        await localSave(rec);
        setExtractNote("New draft generated from the approved transcript and saved in this browser.");
        return;
      }
      const res = await fetch(`/api/recipes/${id}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate }) });
      const data = await res.json() as { error?: string; code?: string; cached?: boolean };
      if (!res.ok) { setError(data.code ? `${data.error} (code: ${data.code})` : (data.error ?? "extraction failed")); return; }
      setExtractNote(data.cached ? "Reused the saved draft — no model call was made." : "New draft generated from the approved transcript.");
    } finally { setExtracting(false); await refresh(); }
  }

  async function transcribe() {
    setError(""); setTranscribeNote(""); setTranscribing(true);
    try {
      if (LOCAL) {
        const rec = await localGet(id);
        if (!rec?.audioBlob) { setError("Recording is missing from this browser."); return; }
        const form = new FormData();
        form.append("audio", rec.audioBlob, "recording.wav");
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
        const data = await res.json() as { transcript?: string; error?: string; code?: string };
        if (!res.ok || !data.transcript) { setError(data.code ? `${data.error} (code: ${data.code})` : (data.error ?? "transcription failed")); return; }
        applyTranscriptionLocal(rec, data.transcript);
        await localSave(rec);
        setTranscribeNote("Transcript received and saved in this browser. Review it below, then approve a version before extraction.");
        return;
      }
      const res = await fetch(`/api/recipes/${id}/transcribe`, { method: "POST" });
      const data = await res.json() as { error?: string; code?: string; cached?: boolean };
      if (!res.ok) { setError(data.code ? `${data.error} (code: ${data.code})` : (data.error ?? "transcription failed")); return; }
      setTranscribeNote(data.cached ? "Reused the saved transcript — no model call was made." : "Transcript received. Review it below, then approve a version before extraction.");
    } finally { setTranscribing(false); await refresh(); }
  }

  const refresh = useCallback(async () => {
    if (LOCAL) {
      const rec = await localGet(id);
      if (!rec) { setError("Could not load this recipe."); return; }
      const data = toDetail(rec) as unknown as Detail;
      setDetail(data);
      setEditText(data.editedTranscripts.at(-1)?.text ?? data.originalTranscript?.text ?? "");
      const a: Record<string, string> = {};
      for (const c of data.clarifications) a[c.id] = c.answer ?? "";
      setAnswers(a);
      setAudioObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return rec.audioBlob ? URL.createObjectURL(rec.audioBlob) : "";
      });
      return;
    }
    const res = await fetch(`/api/recipes/${id}`);
    if (!res.ok) { setError("Could not load this recipe."); return; }
    const data = await res.json() as Detail;
    setDetail(data);
    setEditText(data.editedTranscripts.at(-1)?.text ?? data.originalTranscript?.text ?? "");
    const a: Record<string, string> = {};
    for (const c of data.clarifications) a[c.id] = c.answer ?? "";
    setAnswers(a);
  }, [id]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function act(body: Record<string, unknown>) {
    setError("");
    if (LOCAL) {
      try {
        const rec = await localGet(id);
        if (!rec) { setError("Could not load this recipe."); return; }
        if (body.action === "edit-transcript") editTranscriptLocal(rec, String(body.text ?? ""));
        else if (body.action === "approve-transcript") approveTranscriptLocal(rec, String(body.versionId ?? ""));
        else if (body.action === "answer") answerLocal(rec, String(body.clarificationId ?? ""), String(body.answer ?? ""));
        else if (body.action === "correct") correctLocal(rec, String(body.targetField ?? ""), body.correctedValue ?? null);
        else if (body.action === "review") reviewLocal(rec, String(body.reviewState ?? ""));
        else { setError("unknown action"); return; }
        await localSave(rec);
      } catch (err) {
        setError((err as { message?: string }).message ?? "action failed");
      }
      await refresh();
      return;
    }
    const res = await fetch(`/api/recipes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json() as { error?: string };
    if (!res.ok) setError(data.error ?? "action failed");
    await refresh();
  }

  async function remove() {
    if (!confirm("Delete this recipe, its transcripts and its audio?")) return;
    if (LOCAL) await localDelete(id);
    else await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    window.location.href = "/";
  }

  if (!detail) return <main><p>Loading…</p>{error ? <p className="error">{error}</p> : null}</main>;
  const steps = ["upload", "transcript_ready", "draft_ready"];
  const doneIdx = detail.processingState === "draft_ready" ? 3 : detail.processingState === "transcript_ready" ? 2 : 1;

  return (
    <main>
      <p className="noprint"><a href="/">← Back to the recipe box</a></p>
      <h1 className="recipe-title">{detail.dishName || "(untitled)"}</h1>
      <p>
        <span className="badge">{detail.mode === "sample" ? "SAMPLE MODE — fictional data" : "UPLOADED RECORDING — live transcription"}</span>
        {LOCAL ? <span className="badge">SAVED IN THIS BROWSER</span> : null}
      </p>
      <ol className="progress noprint">
        <li className={doneIdx >= 1 ? "done" : ""}>Upload</li>
        <li className={doneIdx >= 2 ? "done" : ""}>Transcript</li>
        <li className={doneIdx >= 3 ? "done" : ""}>Draft &amp; card</li>
      </ol>
      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <h2>Recording</h2>
        <p className="muted">Cook: {detail.cookName || "—"}{detail.languageHint ? ` · languages: ${detail.languageHint}` : ""}</p>
        <audio controls src={LOCAL ? audioObjectUrl : detail.audioUrl} className="noprint" />
        {detail.mode === "sample" ? <p className="muted">Sample tone stands in for a family recording. It is fictional and committed on purpose.</p> : null}
      </section>

      {detail.mode !== "sample" ? (
        <section className="card noprint">
          <h2>Live transcription (Voice)</h2>
          {detail.originalTranscript?.text ? (
            <p className="muted">Transcript on file. Refreshing or reopening never calls the model again.</p>
          ) : (
            <>
              <p className="muted">No transcript yet. Transcribing is one paid Voice call over the validated WAV; the original audio is kept unchanged.{LOCAL ? " The audio is sent once for transcription and is not saved on the server; the transcript is saved in this browser." : ""}</p>
              <div className="row">
                <button onClick={() => void transcribe()} disabled={transcribing}>{transcribing ? "Transcribing…" : "Transcribe with Voice"}</button>
              </div>
            </>
          )}
          {transcribeNote ? <p className="muted">{transcribeNote}</p> : null}
          {detail.processingState === "failed" ? <p className="muted">Last attempt failed — the message above names the cause. Retry with the button when ready.</p> : null}
        </section>
      ) : null}

      <section className="card sage">
        <h2>Transcript review</h2>
        <h3>Original (kept unchanged)</h3>
        <p className="source-text">{detail.originalTranscript?.text || <span className="muted">{detail.mode === "sample" ? "No transcript yet — type it below, then approve." : "No transcript yet — transcribe above, or type it below, then approve."}</span>}</p>
        {detail.originalTranscript ? (
          <ul className="segments muted">{detail.originalTranscript.segments.map((s) => <li key={s.id}><span className="seg-id">{s.id}</span> · {s.text}</li>)}</ul>
        ) : null}
        <label>Editable transcript<textarea value={editText} onChange={(e) => setEditText(e.target.value)} /></label>
        <div className="row noprint">
          <button className="secondary" onClick={() => void act({ action: "edit-transcript", text: editText })}>Save as edited version</button>
          {detail.editedTranscripts.map((t) => (
            <button key={t.id} className="secondary" onClick={() => void act({ action: "approve-transcript", versionId: t.id })}>Approve edited {t.id.slice(0, 8)}</button>
          ))}
          {detail.originalTranscript ? (
            <button className="secondary" onClick={() => void act({ action: "approve-transcript", versionId: detail.originalTranscript!.id })}>Approve original</button>
          ) : null}
        </div>
        <p className="muted">Approved version: {detail.approvedVersionId ?? "none yet"}. Extraction only uses the approved version.</p>
      </section>

      <section className="card sage noprint">
        <h2>Recipe extraction (Spark)</h2>
        {detail.approvedVersionId ? (
          <>
            <p className="muted">Approved transcript {detail.approvedVersionId.slice(0, 8)} is ready. Generating a draft is one paid Spark call; reopening or refreshing never calls the model.</p>
            <div className="row">
              {!detail.draft ? <button onClick={() => void extract(false)} disabled={extracting}>{extracting ? "Generating…" : "Generate draft with Spark"}</button> : null}
              {detail.draft ? <button className="secondary" onClick={() => void extract(true)} disabled={extracting}>{extracting ? "Generating…" : "Regenerate (keeps versions + edits)"}</button> : null}
            </div>
            {extractNote ? <p className="muted">{extractNote}</p> : null}
            {detail.versions.length > 1 ? (
              <ul className="muted">{detail.versions.map((v) => <li key={v.id}>Version {v.id.slice(0, 8)} · {v.createdAt} · {v.reviewState} · {v.model}</li>)}</ul>
            ) : null}
          </>
        ) : <p className="muted">Approve a transcript above first — extraction only uses the approved version.</p>}
      </section>

      {detail.draft ? (
        <section className="card">
          <h2>The recipe card</h2>
          <h3>Ingredients</h3>
          <table><thead><tr><th>Ingredient</th><th>Quantity</th><th>In her words</th></tr></thead><tbody>
            {detail.draft.output.ingredients.map((g, i) => (
              <tr key={i}><td>{g.name}{g.needs_confirmation ? " *" : ""}</td>
                <td>{g.quantity_text ?? <span className="unknown">unknown</span>}</td>
                <td><span className="muted">“{g.original_words}” · <span className="seg-id">{g.source_segment_ids.join(", ")}</span></span></td></tr>
            ))}
          </tbody></table>
          <h3>Method</h3>
          <ol className="steps">{detail.draft.output.steps.map((s, i) => <li key={i}>{s.instruction} <span className="seg-id">· {s.source_segment_ids.join(", ")}</span></li>)}</ol>
          <h3>Family story (paraphrase)</h3>
          <p className="story">{detail.draft.output.story.paraphrase}</p>
          {detail.draft.output.story.quotes.map((q, i) => <p key={i} className="quote">“{q.text}” <span className="seg-id">verified quote · {q.source_segment_id}</span></p>)}
          <p className="muted">* needs family confirmation. Generated prose is a paraphrase; only the verified quotes are exact words.</p>
        </section>
      ) : (
        <section className="card"><h2>The recipe card</h2><p className="muted">Nothing written on this card yet — generate a draft above once a transcript is approved.</p></section>
      )}

      {detail.clarifications.length > 0 ? (
        <section className="card">
          <h2>Clarification (at most three)</h2>
          {detail.clarifications.map((c) => (
            <div key={c.id}>
              <label>{c.question}<span className="muted"> · {c.relatedField} · {c.sourceSegmentIds.join(", ")}</span>
                <input type="text" value={answers[c.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [c.id]: e.target.value })} />
              </label>
              <div className="row noprint"><button className="secondary" onClick={() => void act({ action: "answer", clarificationId: c.id, answer: answers[c.id] ?? "" })}>Save answer</button></div>
              {c.answer ? <p className="muted">Family answer{c.answeredAt ? ` · saved ${c.answeredAt}` : ""} — used as evidence if you regenerate.</p> : <p className="muted">Model question — awaiting a family answer.</p>}
            </div>
          ))}
        </section>
      ) : null}

      <section className="card sage">
        <h2>Family corrections</h2>
        {detail.corrections.length === 0 ? <p className="muted">No corrections yet. Corrections are stored separately and never silently rewrite the draft.</p> : (
          <ul>{detail.corrections.map((c) => <li key={c.id}><strong>{c.targetField}</strong>: {JSON.stringify(c.correctedValue)} <span className="muted">· v{c.versionId.slice(0, 8)}</span></li>)}</ul>
        )}
        <label>Field to correct<input type="text" value={correctField} onChange={(e) => setCorrectField(e.target.value)} placeholder="e.g. ingredients[salt]" /></label>
        <label>Corrected value<input type="text" value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} placeholder="e.g. 1/2 teaspoon" /></label>
        <div className="row noprint"><button className="secondary" onClick={() => { void act({ action: "correct", targetField: correctField, correctedValue: correctValue }); }}>Save correction</button></div>
      </section>

      <section className="card">
        <h2>Keep this card</h2>
        <p className="muted">Review state: {detail.draft?.reviewState ?? "no draft"}. “Confirmed” means the family reviewed it — unknowns stay visible and it is not a proof of factual accuracy. New answers, corrections, or transcript edits return the draft to “draft” until re-reviewed.</p>
        <div className="row noprint">
          <button className="secondary" onClick={() => void act({ action: "review", reviewState: "reviewed_with_unknowns" })}>Mark reviewed</button>
          <button className="secondary" onClick={() => void act({ action: "review", reviewState: "confirmed" })}>Mark confirmed</button>
          <button className="secondary" onClick={() => window.print()}>Print / save PDF</button>
          <button className="secondary" onClick={() => void remove()}>Delete</button>
        </div>
      </section>
    </main>
  );
}
