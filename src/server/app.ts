import { APICallError, RetryError } from "ai";
import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  suggestRequestSchema,
  type ApiError,
  type ContextStatus,
  type ModelsResponse,
  type SuggestResponse,
} from "../shared/api";
import type { ContextIndex, ContextLibrary } from "./context";
import { UpstreamError, type Llm } from "./llm";
import { log } from "./log";
import { suggest } from "./suggest";

export type AppDeps = {
  llm?: Llm;
  library: ContextLibrary;
  defaultContextDir?: string;
  maxSteps: number;
};

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

const apiKeyOf = (c: Context) =>
  c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || undefined;

/** Maps upstream auth failures to 401 so the UI can ask for a key; everything else is a 502. */
function upstreamStatus(error: unknown): 401 | 502 {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  const status =
    cause instanceof UpstreamError
      ? cause.status
      : APICallError.isInstance(cause)
        ? cause.statusCode
        : undefined;
  return status === 401 || status === 403 ? 401 : 502;
}

export function createApp(deps: AppDeps) {
  const openContext = async (path: string | undefined): Promise<ContextIndex | undefined> => {
    const dir = path?.trim() || deps.defaultContextDir;
    if (!dir) return undefined;
    try {
      return await deps.library.open(dir);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
  };

  const requireLlm = (): Llm => {
    if (!deps.llm) throw new HttpError(503, "No model endpoint configured. Set LLM_BASE_URL.");
    return deps.llm;
  };

  return new Hono()
    .onError((error, c) => {
      if (error instanceof HttpError)
        return c.json<ApiError>({ error: error.message }, error.status);
      const status = upstreamStatus(error);
      log.error("request failed", { path: c.req.path, status, error: error.message });
      const message =
        status === 401
          ? `The model endpoint rejected the API key. ${error.message}`
          : error.message;
      return c.json<ApiError>({ error: message }, status);
    })
    .get("/healthz", (c) => c.text("ok"))
    .get("/api/models", async (c) => {
      const llm = requireLlm();
      const models = await llm.listModels(apiKeyOf(c));
      return c.json<ModelsResponse>({ defaultModel: llm.defaultModel, models });
    })
    .get("/api/context", async (c) => {
      const index = await openContext(c.req.query("path"));
      if (!index) throw new HttpError(400, "No context path given.");
      return c.json<ContextStatus>(index.status);
    })
    .post("/api/suggest", async (c) => {
      const parsed = suggestRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
      const llm = requireLlm();
      const modelId = parsed.data.model || llm.defaultModel;
      if (!modelId) throw new HttpError(400, "No model selected and LLM_MODEL is unset.");
      const context = await openContext(parsed.data.contextPath);

      const started = performance.now();
      const result = await suggest(parsed.data, {
        model: llm.model(modelId, apiKeyOf(c)),
        context,
        maxSteps: deps.maxSteps,
        abortSignal: c.req.raw.signal,
      });
      log.info("suggested", {
        model: modelId,
        ms: Math.round(performance.now() - started),
        selectionChars: parsed.data.selection.to - parsed.data.selection.from,
        sources: result.sources.length,
      });
      return c.json<SuggestResponse>(result);
    });
}
