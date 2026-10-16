import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { z } from "zod";

import type { Config } from "./config";

export type Llm = {
  defaultModel: string | null;
  model(id: string): LanguageModel;
  listModels(): Promise<string[]>;
};

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export function createLlm(config: Config): Llm | undefined {
  const baseURL = config.LLM_BASE_URL;
  if (!baseURL) return undefined;
  const provider = createOpenAICompatible({
    name: "llm",
    baseURL,
    apiKey: config.LLM_API_KEY,
    supportsStructuredOutputs: config.LLM_STRUCTURED_OUTPUTS,
  });
  return {
    defaultModel: config.LLM_MODEL ?? null,
    model: (id) => provider.chatModel(id),
    async listModels() {
      const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
        headers: config.LLM_API_KEY ? { Authorization: `Bearer ${config.LLM_API_KEY}` } : {},
      });
      if (!response.ok) throw new Error(`GET /models failed with ${response.status}`);
      return modelsSchema
        .parse(await response.json())
        .data.map((m) => m.id)
        .toSorted();
    },
  };
}
