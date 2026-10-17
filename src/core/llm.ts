import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, RetryError, type LanguageModel } from "ai";
import { z } from "zod";

/** An OpenAI-compatible endpoint called straight from the browser with the user's key. */
export type Llm = {
  model: (id: string) => LanguageModel;
  listModels: (signal?: AbortSignal) => Promise<string[]>;
};

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export function createLlm({ baseURL, apiKey }: { baseURL: string; apiKey: string }): Llm {
  const base = baseURL.replace(/\/$/, "");
  const provider = createOpenAICompatible({
    name: "llm",
    baseURL: base,
    apiKey: apiKey || undefined,
    supportsStructuredOutputs: true,
  });

  return {
    model: (id) => provider.chatModel(id),
    async listModels(signal) {
      const response = await fetch(`${base}/models`, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal,
      });
      if (!response.ok) throw new Error(describeStatus(response.status, "GET /models"));
      return modelsSchema
        .parse(await response.json())
        .data.map((m) => m.id)
        .toSorted();
    },
  };
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|[\w-]+\.local)(:|\/|$)/i;

/** Completes what the user typed: scheme (http for local hosts), and `/v1` when no path is given. */
export function normalizeEndpoint(input: string): string {
  const text = input.trim();
  const scheme = LOCAL_HOST.test(text) ? "http" : "https";
  const url = URL.parse(/^[a-z][\w+.-]*:\/\//i.test(text) ? text : `${scheme}://${text}`);
  if (!url?.hostname) return text;
  const path = url.pathname.replace(/\/+$/, "") || "/v1";
  return `${url.origin}${path}`;
}

function describeStatus(status: number, what: string) {
  return status === 401 || status === 403
    ? `The model endpoint rejected the API key (${status}).`
    : `${what} failed with ${status}.`;
}

/** Turns AI SDK errors into one line the UI can show. */
export function describeLlmError(error: unknown): string {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause) && cause.statusCode)
    return describeStatus(cause.statusCode, "The model call");
  return cause instanceof Error ? cause.message : String(cause);
}
