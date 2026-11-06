// Grandma's Recipe Story — plain Worker (Worker migration, Phases 2–3).
//
// This replaces the Cloudflare Container shim that lived here before
// (preserved at git tag `pre-worker-migration`). The deployed app is
// browser-local: recipes, transcripts and audio live in the visitor's
// IndexedDB and the server stores nothing. This Worker only:
//   - serves the static export (Workers Static Assets, ./out),
//   - serves the one exported recipe-page shell for /recipes/<id>
//     (IDs are browser-generated UUIDs; the page reads its ID from the
//     URL path — URLs unchanged),
//   - answers GET /api/sample-audio from the static sample.wav asset,
//   - proxies the two stateless AI routes to Meta (Voice transcribe,
//     Spark extract) with META_API_KEY kept as a Worker secret — it is
//     never sent to the browser.
// The six server-mode API routes (recipes/uploads/media) are NOT ported:
// the deployed LOCAL-mode build never calls them. Their files remain in
// src/app/api for local dev; store.ts/db.ts are not imported here.
import { validateUpload } from "../src/server/audio.ts";
import { transcribeAudio } from "../src/server/meta-transcribe.ts";
import { buildExtractionMessages, type FamilyNote } from "../src/server/extraction-prompt.ts";
import { extractRecipe } from "../src/server/meta-extract.ts";
import { validateRecipeDraft } from "../src/server/validate.ts";
import type { Segment } from "../src/server/segments.ts";

export interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  META_API_KEY?: string;
  META_BASE_URL?: string;
  RECIPE_MODEL?: string;
  TRANSCRIBE_MODEL?: string;
  RECIPE_REASONING_EFFORT?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Ported faithfully from src/app/api/ai/transcribe/route.ts — same
// validation order, response shapes and status mapping.
async function handleTranscribe(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return json({ error: "audio file required", code: "audio_required" }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = validateUpload(bytes);
    if (!checked.ok || !checked.info) {
      return json({ error: `invalid WAV: ${checked.error}`, code: checked.error ?? "invalid" }, 400);
    }
    const result = await transcribeAudio(bytes, {
      env: {
        META_API_KEY: env.META_API_KEY,
        META_BASE_URL: env.META_BASE_URL,
        TRANSCRIBE_MODEL: env.TRANSCRIBE_MODEL,
      },
    });
    if (!result.ok) {
      const status = result.code === "missing_key" || result.code === "bad_credentials" || result.code === "invalid_audio" ? 400
        : result.code === "rate_limited" ? 429 : 502;
      return json({ error: result.detail, code: result.code }, status);
    }
    return json({ transcript: result.transcript, model: result.usage.model });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return json({ error: err.message ?? "failed", code: "failed" }, 500);
  }
}

// Ported faithfully from src/app/api/ai/extract/route.ts — same input
// limits, grounding re-validation and status mapping.
async function handleExtract(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    const body = await request.json() as { segments?: unknown; dishName?: unknown; notes?: unknown };
    const segments = body.segments as Segment[] | undefined;
    if (!Array.isArray(segments) || segments.length === 0
      || segments.some((s) => !s || typeof s.id !== "string" || typeof s.text !== "string")) {
      return json({ error: "approved segments required", code: "empty_transcript" }, 400);
    }
    if (segments.length > 200) {
      return json({ error: "transcript too long", code: "too_long" }, 400);
    }
    const dishName = typeof body.dishName === "string" ? body.dishName.slice(0, 200) : "";
    const notes: FamilyNote[] = Array.isArray(body.notes)
      ? (body.notes as FamilyNote[]).filter((n) => n && typeof n.label === "string" && typeof n.text === "string").slice(0, 20)
      : [];
    const { system, user } = buildExtractionMessages(segments, dishName, notes);
    const result = await extractRecipe(system, user, {
      env: {
        META_API_KEY: env.META_API_KEY,
        META_BASE_URL: env.META_BASE_URL,
        RECIPE_MODEL: env.RECIPE_MODEL,
        RECIPE_REASONING_EFFORT: env.RECIPE_REASONING_EFFORT,
      },
    });
    if (!result.ok) {
      const status = result.code === "missing_key" || result.code === "bad_credentials" ? 400 : 502;
      return json({ error: result.detail, code: result.code }, status);
    }
    const check = validateRecipeDraft(result.output, segments);
    if (!check.ok) {
      return json({
        error: "Model output failed grounding checks: " + check.errors.slice(0, 3).join("; "),
        code: "invalid_output",
      }, 502);
    }
    return json({ output: result.output, model: result.usage.model });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return json({ error: err.message ?? "failed", code: "failed" }, 500);
  }
}

// GET /api/sample-audio — was src/app/api/sample-audio/route.ts reading
// samples/sample.wav from disk. The same committed fictional sample now
// ships as the static asset /sample.wav; this rewrite preserves the URL
// and the exact Content-Type / Cache-Control of the old route.
async function handleSampleAudio(request: Request, env: WorkerEnv): Promise<Response> {
  const assetUrl = new URL("/sample.wav", request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl));
  if (!asset.ok) return new Response("sample audio unavailable", { status: 404 });
  return new Response(asset.body, {
    status: 200,
    headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/ai/transcribe" || path === "/api/ai/extract") {
      if (request.method !== "POST") return json({ error: "method not allowed", code: "method_not_allowed" }, 405);
      return path === "/api/ai/transcribe" ? handleTranscribe(request, env) : handleExtract(request, env);
    }
    if (path === "/api/sample-audio") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed", code: "method_not_allowed" }, 405);
      return handleSampleAudio(request, env);
    }
    if (path.startsWith("/api/")) {
      return json({ error: "not found", code: "not_found" }, 404);
    }

    // Recipe shell: any single-segment /recipes/<id> serves the one
    // exported shell page; the client reads its ID from the URL path.
    if (request.method === "GET" && /^\/recipes\/[^/]+\/?$/.test(path)) {
      const shellUrl = new URL("/recipes/_shell.html", request.url);
      const shell = await env.ASSETS.fetch(new Request(shellUrl));
      if (shell.ok) {
        return new Response(shell.body, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
