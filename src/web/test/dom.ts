import { GlobalRegistrator } from "@happy-dom/global-registrator";

// NOTE: keep Bun's networking; happy-dom's fetch breaks server tests that share this process.
const native = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
};

GlobalRegistrator.register({ url: "http://localhost/" });
Object.assign(globalThis, native);
