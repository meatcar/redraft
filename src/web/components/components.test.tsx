import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import type { ContextIndex } from "@core/context";
import type { DirectoryEntry } from "@core/files";
import { createLlm } from "@core/llm";

import { json, stubFetch } from "../test/fetch";
import { ContextPicker } from "./ContextPicker";
import { ModelPicker } from "./ModelPicker";
import { SuggestionPanel } from "./SuggestionPanel";

afterEach(cleanup);

const target = { from: 0, to: 5, text: "Hello" };
const alternatives = ["Hi", "Hey", "Greetings"].map((text) => ({
  text,
  rationale: `${text} reason`,
}));

describe("SuggestionPanel", () => {
  test("applies the clicked alternative", () => {
    const onApply = mock();
    render(
      <SuggestionPanel
        state={{ status: "done", target, result: { alternatives, sources: ["notes/a.md"] } }}
        onApply={onApply}
        onSuggest={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Hey"));
    expect(onApply).toHaveBeenCalledWith(alternatives[1]);
    expect(screen.getByText("notes/a.md")).toBeTruthy();
  });

  test("shows errors as alerts", () => {
    render(
      <SuggestionPanel
        state={{ status: "error", target, error: "boom" }}
        onApply={() => {}}
        onSuggest={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("boom");
  });

  test("offers the suggest action with its shortcut before anything is requested", () => {
    const onSuggest = mock();
    render(<SuggestionPanel state={{ status: "idle" }} onApply={() => {}} onSuggest={onSuggest} />);
    fireEvent.click(screen.getByRole("button", { name: /Suggest\s*Ctrl\+Space/ }));
    expect(onSuggest).toHaveBeenCalledTimes(1);
  });
});

const notesFile = (path: string, text: string) =>
  Object.defineProperty(new File([text], path.split("/").at(-1)!), "webkitRelativePath", {
    value: path,
  });

function ControlledContextPicker() {
  const [value, setValue] = useState<ContextIndex | null>(null);
  return <ContextPicker value={value} onChange={setValue} />;
}

describe("ContextPicker", () => {
  afterEach(() => {
    delete window.showDirectoryPicker;
  });

  test("indexes the folder the browser picker returns", async () => {
    const file = {
      kind: "file" as const,
      name: "a.md",
      getFile: async () => new File(["# A\n\nalpha"], "a.md"),
    };
    const handle: DirectoryEntry = {
      kind: "directory",
      name: "notes",
      values: async function* () {
        yield file;
      },
    };
    window.showDirectoryPicker = async () => handle;
    render(<ControlledContextPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Context folder" }));
    await waitFor(() => expect(screen.getByText("1 files · 1 sections")).toBeTruthy());
    expect(screen.getByRole("button", { name: "notes" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Forget context folder" }));
    expect(screen.getByRole("button", { name: "Context folder" })).toBeTruthy();
  });

  test("stays quiet when the user cancels the picker", async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    render(<ControlledContextPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Context folder" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("button", { name: "Context folder" })).toBeTruthy();
    expect(screen.queryByText(/files ·/)).toBeNull();
  });

  test("falls back to a folder upload where the picker is missing", async () => {
    render(<ControlledContextPicker />);
    const input = screen.getByLabelText<HTMLInputElement>("Context folder files");
    expect(input.webkitdirectory).toBe(true);
    Object.defineProperty(input, "files", {
      value: [notesFile("vault/a.md", "# A\n\nalpha"), notesFile("vault/b.png", "x")],
    });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText("1 files · 1 sections")).toBeTruthy());
    expect(screen.getByRole("button", { name: "vault" })).toBeTruthy();
  });
});

const llm = (apiKey: string) => createLlm({ baseURL: "https://llm.test/v1", apiKey });

describe("ModelPicker", () => {
  test("lists the endpoint's models with the entered key", async () => {
    const requests = stubFetch(() => json({ data: [{ id: "small" }, { id: "big" }] }));
    render(<ModelPicker llm={llm("sk-1")} value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Choose a model")).toBeTruthy());
    expect(requests[0]?.url).toBe("https://llm.test/v1/models");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer sk-1");
  });

  test("keeps the user's choice when it is still offered", async () => {
    stubFetch(() => json({ data: [{ id: "big" }, { id: "small" }] }));
    const onChange = mock();
    render(<ModelPicker llm={llm("sk-1")} value="small" onChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText("Model").textContent).toContain("small"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("explains a rejected key", async () => {
    stubFetch(() => json({ error: "nope" }, 401));
    render(<ModelPicker llm={llm("bad")} value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Models unavailable")).toBeTruthy());
    expect(screen.getByTitle(/rejected the API key/)).toBeTruthy();
  });
});
