import { basename, resolve } from "node:path";

const root = resolve(".cache/search-bench/github-docs/content");
const canary = "# House style\n\nThe support plan costs 12 dollars. benchmarkuicanaryqz\n";
const files: { path: string; text: string }[] = [{ path: "proof/canary.md", text: canary }];
for (const path of [...new Bun.Glob("**/*.md").scanSync(root)].toSorted()) {
  // oxlint-disable-next-line no-await-in-loop
  files.push({ path, text: await Bun.file(`${root}/${path}`).text() });
}
const calls: unknown[] = [];
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
};
const reply = (message: object, finish_reason = "stop") =>
  Response.json(
    {
      id: "proof",
      created: 0,
      model: "proof-model",
      choices: [
        { index: 0, finish_reason, message: { role: "assistant", content: null, ...message } },
      ],
    },
    { headers },
  );
const alternatives = (price: string | undefined) =>
  JSON.stringify({
    alternatives: [
      {
        text: price ? `The support plan costs ${price} dollars.` : "No context found.",
        rationale: "Direct.",
      },
      {
        text: price ? `Pay ${price} dollars for the support plan.` : "No context is available.",
        rationale: "Active.",
      },
      {
        text: price ? `Support is ${price} dollars.` : "Please choose a context folder.",
        rationale: "Brief.",
      },
    ],
  });

async function modelReply(request: Request) {
  const body = await request.json();
  calls.push({
    at: new Date().toISOString(),
    messages: body.messages,
    tools: body.tools?.map((tool: any) => tool.function.name),
  });
  await Bun.write("dist/search-ui-calls.json", JSON.stringify(calls, null, 2));
  const tools = body.messages.filter((message: any) => message.role === "tool");
  if (!body.tools?.some((tool: any) => tool.function.name === "search_context"))
    return reply({ content: alternatives(undefined) });
  if (tools.length === 0)
    return reply(
      {
        tool_calls: [
          {
            id: "search",
            type: "function",
            function: {
              name: "search_context",
              arguments: JSON.stringify({ query: "benchmarkuicanaryqz" }),
            },
          },
        ],
      },
      "tool_calls",
    );
  return respondToSearch(tools);
}

function respondToSearch(tools: [{ content: string }, { content: string }?]) {
  if (tools[0].content === "No matches.") return reply({ content: alternatives(undefined) });
  if (!tools[0].content.includes('path="proof/canary.md"'))
    return new Response("Wrong search result", { status: 500, headers });
  if (tools.length === 1)
    return reply(
      {
        tool_calls: [
          {
            id: "read",
            type: "function",
            function: {
              name: "read_context_file",
              arguments: JSON.stringify({ path: "proof/canary.md" }),
            },
          },
        ],
      },
      "tool_calls",
    );
  return respondToFile(tools[1]!.content);
}

function respondToFile(content: string) {
  const price = /costs (\d+) dollars/.exec(content)?.[1];
  if (!price) return new Response("Missing price in real tool result", { status: 500, headers });
  return reply({ content: alternatives(price) });
}

const pages = new Map([
  ["/before.html", "dist/search-proof-baseline.html"],
  ["/after.html", "dist/redraft.html"],
]);
Bun.serve({
  port: 3002,
  routes: {
    "/seed": () => new Response("Proof setup", { headers }),
    "/fixture.json": () => Response.json(files, { headers }),
    "/log.json": () => Response.json(calls, { headers }),
    "/models": () => Response.json({ data: [{ id: "proof-model" }] }, { headers }),
    "/chat/completions": modelReply,
  },
  fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const file = Bun.file(pages.get(url.pathname) ?? `dist/${basename(url.pathname)}`);
    return new Response(file, { headers });
  },
});
console.log(JSON.stringify({ files: files.length, port: 3002 }));
