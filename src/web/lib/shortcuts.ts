export const SUGGEST_SHORTCUT = "Ctrl+Space";

// NOTE: Ctrl on every platform; macOS reserves Cmd+Space for Spotlight.
export const isSuggestShortcut = (
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) => event.code === "Space" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
