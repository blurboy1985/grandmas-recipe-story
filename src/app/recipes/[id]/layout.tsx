import type { ReactNode } from "react";

// Worker migration: recipe IDs are browser-generated UUIDs, so the
// static export can only emit ONE recipe page shell. The placeholder
// param below produces that shell; the Worker serves it for any
// /recipes/<id> request and the page reads its real ID from the URL
// path (URLs unchanged). In local `next dev` the real param is used.
export function generateStaticParams() {
  return [{ id: "_shell" }];
}

export default function RecipeLayout({ children }: { children: ReactNode }) {
  return children;
}
