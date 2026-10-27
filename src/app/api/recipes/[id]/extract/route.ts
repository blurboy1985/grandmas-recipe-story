import { NextResponse } from "next/server";
import { requestExtraction } from "@/server/store";

export const runtime = "nodejs";

// Explicit paid call: only this route (and only on cache miss or explicit
// regenerate) triggers a live model request. Refresh/save/print/reopen never do.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { regenerate?: boolean };
    const result = await requestExtraction(id, { regenerate: body.regenerate === true });
    return NextResponse.json(result, { status: result.cached ? 200 : 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: err.code ?? "failed" }, { status: err.status ?? 500 });
  }
}
