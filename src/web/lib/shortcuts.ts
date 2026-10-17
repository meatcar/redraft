export const SUGGEST_SHORTCUT = "Ctrl+Space";

type Keys = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

// NOTE: Ctrl on every platform; macOS reserves Cmd+Space for Spotlight.
export const isSuggestShortcut = (event: Keys) =>
  event.code === "Space" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

// NOTE: Chrome on Windows/Linux keeps Ctrl+digit for tab switching, so Alt+digit works too.
export const PREVIEW_MODIFIER = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "")
  ? "Ctrl"
  : "Alt";

/** Zero-based option for Ctrl/Alt+1..9; uses `code` because macOS Alt+digit types a symbol. */
export const previewDigit = (event: Keys) =>
  (event.ctrlKey || event.altKey) && !event.metaKey && /^Digit[1-9]$/.test(event.code)
    ? Number(event.code.slice(5)) - 1
    : null;
