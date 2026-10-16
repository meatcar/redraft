import { FileText, Loader2, RefreshCw, Sparkles, TextSelect } from "lucide-react";

import type { Alternative } from "@core/api";
import { Button } from "@/components/ui/button";
import type { SuggestionState } from "@/hooks/useSuggestions";
import { SUGGEST_SHORTCUT } from "@/lib/shortcuts";

type Props = {
  state: SuggestionState;
  onApply: (alternative: Alternative) => void;
  onSuggest: () => void;
};

const shortcutHint = (
  <kbd className="rounded border px-1.5 font-mono text-xs text-muted-foreground">
    {SUGGEST_SHORTCUT}
  </kbd>
);

export function SuggestionPanel({ state, onApply, onSuggest }: Props) {
  if (state.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        <TextSelect className="size-8 opacity-50" />
        <p>Select text in the document, then ask for three alternatives.</p>
        <Button variant="outline" onClick={onSuggest}>
          <Sparkles /> Suggest {shortcutHint}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b p-4">
        <blockquote className="line-clamp-3 border-l-2 border-yellow-400 pl-3 text-sm text-muted-foreground italic">
          {state.target.text}
        </blockquote>
        <Button
          size="sm"
          variant="ghost"
          className="self-end"
          onClick={onSuggest}
          disabled={state.status === "loading"}
          title="Suggest for the selection, or refresh these"
        >
          <RefreshCw /> Refresh {shortcutHint}
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {state.status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Drafting alternatives…
          </div>
        )}
        {state.status === "error" && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {state.error}
          </p>
        )}
        {state.status === "done" &&
          state.result.alternatives.map((alternative, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApply(alternative)}
              className="group block w-full rounded-lg border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Option {i + 1}</span>
                <kbd className="rounded border px-1.5 font-mono opacity-60 group-hover:opacity-100">
                  Alt+{i + 1}
                </kbd>
              </div>
              <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                {alternative.text.trim()}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{alternative.rationale}</p>
            </button>
          ))}
      </div>

      {state.status === "done" && state.result.sources.length > 0 && (
        <details className="border-t p-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Context consulted ({state.result.sources.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {state.result.sources.map((source) => (
              <li key={source} className="flex items-center gap-1.5 font-mono">
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{source}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
