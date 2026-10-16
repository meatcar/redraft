import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { SuggestRequest, SuggestResponse } from "@core/api";
import { deferred } from "../test/fetch";
import { useSuggestions, type Suggester } from "./useSuggestions";

const document = "alpha beta gamma delta";

const reply = (label: string): SuggestResponse => ({
  alternatives: [1, 2, 3].map((n) => ({ text: `${label}${n}`, rationale: "" })),
  sources: [],
});

/** Records each request; answers through the given handler. */
function suggester(answer: (request: SuggestRequest) => Promise<SuggestResponse>) {
  const requests: SuggestRequest[] = [];
  const run: Suggester = (request) => {
    requests.push(request);
    return answer(request);
  };
  return { run, requests };
}

const render = (run: Suggester, doc = document) =>
  renderHook(() => useSuggestions({ document: doc, steering: "warmer", suggester: run })).result;

describe("useSuggestions", () => {
  test("requests alternatives for the selected text, only when asked", async () => {
    const { run, requests } = suggester(async () => reply("x"));
    const result = render(run);
    await new Promise((r) => setTimeout(r, 20));
    expect(requests).toHaveLength(0);

    act(() => result.current.suggest({ from: 6, to: 10 }));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(requests).toEqual([{ document, steering: "warmer", selection: { from: 6, to: 10 } }]);
    const state = result.current.state;
    expect(state.status === "done" && state.target.text).toBe("beta");
  });

  test("ignores a slow response for an abandoned selection", async () => {
    const first = deferred<SuggestResponse>();
    const { run } = suggester(async (request) =>
      request.selection.from === 0 ? first.promise : reply("new"),
    );
    const result = render(run);
    act(() => result.current.suggest({ from: 0, to: 5 }));
    await waitFor(() => expect(result.current.state.status).toBe("loading"));

    act(() => result.current.suggest({ from: 11, to: 16 }));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await act(async () => first.resolve(reply("old")));

    const state = result.current.state;
    expect(state.status === "done" && state.result.alternatives[0]?.text).toBe("new1");
    expect(state.status === "done" && state.target.text).toBe("gamma");
  });

  test("surfaces the error message", async () => {
    const { run } = suggester(async () => {
      throw new Error("Choose a model first.");
    });
    const result = render(run);
    act(() => result.current.suggest({ from: 0, to: 5 }));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    expect(state.status === "error" && state.error).toBe("Choose a model first.");
  });

  test("skips whitespace-only selections", async () => {
    const { run, requests } = suggester(async () => reply("x"));
    const result = render(run, "  x");
    act(() => result.current.suggest({ from: 0, to: 1 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(requests).toHaveLength(0);
  });

  test("refreshes the last target when nothing is selected", async () => {
    let round = 0;
    const { run, requests } = suggester(async () => reply(`r${++round}-`));
    const result = render(run);
    act(() => result.current.suggest({ from: 0, to: 0 }));
    expect(requests).toHaveLength(0);

    act(() => result.current.suggest({ from: 11, to: 16 }));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    act(() => result.current.suggest({ from: 3, to: 3 }));
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === "done" && state.result.alternatives[0]?.text).toBe("r2-1");
    });
    expect(requests[1]?.selection).toEqual({ from: 11, to: 16 });
  });
});
