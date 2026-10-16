import { generateText, isStepCount, Output, tool, type LanguageModel } from "ai";
import { z } from "zod";

import {
  alternativesSchema,
  SUGGESTION_COUNT,
  suggestRequestSchema,
  type SuggestRequest,
  type SuggestResponse,
} from "./api";
import type { ContextHit, ContextIndex } from "./context";

const MAX_READ_CHARS = 8000;
const MAX_AROUND_CHARS = 6000;
const DOCUMENT_HITS = 5;
const MAX_PARAGRAPH_CHARS = 1500;

const SYSTEM = `You are a sharp, careful editor.
The user selected a span of their document. Propose exactly ${SUGGESTION_COUNT} replacements for that span.

You see only the selection and the user's steering. Tools can show more:
- read_around_selection and search_document read the rest of the document.
- search_context and read_context_file read the user's context folder, when one is set.
Reach for them only when the steering or the selection needs it, such as matching nearby flow, checking a name, or following a house style. Otherwise answer directly.

Rules:
- Each replacement must drop into the document in place of the selection: keep its markdown, tense, person, and voice unless the steering says otherwise.
- Return only the replacement for the selection, never the surrounding text.
- Make the options meaningfully different from each other, not three paraphrases.
- The steering instructions override your default taste.
- Never invent facts the selection, document, or context does not support.`;

const MAX_STEPS = 6;

type ContextReader = Pick<ContextIndex, "search" | "read">;

export type SuggestDeps = {
  model: LanguageModel;
  context?: ContextReader;
  maxSteps?: number;
  abortSignal?: AbortSignal;
};

function paragraphs(document: string) {
  const found: { start: number; text: string }[] = [];
  let start = 0;
  for (const separator of [...document.matchAll(/\n{2,}/g), { index: document.length, 0: "" }]) {
    const text = document.slice(start, separator.index).trim();
    if (text) found.push({ start, text });
    start = separator.index + separator[0].length;
  }
  return found;
}

function searchDocument(document: string, query: string) {
  const words = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const hits = paragraphs(document)
    .map(({ start, text }) => {
      const lower = text.toLowerCase();
      return { start, text, score: [...words].filter((w) => lower.includes(w)).length };
    })
    .filter((p) => p.score > 0)
    .toSorted((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, DOCUMENT_HITS);
  if (hits.length === 0) return "No matches.";
  return hits
    .map((h) => `<match offset="${h.start}">\n${h.text.slice(0, MAX_PARAGRAPH_CHARS)}\n</match>`)
    .join("\n");
}

function documentTools(document: string, from: number, to: number) {
  return {
    read_around_selection: tool({
      description: "Read the document text just before and after the selection.",
      inputSchema: z.object({
        chars: z.number().int().min(1).max(MAX_AROUND_CHARS).describe("Characters on each side."),
      }),
      execute: ({ chars }) =>
        [
          `<before>\n${document.slice(Math.max(0, from - chars), from)}\n</before>`,
          `<after>\n${document.slice(to, to + chars)}\n</after>`,
        ].join("\n"),
    }),
    search_document: tool({
      description: "Find paragraphs anywhere in the document that mention any of the words.",
      inputSchema: z.object({ query: z.string().describe("Keywords or names.") }),
      execute: ({ query }) => searchDocument(document, query),
    }),
  };
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

function contextTools(context: ContextReader, consulted: Set<string>) {
  return {
    search_context: tool({
      description:
        "Full-text search (BM25, matches any word by prefix) over the user's context folder. Returns matching sections with their file paths. Use distinctive keywords; try synonyms if results are weak.",
      inputSchema: z.object({ query: z.string().describe("Keywords, names, or phrases.") }),
      execute: async ({ query }) => {
        const hits = await context.search(query);
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

export async function suggest(
  request: SuggestRequest,
  deps: SuggestDeps,
): Promise<SuggestResponse> {
  const { document, selection, steering } = suggestRequestSchema.parse(request);
  const selected = document.slice(selection.from, selection.to);
  const consulted = new Set<string>();

  const prompt = [
    `<selection>\n${selected}\n</selection>`,
    `<steering>\n${steering.trim() || "None. Improve clarity and flow."}\n</steering>`,
  ].join("\n\n");

  const { output } = await generateText({
    model: deps.model,
    system: SYSTEM,
    prompt,
    tools: {
      ...documentTools(document, selection.from, selection.to),
      ...(deps.context && contextTools(deps.context, consulted)),
    },
    stopWhen: isStepCount(deps.maxSteps ?? MAX_STEPS),
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
