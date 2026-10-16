import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { modelsResponseSchema, suggestResponseSchema, type SuggestRequest } from "../shared/api";
import { createApp } from "./app";
import { ContextLibrary } from "./context";
import { loadConfig } from "./config";
import { createLlm, type Llm } from "./llm";

type Content = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>["content"];

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Replays one scripted response per model step and records every prompt it receives. */
function scriptedLlm(steps: Content[]) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const content = steps[prompts.length - 1] ?? [];
      const finish = content.some((part) => part.type === "tool-call") ? "tool-calls" : "stop";
      return { content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] };
    },
  });
  const llm: Llm = { defaultModel: "test-model", model: () => model, listModels: async () => [] };
  return { llm, prompts };
}

const answer = (texts: string[]): Content => [
  {
    type: "text",
    text: JSON.stringify({ alternatives: texts.map((text) => ({ text, rationale: "why" })) }),
  },
];

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "redraft-app-"));
  await mkdir(join(root, "notes"));
  await writeFile(
    join(root, "notes/style.md"),
    "# Style\n\nOur mascot is a capybara named Clementine.\n",
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const document = "Hello there. We love our mascot. Goodbye.";
const selection = { from: 13, to: 33 };

async function post(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/api/suggest", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/suggest", () => {
  test("returns three alternatives grounded in context the model searched", async () => {
    const { llm, prompts } = scriptedLlm([
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
    const app = createApp({ llm, library: new ContextLibrary(root), maxSteps: 4 });

    const response = await post(app, {
      document,
      selection,
      steering: "name the mascot",
      contextPath: "notes",
    } satisfies SuggestRequest);

    expect(response.status).toBe(200);
    const body = suggestResponseSchema.parse(await response.json());
    expect(body.alternatives.map((a) => a.text)).toEqual([
      "We love Clementine. ",
      "Clementine is our mascot. ",
      "Meet Clementine the capybara. ",
    ]);
    expect(body.sources).toEqual(["style.md"]);
    expect(prompts[0]).toContain("name the mascot");
    expect(prompts[1]).toContain("capybara named Clementine");
  });

  test("works without a context folder", async () => {
    const { llm } = scriptedLlm([answer(["a", "b", "c"])]);
    const app = createApp({ llm, library: new ContextLibrary(root), maxSteps: 2 });
    const response = await post(app, { document, selection });
    expect(response.status).toBe(200);
    expect(suggestResponseSchema.parse(await response.json()).sources).toEqual([]);
  });

  test("rejects a selection outside the document", async () => {
    const { llm } = scriptedLlm([]);
    const app = createApp({ llm, library: new ContextLibrary(root), maxSteps: 2 });
    const response = await post(app, { document, selection: { from: 5, to: 500 } });
    expect(response.status).toBe(400);
  });

  test("rejects a context path outside the root", async () => {
    const { llm } = scriptedLlm([]);
    const app = createApp({ llm, library: new ContextLibrary(join(root, "notes")), maxSteps: 2 });
    const response = await post(app, { document, selection, contextPath: root });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.stringContaining("outside") });
  });

  test("reports a missing model endpoint as unavailable", async () => {
    const app = createApp({ library: new ContextLibrary(root), maxSteps: 2 });
    const response = await post(app, { document, selection });
    expect(response.status).toBe(503);
  });

  test("fails when the model returns the wrong number of alternatives", async () => {
    const { llm } = scriptedLlm([answer(["only one"])]);
    const app = createApp({ llm, library: new ContextLibrary(root), maxSteps: 2 });
    const response = await post(app, { document, selection });
    expect(response.status).toBe(502);
  });
});

const auth = (key: string) => ({ authorization: `Bearer ${key}` });

describe("API key from the browser", () => {
  const GOOD = "good-key";
  let upstream: ReturnType<typeof Bun.serve>;
  let app: ReturnType<typeof createApp>;

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
    const config = loadConfig({ LLM_BASE_URL: `${upstream.url.href}v1`, LLM_API_KEY: "" });
    app = createApp({ llm: createLlm(config), library: new ContextLibrary(root), maxSteps: 2 });
  });

  afterAll(() => upstream.stop(true));

  test("lists the endpoint's models with the caller's key", async () => {
    const response = await app.request("/api/models", { headers: auth(GOOD) });
    expect(response.status).toBe(200);
    expect(modelsResponseSchema.parse(await response.json()).models).toEqual(["alpha", "zeta"]);
  });

  test("reports a rejected key as 401", async () => {
    const response = await app.request("/api/models", { headers: auth("bad") });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: expect.stringContaining("API key") });
  });

  test("suggests with the caller's key", async () => {
    const ok = await post(app, { document, selection, model: "alpha" }, auth(GOOD));
    expect(ok.status).toBe(200);
    const rejected = await post(app, { document, selection, model: "alpha" }, auth("bad"));
    expect(rejected.status).toBe(401);
  });
});
