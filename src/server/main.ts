import index from "../web/index.html";
import { loadConfig } from "./config";
import { log } from "./log";

const config = loadConfig();

// NOTE: static only. The browser calls the model endpoint and reads the context folder itself.
const server = Bun.serve({
  port: config.PORT,
  routes: {
    "/*": index,
    "/healthz": new Response("ok"),
  },
  development: config.NODE_ENV !== "production" && { hmr: true, console: true },
});

log.info("listening", { url: server.url.href });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
