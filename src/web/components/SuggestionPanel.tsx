import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  TextSelect,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import type { PreviewControls } from "@/hooks/usePreview";
import type { SuggestionState } from "@/hooks/useSuggestions";
import { PREVIEW_MODIFIER, SUGGEST_SHORTCUT } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type Props = {
  state: SuggestionState;
  preview: PreviewControls;
  onSuggest: () => void;
  onDismiss: () => void;
};

// NOTE: no keyboard on touch screens; hide shortcut hints there.
const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border px-1.5 font-mono text-xs text-muted-foreground pointer-coarse:hidden">
    {children}
  </kbd>
);
const shortcutHint = <Kbd>{SUGGEST_SHORTCUT}</Kbd>;

// NOTE: keeps focus in the editor so keyboard shortcuts carry on after a click.
const keepFocus = (event: MouseEvent) => event.preventDefault();

type KeyButtonProps = ComponentProps<typeof Button> & {
  icon: LucideIcon;
  label: string;
  keys: string;
};

/** A button paired with its keyboard shortcut. */
function KeyButton({ icon: Icon, label, keys, ...props }: KeyButtonProps) {
  return (
    <Button size="sm" variant="ghost" onMouseDown={keepFocus} {...props}>
      <Icon /> {label} <Kbd>{keys}</Kbd>
    </Button>
  );
}

export function SuggestionPanel({ state, preview, onSuggest, onDismiss }: Props) {
  if (state.status === "idle") {
    return (
      <div className="flex items-center justify-between gap-3 p-3 text-sm text-muted-foreground md:h-full md:flex-col md:justify-center md:p-8 md:text-center">
        <TextSelect className="size-8 opacity-50 max-md:hidden" />
        <p>Select text in the document, then ask for three alternatives.</p>
        <Button variant="outline" onMouseDown={keepFocus} onClick={onSuggest}>
          <Sparkles /> Suggest {shortcutHint}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-3 md:p-4">
        <blockquote className="line-clamp-2 border-l-2 md:line-clamp-3 border-yellow-400 pl-3 text-sm text-muted-foreground italic">
          {state.target.text}
        </blockquote>
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onMouseDown={keepFocus}
            onClick={onSuggest}
            disabled={state.status === "loading"}
            title="Suggest for the selection, or refresh these"
          >
            <RefreshCw /> Refresh {shortcutHint}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss suggestions">
            <X />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 md:p-4" aria-live="polite">
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
            <div
              key={i}
              aria-current={preview.index === i || undefined}
              className={cn(
                "rounded-lg border bg-card shadow-xs transition hover:border-primary/50 hover:shadow-md",
                preview.index === i && "border-yellow-400 ring-2 ring-yellow-400/40",
              )}
            >
              <div className="flex items-center justify-between px-3 pt-2 text-xs text-muted-foreground md:px-4">
                <span className="font-medium">
                  Option {i + 1}
                  {preview.index === i && " · previewing"}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Preview option ${i + 1} (${PREVIEW_MODIFIER}+${i + 1})`}
                  title="Preview in the document"
                  onMouseDown={keepFocus}
                  onClick={() => preview.show(i)}
                >
                  <Eye /> <Kbd>{`${PREVIEW_MODIFIER}+${i + 1}`}</Kbd>
                </Button>
              </div>
              <button
                type="button"
                onClick={() => preview.accept(i)}
                className="block w-full rounded-b-lg px-3 pt-1 pb-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:px-4 md:pb-4"
              >
                <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                  {alternative.text.trim()}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{alternative.rationale}</p>
              </button>
            </div>
          ))}
      </div>

      {state.status === "done" && (
        <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1.5 md:px-3">
          <KeyButton
            icon={ChevronLeft}
            label="Previous"
            keys="⇧Tab"
            onClick={() => preview.cycle(-1)}
          />
          <KeyButton icon={ChevronRight} label="Next" keys="Tab" onClick={() => preview.cycle(1)} />
          <div className="ml-auto flex gap-1">
            <KeyButton
              icon={Undo2}
              label="Restore"
              keys="Esc"
              disabled={preview.index === null}
              onClick={preview.cancel}
            />
            <KeyButton
              icon={Check}
              label="Keep"
              keys="Enter"
              variant="default"
              disabled={preview.index === null}
              onClick={() => preview.accept()}
            />
          </div>
        </div>
      )}

      {state.status === "done" && state.result.sources.length > 0 && (
        <details className="border-t p-3 text-xs md:p-4 text-muted-foreground">
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
