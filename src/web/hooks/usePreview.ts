import { useState, type RefObject } from "react";

import type { EditorHandle } from "@/components/Editor";
import type { SuggestionState } from "@/hooks/useSuggestions";

/** Swaps alternatives into the document in place; only an accepted one enters undo history. */
export function usePreview(
  editor: RefObject<EditorHandle | null>,
  state: SuggestionState,
  onAccepted: () => void,
) {
  const [shown, setShown] = useState<{ state: SuggestionState; index: number | null }>({
    state,
    index: null,
  });
  const index = shown.state === state ? shown.index : null;
  const target = state.status === "idle" ? null : state.target;
  const alternatives = state.status === "done" ? state.result.alternatives : [];

  const swapTo = (next: number | null) => {
    if (!target) return false;
    const current = index === null ? target.text : alternatives[index]!.text;
    const text = next === null ? target.text : alternatives[next]!.text;
    const range = { from: target.from, to: target.from + current.length, text: current };
    const swapped = editor.current?.preview(range, text) ?? false;
    setShown({ state, index: swapped ? next : null });
    return swapped;
  };

  return {
    index,
    available: alternatives.length > 0,
    show: (i: number) => i < alternatives.length && swapTo(i),
    cycle: (step: 1 | -1) => {
      const n = alternatives.length;
      if (n) swapTo(index === null ? (step > 0 ? 0 : n - 1) : (index + step + n) % n);
    },
    cancel: () => index !== null && swapTo(null),
    /** Restores the original silently, then applies the choice as one undoable change. */
    accept: (i = index) => {
      if (!target || i === null || !alternatives[i]) return;
      if (index !== null && !swapTo(null)) return;
      setShown({ state, index: null });
      if (editor.current?.replace(target, alternatives[i].text)) onAccepted();
    },
  };
}

export type Preview = ReturnType<typeof usePreview>;
