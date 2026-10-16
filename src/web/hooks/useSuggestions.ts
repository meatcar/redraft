import { useCallback, useEffect, useRef, useState } from "react";

import type { SuggestRequest, SuggestResponse } from "../../shared/api";
import { api } from "@/lib/api";

const MIN_SELECTION_CHARS = 2;

export type Target = { from: number; to: number; text: string };

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading"; target: Target }
  | { status: "done"; target: Target; result: SuggestResponse }
  | { status: "error"; target: Target; error: string };

type Inputs = Omit<SuggestRequest, "selection"> & { apiKey: string };

/** Fetches alternatives for each committed selection; newer selections cancel older requests. */
export function useSuggestions(selection: { from: number; to: number }, inputs: Inputs) {
  const [state, setState] = useState<SuggestionState>({ status: "idle" });
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const inflight = useRef<AbortController | null>(null);

  const run = useCallback((range: { from: number; to: number }) => {
    inflight.current?.abort();
    const { document } = inputsRef.current;
    const target = { ...range, text: document.slice(range.from, range.to) };
    if (target.text.trim().length < MIN_SELECTION_CHARS) return;

    const controller = new AbortController();
    inflight.current = controller;
    setState({ status: "loading", target });
    const { apiKey, ...request } = inputsRef.current;
    api
      .suggest({ ...request, selection: range }, apiKey, controller.signal)
      .then((result) => setState({ status: "done", target, result }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ status: "error", target, error: error.message });
      });
  }, []);

  const { from, to } = selection;
  useEffect(() => {
    if (from !== to) run({ from, to });
  }, [from, to, run]);

  useEffect(() => () => inflight.current?.abort(), []);

  const regenerate = useCallback(() => {
    if (state.status !== "idle") run(state.target);
  }, [state, run]);

  const clear = useCallback(() => {
    inflight.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, regenerate, clear };
}
