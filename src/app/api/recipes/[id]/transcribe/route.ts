import { NextResponse } from "next/server";
import { requestTranscription } from "@/server/store";

export const runtime = "nodejs";

// Explicit paid call: only this route (and only on cache miss) triggers a
// live Voice Transcribe request. Refresh/save/print/reopen never do.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await requestTranscription(id);
    return NextResponse.json(result, { status: result.cached ? 200 : 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: err.code ?? "failed" }, { status: err.status ?? 500 });
  }
}
