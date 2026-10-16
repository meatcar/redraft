import { useCallback, useEffect, useRef, useState } from "react";

import type { SuggestRequest, SuggestResponse } from "@core/api";
import type { ContextIndex } from "@core/context";
import { describeLlmError, type Llm } from "@core/llm";
import { suggest as runSuggestLoop } from "@core/suggest";

const MIN_SELECTION_CHARS = 2;

export type Target = { from: number; to: number; text: string };

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading"; target: Target }
  | { status: "done"; target: Target; result: SuggestResponse }
  | { status: "error"; target: Target; error: string };

export type Suggester = (request: SuggestRequest, signal: AbortSignal) => Promise<SuggestResponse>;

type Inputs = { document: string; steering: string; suggester: Suggester };

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
    const { suggester, steering } = inputsRef.current;
    suggester({ document, steering, selection: range }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ status: "done", target, result });
      })
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

/** Runs the suggest loop in the browser against the chosen model and context folder. */
export function useSuggester(llm: Llm, model: string, context: ContextIndex | null): Suggester {
  return useCallback<Suggester>(
    async (request, abortSignal) => {
      if (!model) throw new Error("Choose a model first.");
      try {
        await context?.sync();
        return await runSuggestLoop(request, {
          model: llm.model(model),
          context: context ?? undefined,
          abortSignal,
        });
      } catch (error) {
        throw new Error(describeLlmError(error), { cause: error });
      }
    },
    [llm, model, context],
  );
}
