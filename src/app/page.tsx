"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSampleLocal, createUploadLocal, localList, localSave, missingSampleFixtures, toListItem } from "@/lib/local-recipes";
import { formatTimer, pickMimeType, recordedBlobToWav, recorderSupported, RECORD_MAX_MS, RECORD_MIN_MS } from "@/lib/recorder";
import { resolveSaveDetails } from "@/lib/save-details";
import { validateUpload } from "@/server/audio";

const LOCAL = process.env.NEXT_PUBLIC_LOCAL_MODE === "1";
const SEED_KEY = "grs-seeded-v1";

interface RecipeListItem { id: string; dishName: string; mode: string; processingState: string; reviewState: string | null; updatedAt: string; }
type RecPhase = "idle" | "recording" | "preview" | "saving";

export default function Home() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [cookName, setCookName] = useState("");
  const [dishName, setDishName] = useState("");
  const [languageHint, setLanguageHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadState, setUploadState] = useState("");
  const [fileName, setFileName] = useState("");

  const [phase, setPhase] = useState<RecPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recNote, setRecNote] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const recordedRef = useRef<Blob | null>(null);
  const seededRef = useRef(false);
  const supported = typeof window === "undefined" ? true : recorderSupported();

  const refresh = useCallback(async () => {
    try {
      if (LOCAL) { setRecipes((await localList()).map(toListItem)); return; }
      const res = await fetch("/api/recipes");
      const data = await res.json() as { recipes: RecipeListItem[] };
      setRecipes(data.recipes ?? []);
    } catch { setRecipes([]); }
  }, []);

  const seedSamples = useCallback(async () => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      if (window.localStorage.getItem(SEED_KEY) === "1") return;
      if (LOCAL) {
        const missing = missingSampleFixtures(await localList());
        if (missing.length) {
          let audioBlob: Blob | null = null;
          try { const r = await fetch("/api/sample-audio"); if (r.ok) audioBlob = await r.blob(); } catch { audioBlob = null; }
          for (const f of missing) {
            await localSave(createSampleLocal({ cookName: "Sample Cook (fictional)", dishName: f.dishName, consent: true, fixtureId: f.id }, audioBlob));
          }
        }
      } else {
        await fetch("/api/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "seed-samples" }) });
      }
      window.localStorage.setItem(SEED_KEY, "1");
    } catch { /* seeding is best-effort; the box still works without it */ }
  }, []);

  useEffect(() => { void (async () => { await seedSamples(); await refresh(); })(); }, [seedSamples, refresh]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function saveWav(wav: Blob, sourceLabel: string) {
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const checked = validateUpload(bytes);
    if (!checked.ok) { setError(`Recording not saved: ${checked.error === "too_short" ? "record at least 1 minute" : checked.error}. ${sourceLabel}`); return; }
    // No form gate: details are optional, saving is the deliberate action.
    const details = resolveSaveDetails({ cookName, dishName, languageHint });
    if (LOCAL) {
      const rec = createUploadLocal({ ...details, consent: true }, wav);
      await localSave(rec);
      window.location.href = `/recipes/${rec.id}`;
      return;
    }
    const form = new FormData();
    form.append("audio", new File([wav], "recording.wav", { type: "audio/wav" }));
    form.set("cookName", details.cookName); form.set("dishName", details.dishName);
    form.set("languageHint", details.languageHint); form.set("consent", "true");
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json() as { id?: string; error?: string };
    if (!res.ok || !data.id) { setError(data.error ?? "upload failed"); return; }
    window.location.href = `/recipes/${data.id}`;
  }

  async function startRecording() {
    setError(""); setRecNote("");
    if (!recorderSupported()) { setError("Browser recording needs a secure page (HTTPS or localhost) and microphone permission. Use “Upload a WAV instead” below."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recordedRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("preview");
        setRecNote(Date.now() - startedRef.current < RECORD_MIN_MS ? "A little short — cards need 1–5 minutes. Re-record a longer telling, or keep it and try saving." : "Listen back, then save it as a card.");
      };
      recorder.start(1000);
      startedRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedRef.current;
        setElapsed(ms);
        if (ms >= RECORD_MAX_MS && recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, 250);
    } catch { setError("Microphone was not allowed. Allow it in the browser, or upload a WAV instead."); }
  }

  function stopRecording() { recorderRef.current?.stop(); }

  function discardRecording() {
    recordedRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(""); setElapsed(0); setPhase("idle"); setRecNote("");
  }

  async function saveRecording() {
    if (!recordedRef.current) return;
    setPhase("saving"); setError("");
    try {
      const { wav } = await recordedBlobToWav(recordedRef.current);
      await saveWav(wav, "Your browser take is kept as the preview above.");
      setPhase("preview");
    } catch { setError("Could not convert that recording to WAV. Try recording again, or upload a WAV."); setPhase("preview"); }
  }

  async function uploadWav(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setUploadState("Uploading…");
    const form = new FormData(e.currentTarget);
    const file = form.get("audio");
    if (!(file instanceof Blob)) { setError("audio file required"); setUploadState(""); return; }
    try {
      const wav = file.type === "audio/wav" || file.name.endsWith(".wav") ? file : file;
      await saveWav(wav, "");
      setUploadState("Saved. Opening…");
    } catch (err) { setError((err as { message?: string }).message ?? "upload failed"); setUploadState(""); }
  }

  async function openSample(fixtureId: string, sampleDish: string) {
    setError(""); setBusy(true);
    try {
      if (LOCAL) {
        const existing = (await localList()).find((r) => r.mode === "sample" && r.dishName === sampleDish);
        if (existing) { window.location.href = `/recipes/${existing.id}`; return; }
        let audioBlob: Blob | null = null;
        try { const r = await fetch("/api/sample-audio"); if (r.ok) audioBlob = await r.blob(); } catch { audioBlob = null; }
        const rec = createSampleLocal({ cookName: "Sample Cook (fictional)", dishName: sampleDish, consent: true, fixtureId }, audioBlob);
        await localSave(rec);
        window.location.href = `/recipes/${rec.id}`;
        return;
      }
      const res = await fetch("/api/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "sample", cookName: "Sample Cook (fictional)", dishName: sampleDish, consent: true, fixtureId }) });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) { setError(data.error ?? "could not open sample"); return; }
      window.location.href = `/recipes/${data.id}`;
    } finally { setBusy(false); }
  }

  const samples = recipes.filter((r) => r.mode === "sample");
  const mine = recipes.filter((r) => r.mode !== "sample");

  return (
    <main className="home">
      {/* ——— Landing: one light section ——— */}
      <section className="landing" aria-labelledby="landingTitle">
        <div className="landing-copy">
          <h1 id="landingTitle">Recipes fade.<br />Her voice shouldn&rsquo;t.</h1>
          <p className="landing-sub">Record Grandma telling one dish. Keep her voice with the recipe — exactly as she said it.</p>
          <div className="landing-ctas noprint">
            <a className="btn-primary" href="#preserve">Record her recipe</a>
            <a className="btn-ghost" href="#recipe-box">See sample cards ↓</a>
          </div>
          <p className="landing-note">Nothing invented · Her voice, always kept <span className="landing-mode">{LOCAL ? "· Saved in this browser" : "· Sample mode"}</span></p>
        </div>
        <div className="landing-visual">
          <figure className="photo-old">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/grandma-old-photo.jpg" alt="Fictional vintage-style photo of a grandma steaming fish in a home kitchen" />
            <figcaption>Ah Ma&rsquo;s festive fish</figcaption>
          </figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="grandma-char" src="/grandma-character.jpg" alt="Illustrated grandma waving, holding a ladle beside a steaming bowl" />
          <span className="steam landing-steam" aria-hidden="true"><span /><span /><span /></span>
          <span className="speech hand" aria-hidden="true">“a bit — enough for the colour”</span>
          <p className="landing-credit">Illustrations shown — your family photos stay private.</p>
        </div>
      </section>
      {LOCAL ? <p className="muted home-note">Cards, transcripts and recordings live in this browser on this device only — no sync, and clearing site data deletes them. Saving is ordinary code, never an AI call.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="home-grid" id="preserve">
        <section className="card record-card" aria-labelledby="recordTitle">
          <h2 id="recordTitle"><span className="num">1</span> Record her recipe</h2>
          <p className="card-intro">Press record first — just press it and let her talk. <span className="hand">One dish, 1–5 minutes.</span> Name it later, only if you want.</p>

          <div className="recorder noprint">
            {phase === "recording" ? (
              <>
                <p className="rec-status"><span className="rec-dot" aria-hidden="true" /> Recording {formatTimer(elapsed)} <span className="muted">/ {formatTimer(RECORD_MAX_MS)} max{elapsed < RECORD_MIN_MS ? ` · at least ${formatTimer(RECORD_MIN_MS)} needed` : ""}</span></p>
                <div className="row"><button type="button" onClick={stopRecording}>Stop &amp; listen back</button></div>
              </>
            ) : phase === "preview" || phase === "saving" ? (
              <>
                {previewUrl ? <audio controls src={previewUrl} /> : null}
                <p className="muted">{recNote}</p>
                <div className="row">
                  <button type="button" onClick={() => void saveRecording()} disabled={phase === "saving"}>{phase === "saving" ? "Saving…" : "Save this take as a card"}</button>
                  <button type="button" className="secondary" onClick={discardRecording} disabled={phase === "saving"}>Discard &amp; re-record</button>
                </div>
              </>
            ) : (
              <>
                <div className="row">
                  <button type="button" onClick={() => void startRecording()} disabled={!supported}>● Record in this browser</button>
                  {!supported ? <span className="muted">Recording needs HTTPS/localhost + microphone — upload a WAV instead.</span> : <span className="muted">Microphone only; nothing is sent until you save.</span>}
                </div>
              </>
            )}
          </div>

          <div className="save-details">
            <h3>Name this card <span className="hand">— optional</span></h3>
            <label>Her name<input type="text" value={cookName} onChange={(e) => setCookName(e.target.value)} placeholder="e.g. Ah Ma, Popo, Nai Nai" /></label>
            <label>The dish<input type="text" value={dishName} onChange={(e) => setDishName(e.target.value)} placeholder="e.g. Steamed pomfret, the festive way" /></label>
            <label>Language she tells it in<input type="text" value={languageHint} onChange={(e) => setLanguageHint(e.target.value)} placeholder="e.g. Hokkien, with a little Teochew" /></label>
            <p className="muted">Leave blank and it saves as “Grandma · Untitled dish”.</p>
          </div>

          <details className="upload-fallback">
            <summary>Already have a recording? Upload a WAV instead</summary>
            <p className="muted">Mono PCM 16-bit WAV, 1–5 minutes, at most 20 MB. The optional name above is used if you filled it in.</p>
            <form onSubmit={uploadWav}>
              <label className="dropzone"><span className="dz-title">Choose a .wav file</span><span className="dz-sub">or drag it onto this box</span><input type="file" name="audio" accept=".wav,audio/wav" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} /></label>
              {fileName ? <div className="file-meta"><span>{fileName}</span></div> : null}
              <div className="row noprint"><button className="secondary" type="submit">Add this WAV to the box</button><span className="muted">{uploadState}</span></div>
            </form>
          </details>
        </section>

        <section className="card sage box-card" id="recipe-box" aria-labelledby="boxTitle">
          <div className="box-head"><h2 id="boxTitle">The recipe box</h2><span className="box-count">{recipes.length === 0 ? "Empty" : `${recipes.length} card${recipes.length === 1 ? "" : "s"}`}</span></div>
          <p className="card-intro">Your recordings land here. The three sample cards are fictional, pre-loaded so you can see a finished card — open one, or delete it from its card page.</p>
          <div className="box-scroll">
            {mine.length ? <><h3>Your cards</h3><ul className="box-list">{mine.map((r) => <RecipeItem key={r.id} r={r} />)}</ul></> : <p className="muted">No recordings yet — your first saved take will appear here.</p>}
            <h3>Sample cards (fictional)</h3>
            {samples.length ? (
              <ul className="box-list">{samples.map((r) => <RecipeItem key={r.id} r={r} />)}</ul>
            ) : (
              <ul className="box-list">
                {["Tomato Egg Stir-Fry (Sample)", "Steamed Egg with Minced Pork (Sample)", "Ginger Chicken with Spring Onion (Sample)"].map((dish, i) => (
                  <li key={dish}><button type="button" className="sample-open" disabled={busy} onClick={() => void openSample(["tomato-egg", "steamed-egg", "ginger-chicken"][i], dish)}>{dish}</button><p className="muted">Fictional sample — tap to open the finished card.</p></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function RecipeItem({ r }: { r: RecipeListItem }) {
  return (
    <li>
      <a href={`/recipes/${r.id}`}>{r.dishName || "(untitled)"}</a>
      <p className="muted" style={{ margin: ".3rem 0 0" }}>{r.processingState}{r.reviewState ? ` · ${r.reviewState}` : ""}</p>
      <div className="rc-foot"><span className="rc-kind">{r.mode === "sample" ? "Sample card" : "Recording card"}</span><span className="rc-kind">{new Date(r.updatedAt).toLocaleDateString()}</span></div>
    </li>
  );
}
