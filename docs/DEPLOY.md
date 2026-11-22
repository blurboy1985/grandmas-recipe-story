# Deployment — plain Cloudflare Worker

Live at https://grandma-recipe.danielquek.com
(Worker `grandma-recipe`, account `Daniel.tianwen@gmail.com's Account`).

History: launched 28 October 2026 as a Cloudflare Container running
the Next.js app; migrated to a plain Worker on 7 November 2026
(Phase 7 cutover); container/DO vestiges removed 22 November 2026
(Phase 8). The full record is in the migration log
(`~/workspace/your_files/grandma-recipe-worker-migration-log.md`).
The container-era implementation is preserved at git tag
`pre-worker-migration`.

## Shape

- **Plain Worker + static export.** `cloudflare/worker.ts` serves the
  Next.js static export (`out/`, Workers Static Assets), answers
  `GET /api/sample-audio` from the committed sample WAV asset, serves
  the one exported recipe shell for any `/recipes/<id>`, and proxies
  the two stateless AI routes. There is no container, no server-side
  storage, and no database in the deployed shape.
- Saving is browser-local (built with `NEXT_PUBLIC_LOCAL_MODE=1`):
  recipes, transcripts and audio Blobs are stored in IndexedDB
  (`grandma-recipe-box`) on each visitor's own device via
  `src/lib/local-recipes.ts`. They survive server restarts but do not
  sync between devices/browsers, and clearing site data deletes them.
  The server stores nothing for these flows.
- Live AI is stateless on the server: `POST /api/ai/transcribe`
  (Muse Voice Transcribe; uploads at rates other than 16/24 kHz are
  resampled to 24 kHz server-side first) and `POST /api/ai/extract`
  (Muse Spark, `RECIPE_MODEL` pinned to `muse-spark-1.3`) validate,
  call Meta once, and return the result for the browser to save. They
  need `META_API_KEY` as a Worker secret (see below); without it they
  fail visibly with `missing_key`.
- The old server mode is gone: Phase 8 deleted `src/server/store.ts`,
  `src/server/db.ts` (SQLite), the six server-mode API routes
  (recipes/uploads/media) and the `Dockerfile`/`.dockerignore`. Local
  development is the browser-local mode; the two AI routes also exist
  as Next routes under `src/app/api/ai/` for `next dev`.
- Access: none. Daniel decided on 28 October 2026 that no login is
  needed, so the site is public.

## Redeploy after an app change

```zsh
npm run build:worker   # static export -> out/ (API routes stashed during the build)
npx wrangler deploy    # production config: wrangler.jsonc
```

No Podman/Docker, no image digest pinning, no instance-name bumps.
Staging is `grandma-recipe-staging` (`wrangler.staging.jsonc`,
workers.dev only, never the live domain).

## Setting the Meta key (Daniel, own terminal — hidden prompt)

```zsh
npx wrangler secret put META_API_KEY
```

Type the key at the hidden prompt; never paste it into chat or commit
it. The Worker uses it only for the two stateless AI routes.
Extraction uses Muse Spark 1.3; transcription uses Muse Voice
Transcribe.

## Leftover: the GrandmaContainer class declaration

Phase 8 removed the `GRANDMA_CONTAINER` binding (production version
`a5d912f2`, 22 Nov 2026, verified live), so nothing can instantiate
or call the Durable Object. The class itself is still *declared*:
`cloudflare/worker.ts` still exports `GrandmaContainer` and
`wrangler.jsonc` still carries the `exports` block. This is
deliberate, not an oversight — the class was created via the
declarative `exports` style (no migration history), and wrangler's
`deleted_classes` migration refuses it with:

> Cannot apply deleted_classes migration to non-existent class GrandmaContainer

Deleting it would need a route outside wrangler's migration system
(e.g. dashboard/support) if Cloudflare offers one. It is inert: no
binding, no caller, no storage writes (the class never wrote app data
to DO storage). Do not "fix" this by forcing a deploy shape wrangler
rejects; if it is ever removed, do it as its own verified deploy.

## Rollback

`npx wrangler rollback` restores a previous Worker version (e.g.
`8153689f…`, the pre-Phase-8 production version, or `275da4b5…`, the
Phase 7 cutover version). Rolling back to the pre-migration
*container* version (`27ea6484…`) is no longer a plain rollback in
practice: Containers need a Workers Paid plan (the account is on
Free) and the binding/config are removed — it is the slow rebuild
path: check out tag `pre-worker-migration`, re-add the
container/DO config, and follow the container deploy flow preserved
in that tag's copy of this document.
