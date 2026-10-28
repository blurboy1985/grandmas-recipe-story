import { NextResponse } from "next/server";
import { createSampleRecipe, listRecipes, seedSampleRecipes } from "@/server/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ recipes: listRecipes() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { kind?: string; cookName?: string; dishName?: string; languageHint?: string; consent?: boolean; fixtureId?: string };
    if (body.kind === "seed-samples") {
      return NextResponse.json(seedSampleRecipes(), { status: 201 });
    }
    if (body.kind !== "sample") {
      return NextResponse.json({ error: "Milestone A supports sample creation here; use /api/uploads for WAV files.", code: "sample_only" }, { status: 400 });
    }
    // Saving is ordinary code, never a paid AI call.
    const { id } = createSampleRecipe({
      cookName: body.cookName ?? "",
      dishName: body.dishName,
      languageHint: body.languageHint,
      consent: body.consent === true,
      fixtureId: body.fixtureId,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: err.message ?? "failed", code: err.code ?? "failed" }, { status: err.status ?? 500 });
  }
}
