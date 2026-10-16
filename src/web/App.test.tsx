import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EditorView } from "@codemirror/view";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { z } from "zod";

import { App } from "./App";
import { json, stubFetch } from "./test/fetch";

const bodySchema = z.object({ selection: z.unknown() });

const sample = "Alpha beta gamma.";

function setup() {
  const requests = stubFetch((request) =>
    new URL(request.url).pathname === "/api/suggest"
      ? json({
          alternatives: [1, 2, 3].map((n) => ({ text: `Option text ${n}`, rationale: "" })),
          sources: [],
        })
      : json({ defaultModel: null, models: [] }),
  );
  const { container } = render(<App />);
  const view = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-content")!)!;
  const suggestions = () => requests.filter((r) => r.url.endsWith("/api/suggest"));
  return { view, suggestions };
}

beforeEach(() => localStorage.setItem("redraft:document", sample));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("App", () => {
  test("selecting text alone requests nothing; Ctrl+Space does", async () => {
    const { view, suggestions } = setup();
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    await new Promise((r) => setTimeout(r, 30));
    expect(suggestions()).toHaveLength(0);

    fireEvent.keyDown(window, { code: "Space", key: " ", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("Option text 2")).toBeTruthy());
    expect(suggestions()).toHaveLength(1);
  });

  test("Cmd+Space refreshes the last suggestions after the selection is gone", async () => {
    const { view, suggestions } = setup();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", metaKey: true });
    await waitFor(() => expect(screen.getByText("Option text 1")).toBeTruthy());

    view.dispatch({ selection: { anchor: 12 } });
    fireEvent.keyDown(window, { code: "Space", key: " ", metaKey: true });
    await waitFor(() => expect(suggestions()).toHaveLength(2));
    expect(bodySchema.parse(await suggestions()[1]!.json()).selection).toEqual({
      from: 0,
      to: 5,
    });
  });
});
