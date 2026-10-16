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

export type SuggestResponse = { alternatives: Alternative[]; sources: string[] };
