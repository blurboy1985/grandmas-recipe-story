/** @type {import('next').NextConfig} */
const nextConfig = {
  // Worker migration (branch worker-migration): the deployed LOCAL-mode
  // app ships as a static export served by a plain Cloudflare Worker
  // (Workers Static Assets). API routes cannot exist in an export — the
  // three live ones are ported to cloudflare/worker.ts, and the export
  // build stashes src/app/api aside (scripts/build-worker.mjs) so the
  // route files stay in the repo for local server-mode dev.
  output: "export",
};
export default nextConfig;
