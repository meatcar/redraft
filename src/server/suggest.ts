import { generateText, isStepCount, Output, tool, type LanguageModel } from "ai";
import { z } from "zod";

import {
  alternativesSchema,
  SUGGESTION_COUNT,
  type SuggestResponse,
  type suggestRequestSchema,
} from "../shared/api";
import type { ContextHit, ContextIndex } from "./context";

const EXCERPT_CHARS = 3000;
const PREFETCH_HITS = 4;
const MAX_READ_CHARS = 8000;

const SYSTEM = `You are a sharp, careful editor.
The user selected a span of their document. Propose exactly ${SUGGESTION_COUNT} replacements for that span.

Rules:
- Each replacement must drop into the document in place of the selection and read naturally with the text around it: match its markdown, tense, person, and voice.
- Return only the replacement for the selection, never the surrounding text.
- Make the options meaningfully different from each other, not three paraphrases.
- The steering instructions, when present, override your default taste.
- When a context folder is available, use it to check facts, names, terminology, and house style before writing. Search more than once if the first results are weak. Never invent facts the document or context does not support.`;

type SuggestInput = z.output<typeof suggestRequestSchema>;

export type SuggestDeps = {
  model: LanguageModel;
  context?: ContextIndex;
  maxSteps: number;
  abortSignal?: AbortSignal;
};

function excerpt(document: string, from: number, to: number) {
  const start = Math.max(0, from - EXCERPT_CHARS);
  const end = Math.min(document.length, to + EXCERPT_CHARS);
  return [
    start > 0 ? "…" : "",
    document.slice(start, from),
    "⟦SELECTION⟧",
    document.slice(from, to),
    "⟦/SELECTION⟧",
    document.slice(to, end),
    end < document.length ? "…" : "",
  ].join("");
}

function formatHits(hits: ContextHit[]) {
  if (hits.length === 0) return "No matches.";
  return hits
    .map((h) => `<source path="${h.path}" section="${h.heading}">\n${h.text}\n</source>`)
    .join("\n");
}

/** Keeps the selection's edge whitespace so a replacement does not glue words together. */
function preserveEdges(original: string, replacement: string): string {
  const lead = /^\s*/.exec(original)?.[0] ?? "";
  const trail = /\s*$/.exec(original)?.[0] ?? "";
  return `${lead}${replacement.trim()}${trail}`;
}

function contextTools(context: ContextIndex, consulted: Set<string>) {
  return {
    search_context: tool({
      description:
        "Full-text search (BM25, fuzzy) over the user's context folder. Returns matching sections with their file paths.",
      inputSchema: z.object({ query: z.string().describe("Keywords, names, or phrases.") }),
      execute: ({ query }) => {
        const hits = context.search(query);
        for (const hit of hits) consulted.add(hit.path);
        return formatHits(hits);
      },
    }),
    read_context_file: tool({
      description: "Read a whole file from the context folder by the path returned from search.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const text = await context.read(path).catch((error: Error) => `Error: ${error.message}`);
        consulted.add(path);
        return text.length > MAX_READ_CHARS
          ? `${text.slice(0, MAX_READ_CHARS)}\n…(truncated)`
          : text;
      },
    }),
  };
}

export async function suggest(request: SuggestInput, deps: SuggestDeps): Promise<SuggestResponse> {
  const { document, selection, steering } = request;
  const selected = document.slice(selection.from, selection.to);
  const consulted = new Set<string>();

  const sections = [
    `<document_excerpt>\n${excerpt(document, selection.from, selection.to)}\n</document_excerpt>`,
    `<selection>\n${selected}\n</selection>`,
    `<steering>\n${steering.trim() || "None. Improve clarity and flow."}\n</steering>`,
  ];

  if (deps.context) {
    const hits = deps.context.search(`${selected} ${steering}`, PREFETCH_HITS);
    for (const hit of hits) consulted.add(hit.path);
    sections.push(
      `<retrieved_context note="automatic search on the selection">\n${formatHits(hits)}\n</retrieved_context>`,
    );
  }

  const { output } = await generateText({
    model: deps.model,
    system: SYSTEM,
    prompt: sections.join("\n\n"),
    tools: deps.context ? contextTools(deps.context, consulted) : undefined,
    stopWhen: isStepCount(deps.maxSteps),
    output: Output.object({ schema: alternativesSchema }),
    abortSignal: deps.abortSignal,
  });

  return {
    alternatives: output.alternatives.map(({ text, rationale }) => ({
      text: preserveEdges(selected, text),
      rationale,
    })),
    sources: [...consulted].toSorted(),
  };
}
