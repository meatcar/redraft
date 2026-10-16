import type { z } from "zod";

import {
  apiErrorSchema,
  contextStatusSchema,
  modelsResponseSchema,
  suggestResponseSchema,
  type SuggestRequest,
} from "../../shared/api";

async function call<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : `HTTP ${response.status}`);
  }
  return schema.parse(body);
}

const authHeader = (apiKey: string): Record<string, string> =>
  apiKey ? { authorization: `Bearer ${apiKey}` } : {};

export const api = {
  models: (apiKey: string, signal?: AbortSignal) =>
    call(modelsResponseSchema, "/api/models", { headers: authHeader(apiKey), signal }),
  context: (path: string) =>
    call(contextStatusSchema, `/api/context?path=${encodeURIComponent(path)}`),
  suggest: (request: SuggestRequest, apiKey: string, signal?: AbortSignal) =>
    call(suggestResponseSchema, "/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(apiKey) },
      body: JSON.stringify(request),
      signal,
    }),
};
