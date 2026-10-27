import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createUploadRecipe, discardStagedUpload, stageUpload } from "@/server/store";
import { validateUpload } from "@/server/audio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    const cookName = String(form.get("cookName") ?? "");
    const dishName = String(form.get("dishName") ?? "");
    const languageHint = String(form.get("languageHint") ?? "");
    const consent = String(form.get("consent") ?? "") === "true";
    if (!(file instanceof Blob)) return NextResponse.json({ error: "audio file required", code: "audio_required" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = validateUpload(bytes);
    if (!checked.ok || !checked.info) {
      return NextResponse.json({ error: `invalid WAV: ${checked.error}`, code: checked.error ?? "invalid" }, { status: 400 });
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const staged = stageUpload(bytes, "upload.wav");
    let id: string;
    try {
      ({ id } = createUploadRecipe(
        { uploadId: staged.uploadId, cookName, dishName, languageHint, consent },
        { durationMs: checked.info.durationMs, byteSize: bytes.length, sha256 }
      ));
    } catch (e) {
      discardStagedUpload(staged.uploadId);
      throw e;
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: err.code ?? "failed" }, { status: err.status ?? 500 });
  }
}
