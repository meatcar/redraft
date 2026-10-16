import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { z } from "zod";

import { deferred, json, stubFetch } from "../test/fetch";
import { useSuggestions } from "./useSuggestions";

const document = "alpha beta gamma delta";
const inputs = { document, steering: "", apiKey: "k" };

const reply = (label: string) =>
  json({
    alternatives: [1, 2, 3].map((n) => ({ text: `${label}${n}`, rationale: "" })),
    sources: [],
  });

const bodySchema = z.object({ selection: z.object({ from: z.number() }) });
const selectionOf = async (body: Promise<unknown>) => bodySchema.parse(await body).selection.from;

describe("useSuggestions", () => {
  test("requests alternatives for the selected text with the user's key", async () => {
    const requests = stubFetch(() => reply("x"));
    const { result } = renderHook(() => useSuggestions(inputs));
    await new Promise((r) => setTimeout(r, 20));
    expect(requests).toHaveLength(0);

    act(() => result.current.suggest({ from: 6, to: 10 }));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(requests).toHaveLength(1);
    expect(await selectionOf(requests[0]!.json())).toBe(6);
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer k");
    if (result.current.state.status === "done")
      expect(result.current.state.target.text).toBe("beta");
  });

  test("ignores a slow response for an abandoned selection", async () => {
    const first = deferred<Response>();
    stubFetch(async (request) =>
      (await selectionOf(request.json())) === 0 ? first.promise : reply("new"),
    );
    const { result } = renderHook(() => useSuggestions(inputs));
    act(() => result.current.suggest({ from: 0, to: 5 }));
    await waitFor(() => expect(result.current.state.status).toBe("loading"));

    act(() => result.current.suggest({ from: 11, to: 16 }));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await act(async () => first.resolve(reply("old")));

    const state = result.current.state;
    expect(state.status === "done" && state.result.alternatives[0]?.text).toBe("new1");
    expect(state.status === "done" && state.target.text).toBe("gamma");
  });

  test("surfaces the server's error message", async () => {
    stubFetch(() => json({ error: "No model endpoint configured." }, 503));
    const { result } = renderHook(() => useSuggestions(inputs));
    act(() => result.current.suggest({ from: 0, to: 5 }));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    expect(state.status === "error" && state.error).toBe("No model endpoint configured.");
  });

  test("skips whitespace-only selections", async () => {
    const requests = stubFetch(() => reply("x"));
    const { result } = renderHook(() => useSuggestions({ ...inputs, document: "  x" }));
    act(() => result.current.suggest({ from: 0, to: 1 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(requests).toHaveLength(0);
  });

  test("refreshes the last target when nothing is selected", async () => {
    let round = 0;
    const requests = stubFetch(() => reply(`r${++round}-`));
    const { result } = renderHook(() => useSuggestions(inputs));
    act(() => result.current.suggest({ from: 0, to: 0 }));
    expect(requests).toHaveLength(0);

    act(() => result.current.suggest({ from: 11, to: 16 }));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    act(() => result.current.suggest({ from: 3, to: 3 }));
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === "done" && state.result.alternatives[0]?.text).toBe("r2-1");
    });
    expect(await selectionOf(requests[1]!.json())).toBe(11);
  });
});
