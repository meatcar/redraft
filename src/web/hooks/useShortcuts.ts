import { useEffect } from "react";

import type { Alternative } from "@core/api";
import { isSuggestShortcut } from "@/lib/shortcuts";

type Handlers = {
  onSuggest: () => void;
  alternatives: Alternative[] | null;
  onApply: (alternative: Alternative) => void;
};

/** Ctrl+Space suggests; Alt+1..3 applies an offered alternative. Captures before the editor. */
export function useShortcuts({ onSuggest, alternatives, onApply }: Handlers) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const alternative = event.altKey ? alternatives?.[Number(event.key) - 1] : undefined;
      if (isSuggestShortcut(event)) onSuggest();
      else if (alternative) onApply(alternative);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });
}
