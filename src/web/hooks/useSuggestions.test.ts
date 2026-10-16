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
    const { result } = renderHook(() => useSuggestions({ from: 6, to: 10 }, inputs));

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
    const { result, rerender } = renderHook((sel) => useSuggestions(sel, inputs), {
      initialProps: { from: 0, to: 5 },
    });
    await waitFor(() => expect(result.current.state.status).toBe("loading"));

    rerender({ from: 11, to: 16 });
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await act(async () => first.resolve(reply("old")));

    const state = result.current.state;
    expect(state.status === "done" && state.result.alternatives[0]?.text).toBe("new1");
    expect(state.status === "done" && state.target.text).toBe("gamma");
  });

  test("surfaces the server's error message", async () => {
    stubFetch(() => json({ error: "No model endpoint configured." }, 503));
    const { result } = renderHook(() => useSuggestions({ from: 0, to: 5 }, inputs));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    expect(state.status === "error" && state.error).toBe("No model endpoint configured.");
  });

  test("skips whitespace-only selections", async () => {
    const requests = stubFetch(() => reply("x"));
    renderHook(() => useSuggestions({ from: 0, to: 1 }, { ...inputs, document: "  x" }));
    await new Promise((r) => setTimeout(r, 40));
    expect(requests).toHaveLength(0);
  });
});
