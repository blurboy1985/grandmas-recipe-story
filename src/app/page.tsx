"use client";
import { useCallback, useEffect, useState } from "react";

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

  const refresh = useCallback(async () => {
    try {
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
      <p className="intro">From her voice, to your kitchen table.</p>
      <p><span className="badge">SAMPLE MODE</span></p>
      <p className="muted">This recipe box keeps what your relative actually said — vague spoonfuls and all — and asks about the rest instead of inventing it. The sample card below is fictional and runs without an API key. Saving is ordinary code, never an AI call.</p>

      <section className="card">
        <h2>1 · Start a sample card</h2>
        <form onSubmit={createSample}>
          <label>Family member&apos;s preferred name<input type="text" value={cookName} onChange={(e) => setCookName(e.target.value)} placeholder="e.g. Mei" /></label>
          <label>Dish name (optional for sample)<input type="text" value={dishName} onChange={(e) => setDishName(e.target.value)} placeholder="Defaults to the fictional sample dish" /></label>
          <label>Language hint (optional)<input type="text" value={languageHint} onChange={(e) => setLanguageHint(e.target.value)} placeholder="e.g. English with some Hokkien" /></label>
          <label><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I have the family&apos;s consent to keep this recording.</label>
          {error ? <p className="error">{error}</p> : null}
          <div className="row noprint"><button type="submit" disabled={busy}>{busy ? "Creating…" : "Create fictional sample card"}</button></div>
        </form>
      </section>

      <section className="card">
        <h2>2 · Or add a real recording</h2>
        <p className="muted">Supported: mono PCM 16-bit WAV, 1–5 minutes, at most 20 MB. Transcribe it with Voice on the card, or type the words yourself — either way, you approve the transcript before anything is extracted from it.</p>
        <form onSubmit={uploadWav}>
          <label>Audio file (.wav)<input type="file" name="audio" accept=".wav,audio/wav" required /></label>
          <label>Your name<input type="text" name="uCook" required /></label>
          <label>Dish name<input type="text" name="dishName" required /></label>
          <label>Language hint<input type="text" name="languageHint" /></label>
          <label><input type="checkbox" name="consent" value="true" required /> I have consent to keep this recording.</label>
          <div className="row noprint"><button className="secondary" type="submit">Upload WAV</button><span className="muted">{uploadState}</span></div>
        </form>
      </section>

      <section className="card">
        <h2>The recipe box</h2>
        {recipes.length === 0 ? <p className="muted">No cards tucked in yet. Saved cards stay in the box when you reload or reopen the app.</p> : (
          <ul className="box-list">{recipes.map((r) => (
            <li key={r.id}><a href={`/recipes/${r.id}`}>{r.dishName || "(untitled)"}</a> <span className="muted">· {r.mode === "sample" ? "sample card" : "recording"} · {r.processingState}{r.reviewState ? ` · ${r.reviewState}` : ""}</span></li>
          ))}</ul>
        )}
      </section>
    </main>
  );
}
