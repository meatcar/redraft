import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { z } from "zod";

import { App } from "./App";
import { json, stubFetch } from "./test/fetch";

const chatSchema = z.object({ messages: z.array(z.object({ content: z.unknown() })) });

const sample = "Alpha beta gamma.";

const completion = (content: string) =>
  json({
    id: "1",
    created: 0,
    model: "m",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  });

/** Stands in for the OpenAI-compatible endpoint the browser calls directly. */
async function setup() {
  const requests = stubFetch((request) =>
    new URL(request.url).pathname.endsWith("/chat/completions")
      ? completion(
          JSON.stringify({
            alternatives: [1, 2, 3].map((n) => ({ text: `Option text ${n}`, rationale: "" })),
          }),
        )
      : json({ data: [{ id: "m" }] }),
  );
  const { container } = render(<App />);
  const view = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-content")!)!;
  const suggestions = () => requests.filter((r) => r.url.endsWith("/chat/completions"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Model settings/ }).textContent).toContain("m"),
  );
  return { view, suggestions };
}

const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

const userPrompt = async (request: Request) =>
  JSON.stringify(chatSchema.parse(await request.json()).messages.at(-1)?.content);

beforeEach(() => {
  localStorage.setItem("redraft:document", sample);
  localStorage.setItem("redraft:apiKey:https://openrouter.ai/api/v1", "sk-1");
  localStorage.setItem("redraft:model:https://openrouter.ai/api/v1", "m");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("App", () => {
  test("selecting text alone requests nothing; Ctrl+Space does", async () => {
    const { view, suggestions } = await setup();
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    await new Promise((r) => setTimeout(r, 30));
    expect(suggestions()).toHaveLength(0);

    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("Option text 2")).toBeTruthy());
    expect(suggestions()).toHaveLength(1);
  });

  test("Ctrl+Space refreshes the last suggestions after the selection is gone", async () => {
    const { view, suggestions } = await setup();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", metaKey: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(suggestions()).toHaveLength(0);

    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("Option text 1")).toBeTruthy());

    view.dispatch({ selection: { anchor: 12 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await waitFor(() => expect(suggestions()).toHaveLength(2));
    expect(await userPrompt(suggestions()[1]!)).toContain("<selection>\\nAlpha\\n</selection>");
  });

  test("Tab cycles previews in place, Esc restores, Enter keeps one undoable change", async () => {
    const { view } = await setup();
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await screen.findByText("Option text 3");
    const doc = () => view.state.doc.toString();
    const press = (key: string, init: object = {}) =>
      fireEvent.keyDown(view.contentDOM, { key, code: key, ...init });

    press("Tab");
    expect(doc()).toBe("Alpha Option text 1 gamma.");
    press("Tab");
    expect(doc()).toBe("Alpha Option text 2 gamma.");
    press("Tab", { shiftKey: true });
    press("Tab", { shiftKey: true });
    expect(doc()).toBe("Alpha Option text 3 gamma.");
    press("Escape");
    expect(doc()).toBe(sample);
    expect(screen.getByText("Option text 1")).toBeTruthy();

    press("Tab");
    press("Enter");
    expect(doc()).toBe("Alpha Option text 1 gamma.");
    await waitFor(() => expect(screen.queryByText("Option text 2")).toBeNull());
    undo(view);
    expect(doc()).toBe(sample);
  });

  test("every preview shortcut has a button that does the same", async () => {
    const { view } = await setup();
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    fireEvent.click(screen.getByRole("button", { name: /^Suggest/ }));
    await screen.findByText("Option text 3");
    const doc = () => view.state.doc.toString();

    expect(screen.getByRole("button", { name: /^Keep/ }).hasAttribute("disabled")).toBe(true);
    click(/^Preview option 2/);
    expect(doc()).toBe("Alpha Option text 2 gamma.");
    click(/^Next/);
    expect(doc()).toBe("Alpha Option text 3 gamma.");
    click(/^Previous/);
    expect(doc()).toBe("Alpha Option text 2 gamma.");
    click(/^Restore/);
    expect(doc()).toBe(sample);
    click(/^Next/);
    click(/^Keep/);
    expect(doc()).toBe("Alpha Option text 1 gamma.");
    await waitFor(() => expect(screen.queryByText("Option text 2")).toBeNull());
  });

  test("Ctrl or Alt with a digit previews that option", async () => {
    const { view } = await setup();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await screen.findByText("Option text 3");
    fireEvent.keyDown(view.contentDOM, { code: "Digit2", key: "2", ctrlKey: true });
    expect(view.state.doc.toString()).toBe("Option text 2 beta gamma.");
    fireEvent.keyDown(view.contentDOM, { code: "Digit3", key: "£", altKey: true });
    expect(view.state.doc.toString()).toBe("Option text 3 beta gamma.");
  });

  test("Tab in the steering box still moves focus", async () => {
    const { view } = await setup();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await screen.findByText("Option text 3");
    fireEvent.keyDown(screen.getByLabelText("Steering prompt"), { key: "Tab", code: "Tab" });
    expect(view.state.doc.toString()).toBe(sample);
  });

  test("the Vim toggle switches the editor to vim keys and remembers it", async () => {
    const { view } = await setup();
    const pressX = () => fireEvent.keyDown(view.contentDOM, { key: "x", code: "KeyX" });
    view.dispatch({ selection: { anchor: 0 } });
    pressX();
    expect(view.state.doc.toString()).toBe(sample);

    fireEvent.click(screen.getByRole("button", { name: /Model settings/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Vim" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Vim" }).getAttribute("aria-pressed")).toBe("true"),
    );
    pressX();
    expect(view.state.doc.toString()).toBe(sample.slice(1));
    expect(localStorage.getItem("redraft:vim")).toBe("on");
  });
});
