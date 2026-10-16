import { z } from "zod";

export const SUGGESTION_COUNT = 3;

export const suggestRequestSchema = z
  .object({
    document: z.string(),
    selection: z.object({
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
    }),
    steering: z.string().max(4000).default(""),
    contextPath: z.string().optional(),
    model: z.string().optional(),
  })
  .refine(
    ({ document, selection }) => selection.from < selection.to && selection.to <= document.length,
    { message: "selection must be a non-empty range inside document", path: ["selection"] },
  );
export type SuggestRequest = z.input<typeof suggestRequestSchema>;

const alternativeSchema = z.object({
  text: z.string().describe("Replacement for the selected text. No surrounding quotes."),
  rationale: z.string().describe("One short sentence: what changed and why."),
});
export type Alternative = z.infer<typeof alternativeSchema>;

export const alternativesSchema = z.object({
  alternatives: z.array(alternativeSchema).length(SUGGESTION_COUNT),
});

export const suggestResponseSchema = z.object({
  alternatives: z.array(alternativeSchema),
  sources: z.array(z.string()),
});
export type SuggestResponse = z.infer<typeof suggestResponseSchema>;

export const contextStatusSchema = z.object({
  root: z.string(),
  files: z.number(),
  chunks: z.number(),
});
export type ContextStatus = z.infer<typeof contextStatusSchema>;

export const modelsResponseSchema = z.object({
  defaultModel: z.string().nullable(),
  models: z.array(z.string()),
});
export type ModelsResponse = z.infer<typeof modelsResponseSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
