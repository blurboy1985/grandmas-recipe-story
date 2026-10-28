import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

// The committed fictional sample tone (samples/sample.wav). Public on
// purpose; never family media. Browser-local mode stores a copy of
// this Blob in IndexedDB when a sample card is created.
export async function GET() {
  try {
    const bytes = await readFile(join(process.cwd(), "samples", "sample.wav"));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("sample audio unavailable", { status: 404 });
  }
}
