import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { z } from "zod";

import type { Config } from "./config";

/** apiKey comes from the caller when present, else from LLM_API_KEY. */
export type Llm = {
  defaultModel: string | null;
  model: (id: string, apiKey?: string) => LanguageModel;
  listModels: (apiKey?: string) => Promise<string[]>;
};

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createLlm(config: Config): Llm | undefined {
  const baseURL = config.LLM_BASE_URL?.replace(/\/$/, "");
  if (!baseURL) return undefined;
  const keyOf = (apiKey?: string) => apiKey || config.LLM_API_KEY;

  return {
    defaultModel: config.LLM_MODEL ?? null,
    model: (id, apiKey) =>
      createOpenAICompatible({
        name: "llm",
        baseURL,
        apiKey: keyOf(apiKey),
        supportsStructuredOutputs: config.LLM_STRUCTURED_OUTPUTS,
      }).chatModel(id),
    async listModels(apiKey) {
      const key = keyOf(apiKey);
      const response = await fetch(`${baseURL}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new UpstreamError(
          response.status,
          `GET /models failed with ${response.status} ${detail}`.trim(),
        );
      }
      return modelsSchema
        .parse(await response.json())
        .data.map((m) => m.id)
        .toSorted();
    },
  };
}
