// Stable source segment IDs assigned in code, in order, before any model call.
export interface Segment { id: string; text: string; }

export function segmentId(index: number): string {
  return `seg-${String(index + 1).padStart(2, "0")}`;
}

export function assignSegments(fullText: string): Segment[] {
  const cleaned = fullText.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  // Prefer blank-line separated blocks; otherwise split into sentences.
  let parts = cleaned.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) {
    const sentences = cleaned.match(/[^.!?。！？]+[.!?。！？]+["”’)]?|\s*[^.!?。！？]+$/g);
    if (sentences && sentences.length > 1) parts = sentences.map((s) => s.trim()).filter(Boolean);
  }
  return parts.map((text, i) => ({ id: segmentId(i), text }));
}

export function segmentMap(segments: Segment[]): Map<string, string> {
  return new Map(segments.map((s) => [s.id, s.text]));
}
