import { NextResponse } from "next/server";
import { validateUpload } from "@/server/audio";
import { transcribeAudio } from "@/server/meta-transcribe";

export const runtime = "nodejs";

// Stateless Voice transcription for browser-local mode: the WAV is
// validated and forwarded once; nothing is stored on the server.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "audio file required", code: "audio_required" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = validateUpload(bytes);
    if (!checked.ok || !checked.info) {
      return NextResponse.json({ error: `invalid WAV: ${checked.error}`, code: checked.error ?? "invalid" }, { status: 400 });
    }
    const result = await transcribeAudio(bytes);
    if (!result.ok) {
      const status = result.code === "missing_key" || result.code === "bad_credentials" || result.code === "invalid_audio" ? 400
        : result.code === "rate_limited" ? 429 : 502;
      return NextResponse.json({ error: result.detail, code: result.code }, { status });
    }
    return NextResponse.json({ transcript: result.transcript, model: result.usage.model });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: "failed" }, { status: 500 });
  }
}
