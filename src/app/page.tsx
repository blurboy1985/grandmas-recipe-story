"use client";
import { useCallback, useEffect, useState } from "react";
import { createSampleLocal, createUploadLocal, localList, localSave, toListItem } from "@/lib/local-recipes";
import { validateUpload } from "@/server/audio";

const LOCAL = process.env.NEXT_PUBLIC_LOCAL_MODE === "1";

interface RecipeListItem { id: string; dishName: string; mode: string; processingState: string; reviewState: string | null; updatedAt: string; }

export default function Home() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [cookName, setCookName] = useState("");
  const [dishName, setDishName] = useState("");
  const [languageHint, setLanguageHint] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadState, setUploadState] = useState("");
  const [motionOff, setMotionOff] = useState(false);
  const [fileName, setFileName] = useState("");

  const refresh = useCallback(async () => {
    try {
      if (LOCAL) {
        setRecipes((await localList()).map(toListItem));
        return;
      }
      const res = await fetch("/api/recipes");
      const data = await res.json() as { recipes: RecipeListItem[] };
      setRecipes(data.recipes ?? []);
    } catch { setRecipes([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function createSample(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (LOCAL) {
        let audioBlob: Blob | null = null;
        try {
          const r = await fetch("/api/sample-audio");
          if (r.ok) audioBlob = await r.blob();
        } catch { audioBlob = null; }
        try {
          const rec = createSampleLocal({ cookName, dishName, languageHint, consent }, audioBlob);
          await localSave(rec);
          window.location.href = `/recipes/${rec.id}`;
        } catch (err) {
          setError((err as { message?: string }).message ?? "could not create sample");
        }
        return;
      }
      const res = await fetch("/api/recipes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "sample", cookName, dishName, languageHint, consent }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) { setError(data.error ?? "could not create sample"); return; }
      window.location.href = `/recipes/${data.id}`;
    } finally { setBusy(false); }
  }

  async function uploadWav(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setUploadState("Uploading…");
    try {
      if (LOCAL) {
        const form = new FormData(e.currentTarget);
        const file = form.get("audio");
        if (!(file instanceof Blob)) { setError("audio file required"); setUploadState(""); return; }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const checked = validateUpload(bytes);
        if (!checked.ok) { setError(`invalid WAV: ${checked.error}`); setUploadState(""); return; }
        try {
          const rec = createUploadLocal({
            cookName: cookName || String(form.get("uCook") ?? ""),
            dishName: String(form.get("dishName") ?? ""),
            languageHint: String(form.get("languageHint") ?? ""),
            consent: form.get("consent") === "true" || form.get("consent") === "on",
          }, file);
          await localSave(rec);
          setUploadState("Saved in this browser. Opening…");
          window.location.href = `/recipes/${rec.id}`;
        } catch (err) {
          setError((err as { message?: string }).message ?? "upload failed");
          setUploadState("");
        }
        return;
      }
      const form = new FormData(e.currentTarget);
      form.set("cookName", cookName || (form.get("uCook") as string) || "");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) { setError(data.error ?? "upload failed"); setUploadState(""); return; }
      setUploadState("Saved. Opening…");
      window.location.href = `/recipes/${data.id}`;
    } catch { setError("upload failed"); setUploadState(""); }
  }

  return (
    <main>
      <header className="hero">
        <h1>From her voice, to your kitchen table</h1>
        <p className="lede">The recipes she never wrote down, kept the way she told them — <em>in her own voice</em>, tucked into cards the family can cook from for years.</p>
        <div className={`hero-stage${motionOff ? " motion-off" : ""}`}>
          <p className="stamp">{LOCAL ? "Saved in this browser" : "Sample mode"}</p>
          <figure className="hero-fig">
            <div className="hero-img-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/grandma-hero.webp" alt="Watercolour illustration of a grandmother in a floral apron stirring a steaming pot in a sunlit kitchen, jars and hanging herbs on the shelves, a cat dozing beside the stove" />
              <div className="steam hero-steam" aria-hidden="true"><span /><span /><span /></div>
              <button type="button" className="motion-btn" aria-pressed={motionOff} onClick={() => setMotionOff((v) => !v)}>{motionOff ? "Play the steam" : "Pause the steam"}</button>
            </div>
            <figcaption>Grandma, mid-stir — where every good recipe starts.</figcaption>
          </figure>
        </div>
      </header>

      <p className="muted" style={{ textAlign: "center" }}>This recipe box keeps what your relative actually said — vague spoonfuls and all — and asks about the rest instead of inventing it. The sample card below is fictional and runs without an API key. Saving is ordinary code, never an AI call.</p>
      {LOCAL ? <p className="muted" style={{ textAlign: "center" }}>Cards, transcripts and recordings are stored in this browser on this device only. They survive reloads and server restarts, but do not sync to other devices or browsers — clearing site data deletes them.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <h2><span className="num">1</span> Start a sample card</h2>
        <p className="card-intro">New to the box? Try a practice card first — <span className="hand">no recording needed,</span> just her name and a dish she&apos;s known for.</p>
        <form onSubmit={createSample}>
          <label>Her name<input type="text" value={cookName} onChange={(e) => setCookName(e.target.value)} placeholder="e.g. Ah Ma, Popo, Nai Nai" /></label>
          <label>The dish<input type="text" value={dishName} onChange={(e) => setDishName(e.target.value)} placeholder="Defaults to the fictional sample dish" /></label>
          <label>Language she tells it in<input type="text" value={languageHint} onChange={(e) => setLanguageHint(e.target.value)} placeholder="e.g. Hokkien, with a little Teochew" /></label>
          <p className="hint">A hint helps whoever writes the card up later — dialect, mixed languages, all welcome.</p>
          <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>This is our family&apos;s story to keep, and I have her okay to save it here.</span></label>
          <div className="row noprint"><button type="submit" disabled={busy}>{busy ? "Creating…" : "Tuck a sample card in the box"}</button></div>
          <p className="form-note">Try-it-out only — fictional sample, runs without an API key.</p>
        </form>
      </section>

      <section className="card sage">
        <h2><span className="num">2</span> Or add a real recording</h2>
        <p className="card-intro">Already have her on tape talking through a dish? Add the <strong>.wav</strong> file and it becomes a card in the box, ready to be listened back and written up.</p>
        <p className="muted">Supported: mono PCM 16-bit WAV, 1–5 minutes, at most 20 MB. Transcribe it with Voice on the card, or type the words yourself — either way, you approve the transcript before anything is extracted from it.</p>
        <form onSubmit={uploadWav}>
          <label className="dropzone"><span className="dz-title">Choose a .wav file</span><span className="dz-sub">or drag it onto this card</span><input type="file" name="audio" accept=".wav,audio/wav" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} /></label>
          {fileName ? <div className="file-meta"><span>{fileName}</span></div> : null}
          <label>Your name<input type="text" name="uCook" required /></label>
          <label>Which dish is she talking through?<input type="text" name="dishName" required placeholder="e.g. Steamed pomfret, the festive way" /></label>
          <label>Language hint<input type="text" name="languageHint" /></label>
          <label className="consent"><input type="checkbox" name="consent" value="true" required /><span>I have consent to keep this recording.</span></label>
          <div className="row noprint"><button className="secondary" type="submit">Add this recording to the box</button><span className="muted">{uploadState}</span></div>
        </form>
      </section>

      <section aria-labelledby="boxTitle">
        <div className="box-head"><h2 id="boxTitle">The recipe box</h2><span className="box-count">{recipes.length === 0 ? "Empty" : `${recipes.length} card${recipes.length === 1 ? "" : "s"} tucked in`}</span></div>
        {recipes.length === 0 ? (
          <div className={`card empty${motionOff ? " motion-off" : ""}`}>
            <div className="empty-fig">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/grandma-hero.webp" alt="" aria-hidden="true" />
              <div className="steam empty-steam" aria-hidden="true"><span /><span /><span /></div>
            </div>
            <h3>No cards tucked in yet.</h3>
            <p>{LOCAL ? "Start with a sample card above, or add a recording of her voice — the first dish you save will land right here, saved in this browser when you reload." : "Start with a sample card above, or add a recording of her voice — the first dish you save will land right here."}</p>
            <p className="hand">She&apos;s keeping the pot warm in the meantime.</p>
          </div>
        ) : (
          <ul className="box-list">{recipes.map((r) => (
            <li key={r.id}>
              <a href={`/recipes/${r.id}`}>{r.dishName || "(untitled)"}</a>
              <p className="muted" style={{ margin: ".3rem 0 0" }}>{r.processingState}{r.reviewState ? ` · ${r.reviewState}` : ""}</p>
              <div className="rc-foot"><span className="rc-kind">{r.mode === "sample" ? "Sample card" : "Recording card"}</span><span className="rc-kind">{new Date(r.updatedAt).toLocaleDateString()}</span></div>
            </li>
          ))}</ul>
        )}
      </section>
    </main>
  );
}
