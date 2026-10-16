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

type Range = { from: number; to: number };

/** Fetches alternatives on demand; a newer request cancels the older one. */
export function useSuggestions(inputs: Inputs) {
  const [state, setState] = useState<SuggestionState>({ status: "idle" });
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const inflight = useRef<AbortController | null>(null);

  const run = useCallback((range: Range) => {
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

  useEffect(() => () => inflight.current?.abort(), []);

  /** Suggests for the selection; with nothing selected, refreshes the last target. */
  const suggest = useCallback(
    (selection: Range) => {
      if (selection.from !== selection.to) run(selection);
      else if (state.status !== "idle") run({ from: state.target.from, to: state.target.to });
    },
    [state, run],
  );

  const clear = useCallback(() => {
    inflight.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, suggest, clear };
}
