import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";

import { ContextIndex } from "./context";
import { snapshotSource } from "./files";
import { createLlm, describeLlmError } from "./llm";
import { suggest } from "./suggest";

type Content = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>["content"];

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Replays one scripted response per model step and records every prompt it receives. */
function scriptedModel(steps: Content[]) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const content = steps[prompts.length - 1] ?? [];
      const finish = content.some((part) => part.type === "tool-call") ? "tool-calls" : "stop";
      return { content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] };
    },
  });
  return { model, prompts };
}

const answer = (texts: string[]): Content => [
  {
    type: "text",
    text: JSON.stringify({ alternatives: texts.map((text) => ({ text, rationale: "why" })) }),
  },
];

const notes = () => {
  const file = new File(["# Style\n\nOur mascot is a capybara named Clementine.\n"], "style.md");
  Object.defineProperty(file, "webkitRelativePath", { value: "notes/style.md" });
  return ContextIndex.open(snapshotSource([file]));
};

const document = "Hello there. We love our mascot. Goodbye.";
const selection = { from: 13, to: 33 };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("suggest", () => {
  test("returns three alternatives grounded in context the model searched", async () => {
    const { model, prompts } = scriptedModel([
      [
        {
          type: "tool-call",
          toolCallId: "1",
          toolName: "search_context",
          input: '{"query":"mascot name"}',
        },
      ],
      answer(["We love Clementine.", "Clementine is our mascot.", "Meet Clementine the capybara."]),
    ]);

    const result = await suggest(
      { document, selection, steering: "name the mascot" },
      { model, context: await notes(), maxSteps: 4 },
    );

    expect(result.alternatives.map((a) => a.text)).toEqual([
      "We love Clementine. ",
      "Clementine is our mascot. ",
      "Meet Clementine the capybara. ",
    ]);
    expect(result.sources).toEqual(["style.md"]);
    expect(prompts[0]).toContain("name the mascot");
    expect(prompts[1]).toContain("capybara named Clementine");
  });

  test("starts from the selection and steering alone", async () => {
    const { model, prompts } = scriptedModel([answer(["a", "b", "c"])]);
    await suggest(
      { document, selection, steering: "punchier" },
      { model, context: await notes(), maxSteps: 2 },
    );

    expect(prompts[0]).toContain("We love our mascot.");
    expect(prompts[0]).toContain("punchier");
    expect(prompts[0]).not.toContain("Hello there");
    expect(prompts[0]).not.toContain("Goodbye");
    expect(prompts[0]).not.toContain("Clementine");
  });

  test("lets the model read around the selection and search the document", async () => {
    const long = `${"Intro filler. ".repeat(40)}\n\nOur wombat is named Gus.\n\nWe love our mascot.\n\nThe end.`;
    const at = long.indexOf("We love");
    const { model, prompts } = scriptedModel([
      [
        {
          type: "tool-call",
          toolCallId: "1",
          toolName: "read_around_selection",
          input: '{"chars":20}',
        },
        {
          type: "tool-call",
          toolCallId: "2",
          toolName: "search_document",
          input: '{"query":"wombat"}',
        },
      ],
      answer(["a", "b", "c"]),
    ]);
    await suggest(
      { document: long, selection: { from: at, to: at + "We love our mascot.".length } },
      { model, maxSteps: 3 },
    );

    const toolResults = prompts[1] ?? "";
    expect(toolResults).toContain("named Gus.");
    expect(toolResults).toContain("The end.");
    expect(toolResults).not.toContain("Intro filler. Intro filler. Intro");
    expect(toolResults).toContain("Our wombat is named Gus.");
  });

  test("works without a context folder", async () => {
    const { model } = scriptedModel([answer(["a", "b", "c"])]);
    expect((await suggest({ document, selection }, { model })).sources).toEqual([]);
  });

  test("rejects a selection outside the document", async () => {
    const { model, prompts } = scriptedModel([]);
    await rejection(suggest({ document, selection: { from: 5, to: 500 } }, { model }));
    expect(prompts).toHaveLength(0);
  });

  test("fails when the model returns the wrong number of alternatives", async () => {
    const { model } = scriptedModel([answer(["only one"])]);
    await rejection(suggest({ document, selection }, { model }));
  });
});

describe("OpenAI-compatible endpoint with the user's key", () => {
  const GOOD = "good-key";
  let upstream: ReturnType<typeof Bun.serve>;
  const llm = (apiKey: string) => createLlm({ baseURL: `${upstream.url.href}v1/`, apiKey });

  beforeAll(() => {
    upstream = Bun.serve({
      port: 0,
      fetch(request) {
        if (request.headers.get("authorization") !== `Bearer ${GOOD}`) {
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        if (new URL(request.url).pathname === "/v1/models") {
          return Response.json({ data: [{ id: "zeta" }, { id: "alpha" }] });
        }
        const content = JSON.stringify({
          alternatives: ["a", "b", "c"].map((text) => ({ text, rationale: "" })),
        });
        return Response.json({
          id: "1",
          created: 0,
          model: "alpha",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
        });
      },
    });
  });

  afterAll(() => upstream.stop(true));

  test("lists the endpoint's models, sorted", async () => {
    expect(await llm(GOOD).listModels()).toEqual(["alpha", "zeta"]);
  });

  test("explains a rejected key", async () => {
    const error = await rejection(llm("bad").listModels());
    expect(String(error)).toContain("rejected the API key");
  });

  test("suggests with the key, and explains a rejected one", async () => {
    const ok = await suggest({ document, selection }, { model: llm(GOOD).model("alpha") });
    expect(ok.alternatives.map((a) => a.text)).toEqual(["a ", "b ", "c "]);

    const error = await rejection(
      suggest({ document, selection }, { model: llm("bad").model("alpha") }),
    );
    expect(describeLlmError(error)).toContain("rejected the API key");
  });
});
