import { NextResponse } from "next/server";
import { addCorrection, answerClarification, approveTranscript, deleteRecipe, editTranscript, getRecipeDetail, setReviewState } from "@/server/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = getRecipeDetail(id);
  if (!detail) return NextResponse.json({ error: "not found", code: "not_found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json() as Record<string, unknown>;
    const action = body.action;
    if (action === "edit-transcript") {
      const { versionId } = editTranscript(id, String(body.text ?? ""));
      return NextResponse.json({ versionId });
    }
    if (action === "approve-transcript") {
      approveTranscript(id, String(body.versionId ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "answer") {
      answerClarification(id, String(body.clarificationId ?? ""), String(body.answer ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "correct") {
      const { id: cid } = addCorrection(id, String(body.targetField ?? ""), body.correctedValue ?? null);
      return NextResponse.json({ id: cid });
    }
    if (action === "review") {
      setReviewState(id, body.reviewState as "draft" | "reviewed_with_unknowns" | "confirmed");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action", code: "bad_action" }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: err.code ?? "failed" }, { status: err.status ?? 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteRecipe(id);
  return NextResponse.json({ ok: true });
}
