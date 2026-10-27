import { NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mediaPathFor } from "@/server/store";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("type") === "photo" ? "photo" : "audio";
  const path = mediaPathFor(id, kind);
  if (!path || !existsSync(path)) return NextResponse.json({ error: "not found", code: "not_found" }, { status: 404 });
  const stat = statSync(path);
  const stream = createReadStream(path);
  const web = new ReadableStream({
    start(c) {
      stream.on("data", (chunk) => c.enqueue(chunk));
      stream.on("end", () => c.close());
      stream.on("error", (e) => c.error(e));
    },
    cancel() { stream.destroy(); },
  });
  return new NextResponse(web, {
    headers: {
      "Content-Type": kind === "photo" ? "image/jpeg" : "audio/wav",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=60",
    },
  });
}
