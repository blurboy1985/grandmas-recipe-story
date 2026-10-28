import { NextResponse } from "next/server";
import { buildExtractionMessages, type FamilyNote } from "@/server/extraction-prompt";
import { extractRecipe } from "@/server/meta-extract";
import { validateRecipeDraft } from "@/server/validate";
import type { Segment } from "@/server/segments";

export const runtime = "nodejs";

// Stateless Spark extraction for browser-local mode: approved segments
// are sent once, the grounded draft is returned, nothing is stored.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { segments?: unknown; dishName?: unknown; notes?: unknown };
    const segments = body.segments as Segment[] | undefined;
    if (!Array.isArray(segments) || segments.length === 0
      || segments.some((s) => !s || typeof s.id !== "string" || typeof s.text !== "string")) {
      return NextResponse.json({ error: "approved segments required", code: "empty_transcript" }, { status: 400 });
    }
    if (segments.length > 200) {
      return NextResponse.json({ error: "transcript too long", code: "too_long" }, { status: 400 });
    }
    const dishName = typeof body.dishName === "string" ? body.dishName.slice(0, 200) : "";
    const notes: FamilyNote[] = Array.isArray(body.notes)
      ? (body.notes as FamilyNote[]).filter((n) => n && typeof n.label === "string" && typeof n.text === "string").slice(0, 20)
      : [];
    const { system, user } = buildExtractionMessages(segments, dishName, notes);
    const result = await extractRecipe(system, user);
    if (!result.ok) {
      const status = result.code === "missing_key" || result.code === "bad_credentials" ? 400 : 502;
      return NextResponse.json({ error: result.detail, code: result.code }, { status });
    }
    const check = validateRecipeDraft(result.output, segments);
    if (!check.ok) {
      return NextResponse.json({
        error: "Model output failed grounding checks: " + check.errors.slice(0, 3).join("; "),
        code: "invalid_output",
      }, { status: 502 });
    }
    return NextResponse.json({ output: result.output, model: result.usage.model });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: "failed" }, { status: 500 });
  }
}
