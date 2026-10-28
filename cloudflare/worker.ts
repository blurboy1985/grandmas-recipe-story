import { DurableObject } from "cloudflare:workers";

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

// One named instance is the whole deployment: the app is a single
// Node process with in-process request dedup and SQLite on its local
// disk (see docs/ARCHITECTURE.md). Container disk is ephemeral, so
// saved recipes may be lost when the instance restarts — this is a
// sample-mode demo deployment, not durable family storage.
type WorkerEnv = Env & { META_API_KEY?: string };

export class GrandmaContainer extends DurableObject<WorkerEnv> {
  private starting: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error("No container is configured");
    if (!container.running) {
      container.start({
        image: container.images.app,
        instance: "standard-1",
        // Outbound is needed only for Meta Voice/Spark calls from the
        // stateless AI routes. The key comes from the Worker secret
        // binding and is passed to the container process only; it is
        // never sent to the browser.
        enableInternet: true,
        env: {
          NODE_ENV: "production",
          APP_MODE: "sample",
          DATA_DIR: "/data/app",
          RECIPE_MODEL: "muse-spark-1.3",
          ...(this.env.META_API_KEY ? { META_API_KEY: this.env.META_API_KEY } : {}),
        },
      });
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(PORT);
    let lastError: unknown;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/", {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Readiness returned ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        await scheduler.wait(200);
      }
    }
    throw new Error(`Container did not become ready on port ${PORT}`, {
      cause: lastError,
    });
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    // Bump this name whenever the container image changes: a running
    // instance keeps its starting image until it restarts, so a new
    // name is how a new image takes over. The old instance idles out.
    const stub = env.GRANDMA_CONTAINER.getByName("grandma-recipe-v5");
    return stub.fetch(request);
  },
};
