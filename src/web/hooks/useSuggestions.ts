import { useCallback, useEffect, useRef, useState } from "react";

import type { SuggestRequest, SuggestResponse } from "../../shared/api";
import { api } from "@/lib/api";

const DEBOUNCE_MS = 600;
const MIN_SELECTION_CHARS = 2;

export type Target = { from: number; to: number; text: string };

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading"; target: Target }
  | { status: "done"; target: Target; result: SuggestResponse }
  | { status: "error"; target: Target; error: string };

type Inputs = Omit<SuggestRequest, "selection">;

/** Fetches alternatives for the current selection after it settles; newer selections cancel older requests. */
export function useSuggestions(
  selection: { from: number; to: number },
  inputs: Inputs,
  { debounceMs = DEBOUNCE_MS } = {},
) {
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
    api
      .suggest({ ...inputsRef.current, selection: range }, controller.signal)
      .then((result) => setState({ status: "done", target, result }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ status: "error", target, error: error.message });
      });
  }, []);

  const { from, to } = selection;
  useEffect(() => {
    const timer = from === to ? undefined : setTimeout(() => run({ from, to }), debounceMs);
    return () => clearTimeout(timer);
  }, [from, to, run, debounceMs]);

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
