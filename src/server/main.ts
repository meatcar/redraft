import index from "../web/index.html";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { ContextLibrary } from "./context";
import { createLlm } from "./llm";
import { log } from "./log";

const config = loadConfig();
const app = createApp({
  llm: createLlm(config),
  library: new ContextLibrary(config.CONTEXT_ROOT, { indexPath: config.INDEX_PATH }),
  defaultContextDir: config.CONTEXT_DIR,
  maxSteps: config.LLM_MAX_STEPS,
});

const server = Bun.serve({
  port: config.PORT,
  idleTimeout: 120,
  routes: {
    "/*": index,
    "/api/*": app.fetch,
    "/healthz": app.fetch,
  },
  development: config.NODE_ENV !== "production" && { hmr: true, console: true },
});

log.info("listening", {
  url: server.url.href,
  llm: config.LLM_BASE_URL ? new URL(config.LLM_BASE_URL).host : null,
  contextRoot: config.CONTEXT_ROOT,
  index: config.INDEX_PATH,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
