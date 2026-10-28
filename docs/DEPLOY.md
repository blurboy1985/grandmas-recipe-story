# Deployment — Cloudflare Containers demo

Deployed 28 October 2026 at https://grandma-recipe.danielquek.com
(Worker `grandma-recipe`, account `Daniel.tianwen@gmail.com's Account`).

## Shape

- The Next.js app runs unchanged in a Cloudflare Container
  (`cloudflare/worker.ts` starts one named `GrandmaContainer`
  Durable Object instance and forwards every request to port 8080).
- This account requires the `durable_object` scheduling policy, so the
  image and instance size (`standard-1`) are chosen in Worker code,
  not in `wrangler.jsonc`. The config only names the digest-pinned
  image under `containers[].images.app`.
- Saving is browser-local (built with `NEXT_PUBLIC_LOCAL_MODE=1`,
  script `build:local`): recipes, transcripts and audio Blobs are
  stored in IndexedDB (`grandma-recipe-box`) on each visitor's own
  device via `src/lib/local-recipes.ts`. They survive server restarts
  but do not sync between devices/browsers, and clearing site data
  deletes them. The server stores nothing for these flows.
- Live AI is stateless on the server: `POST /api/ai/transcribe`
  (Voice) and `POST /api/ai/extract` (Spark, `RECIPE_MODEL` pinned to
  `muse-spark-1.3`) validate, call Meta once, and return the result
  for the browser to save. They need `META_API_KEY` as a Worker secret
  (see below); without it they fail visibly with `missing_key`.
- Container disk is ephemeral and now only scratch space. The local
  (non-deployed) app keeps the SQLite design in
  `docs/ARCHITECTURE.md`; server storage mode is the default build.
- Access: none. Daniel decided on 28 October 2026 that no login is
  needed, so the site is public. The app itself has no auth either —
  anyone who can reach the URL can upload and delete sample recipes.

## Redeploy after an app change

Local Docker is Podman, so Wrangler's `docker` calls go through a
shim that drops the buildx-only `--provenance`/`--sbom` flags:

```zsh
cd /Users/danielquek/grandma-receipe-story
podman machine start
export DOCKER_HOST='unix:///var/folders/f4/bww3754n75g8s5b8pvb51l700000gp/T/podman/podman-machine-default-api.sock'
export PATH="/tmp/cfbin:$PATH"   # /tmp/cfbin/docker -> podman shim

npm run build:local
docker build --platform linux/amd64 -t grandma-recipe:test .
docker tag grandma-recipe:test \
  registry.cloudflare.com/2b1f3493e8bbdea98825e1c13bf04a66/grandma-recipe-grandmacontainer:vNEXT
# Wrangler's own push refreshes the registry login and produces a
# manifest Cloudflare accepts (a raw Podman push does not):
npx wrangler containers push \
  registry.cloudflare.com/2b1f3493e8bbdea98825e1c13bf04a66/grandma-recipe-grandmacontainer:vNEXT
podman pull registry.cloudflare.com/2b1f3493e8bbdea98825e1c13bf04a66/grandma-recipe-grandmacontainer:vNEXT
podman inspect --format '{{json .RepoDigests}}' \
  registry.cloudflare.com/2b1f3493e8bbdea98825e1c13bf04a66/grandma-recipe-grandmacontainer:vNEXT
# Put the new sha256 digest in wrangler.jsonc (containers.images.app.image),
# bump the instance name in cloudflare/worker.ts (a running instance
# keeps its starting image until it restarts), then:
npx wrangler deploy
```

## Setting the Meta key (Daniel, own terminal — hidden prompt)

```zsh
cd /Users/danielquek/grandma-receipe-story
npx wrangler secret put META_API_KEY
```

Type the key at the hidden prompt; never paste it into chat or commit
it. The Worker passes it only into the container process for the two
stateless AI routes. Extraction uses Muse Spark 1.3; transcription
uses Muse Voice Transcribe. Changing the secret redeploys the Worker;
the running container picks the key up on its next start.

First request after an idle period cold-starts the container
(Next.js boot, a few seconds).

## Rollback

`npx wrangler rollback` restores the previous Worker version. The
previous digest-pinned image stays in the registry; point
`wrangler.jsonc` back at it and redeploy if the container image, not
the Worker, is the problem.
