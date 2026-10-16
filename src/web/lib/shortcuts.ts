export const SUGGEST_SHORTCUT = "Ctrl+Space";

// NOTE: macOS reserves Cmd+Space for Spotlight; accept it anyway for remapped setups.
export const isSuggestShortcut = (
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) => event.code === "Space" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
