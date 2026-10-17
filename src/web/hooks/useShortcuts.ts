import { useEffect } from "react";

import type { Preview } from "@/hooks/usePreview";
import { isSuggestShortcut, previewDigit } from "@/lib/shortcuts";

type Handlers = { onSuggest: () => void; preview: Preview };

const inFormControl = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("input, textarea, select, button, [role=listbox], [role=dialog]") !== null;

const hasModifier = (event: KeyboardEvent) => event.ctrlKey || event.altKey || event.metaKey;

const previewKeys = (
  preview: Preview,
  backwards: boolean,
): Partial<Record<string, () => void>> => ({
  Tab: () => preview.cycle(backwards ? -1 : 1),
  ...(preview.index !== null && { Enter: () => preview.accept(), Escape: preview.cancel }),
});

/** Ctrl/Alt+digit or Tab/Shift+Tab previews in place, Enter accepts, Escape restores. */
function previewAction(event: KeyboardEvent, preview: Preview) {
  const digit = previewDigit(event);
  if (digit !== null) return () => preview.show(digit);
  return hasModifier(event) ? undefined : previewKeys(preview, event.shiftKey)[event.key];
}

/** Ctrl+Space suggests; preview keys apply while alternatives are shown. Captures before the editor. */
export function useShortcuts({ onSuggest, preview }: Handlers) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const canPreview = preview.available && !inFormControl(event.target);
      const action = isSuggestShortcut(event)
        ? onSuggest
        : canPreview
          ? previewAction(event, preview)
          : undefined;
      if (!action) return;
      action();
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });
}
