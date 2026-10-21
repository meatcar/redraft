import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test, type Page, type Route } from "@playwright/test";

// NOTE: tests the released artifact; run `bun run build:html` first.
const APP_URL = pathToFileURL(resolve("dist/redraft.html")).href;
const ENDPOINT = "https://llm.example.test/v1";
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";
const DOCUMENT = "Intro line.\nWe love our mascot.\nOutro line.";
const SELECTED = "We love our mascot.";
const REWRITES = [
  "Clementine the capybara is our mascot.",
  "Our capybara, Clementine, leads the way.",
  "Meet Clementine, our capybara mascot.",
];

type Message = { role: string; content: unknown; tool_calls?: unknown };

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const reply = (route: Route, body: unknown) => route.fulfill({ json: body, headers: cors });

const completion = (message: object, finish_reason: string) => ({
  id: "1",
  created: 0,
  model: "acme/writer",
  choices: [{ index: 0, finish_reason, message: { role: "assistant", ...message } }],
});

/**
 * Stands in for an OpenAI-compatible endpoint: the first call searches the context folder,
 * the second answers. Records every chat request body.
 */
async function fakeEndpoint(page: Page) {
  const chats: { messages: Message[] }[] = [];
  await page.route(`${DEFAULT_ENDPOINT}/**`, (route) => reply(route, { data: [] }));
  await page.route(`${ENDPOINT}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.url().endsWith("/models"))
      return reply(route, { data: [{ id: "acme/writer" }, { id: "acme/editor" }] });
    chats.push(request.postDataJSON());
    if (chats.length === 1) {
      const call = { name: "search_context", arguments: JSON.stringify({ query: "mascot" }) };
      return reply(
        route,
        completion(
          { content: null, tool_calls: [{ id: "c1", type: "function", function: call }] },
          "tool_calls",
        ),
      );
    }
    const alternatives = REWRITES.map((text) => ({ text, rationale: "Names the mascot." }));
    return reply(route, completion({ content: JSON.stringify({ alternatives }) }, "stop"));
  });
  return chats;
}

/** Fails the test on anything that would break the page quietly in a real browser. */
function watchForBreakage(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("request", (r) => {
    const url = r.url();
    const allowed = ["file:", "data:", ENDPOINT, `${DEFAULT_ENDPOINT}/models`];
    if (!allowed.some((prefix) => url.startsWith(prefix)))
      problems.push(`unexpected request: ${url}`);
  });
  return problems;
}

async function notesFolder() {
  const root = await mkdtemp(join(tmpdir(), "redraft-e2e-"));
  const folder = join(root, "notes");
  await mkdir(join(folder, "brand"), { recursive: true });
  await writeFile(
    join(folder, "brand", "mascot.md"),
    "# Mascot\n\nOur mascot is a capybara named Clementine.\n",
  );
  await writeFile(join(folder, "todo.md"), "# Todo\n\nBuy oat milk.\n");
  return folder;
}

const editorText = async (page: Page) => (await page.locator(".cm-content").innerText()).trimEnd();

test("rewrites a selection with context from a picked folder", async ({ page, isMobile }) => {
  const problems = watchForBreakage(page);
  const chats = await fakeEndpoint(page);
  await page.goto(APP_URL);

  await test.step("styles load", async () => {
    const header = page.locator("header");
    await expect(header).toHaveCSS("display", "flex");
    await expect(header).toHaveCSS("border-bottom-width", "1px");
  });

  await test.step("connect a custom endpoint and pick a model", async () => {
    await page.getByRole("button", { name: /^Model settings/ }).click();
    await page.getByRole("combobox", { name: "Provider" }).click();
    await page.getByRole("option", { name: "Custom" }).click();
    const endpoint = page.getByLabel("Model endpoint");
    await endpoint.fill("llm.example.test");
    await endpoint.press("Enter");
    await expect(endpoint).toHaveValue(ENDPOINT);
    const key = page.getByLabel("API key");
    await key.fill("sk-test");
    await key.press("Enter");
    await page.getByRole("combobox", { name: "Model" }).click();
    await page.getByRole("button", { name: /^acme/ }).click();
    await page.getByRole("option", { name: "writer" }).click();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(/acme\/writer/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Model settings/ })).toHaveAccessibleName(
      `Model settings: ${new URL(ENDPOINT).host} · acme/writer`,
    );
  });

  await test.step("index a context folder in the browser", async () => {
    await page.getByLabel("Context folder files").setInputFiles(await notesFolder());
    await expect(page.getByRole("button", { name: "Context folder: notes" })).toBeVisible();
  });

  await test.step("type a document and select a line", async () => {
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(DOCUMENT);
    await expect.poll(() => editorText(page)).toBe(DOCUMENT);
    await page.locator(".cm-line", { hasText: SELECTED }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
  });

  await test.step("suggest", async () => {
    if (isMobile) await page.getByRole("button", { name: /^Suggest/ }).click();
    else await page.keyboard.press("Control+Space");
    await Promise.all(REWRITES.map((text) => expect(page.getByText(text)).toBeVisible()));
    await expect(page.getByText("Context consulted (1)")).toBeVisible();
  });

  await test.step("the endpoint saw the selection and the searched notes", async () => {
    expect(chats).toHaveLength(2);
    const [first, second] = chats;
    expect(JSON.stringify(first!.messages.at(-1)?.content)).toContain(SELECTED);
    const tool = second!.messages.find((m) => m.role === "tool");
    expect(JSON.stringify(tool?.content)).toContain("capybara named Clementine");
    expect(JSON.stringify(tool?.content)).not.toContain("oat milk");
  });

  await test.step("preview and keep option 2", async () => {
    if (isMobile) {
      await page.getByRole("button", { name: /^Preview option 2/ }).click();
    } else {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
    }
    await expect.poll(() => editorText(page)).toBe(DOCUMENT.replace(SELECTED, REWRITES[1]!));
    if (isMobile) await page.getByRole("button", { name: /^Keep/ }).click();
    else await page.keyboard.press("Enter");
    await expect(page.getByText(REWRITES[0]!)).toBeHidden();
  });

  await test.step("the edit survives a reload", async () => {
    await page.reload();
    await expect.poll(() => editorText(page)).toBe(DOCUMENT.replace(SELECTED, REWRITES[1]!));
  });

  expect(problems).toEqual([]);
});
