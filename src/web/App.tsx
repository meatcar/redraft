import { FileUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Alternative } from "@core/api";
import type { ContextIndex } from "@core/context";
import { ContextPicker } from "@/components/ContextPicker";
import { Editor, type EditorHandle } from "@/components/Editor";
import { useModelSettings } from "@/components/ModelSettings";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SuggestionPanel } from "@/components/SuggestionPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePersistentString } from "@/hooks/usePersistentString";
import { useSuggester, useSuggestions } from "@/hooks/useSuggestions";
import { useShortcuts } from "@/hooks/useShortcuts";
import { SUGGEST_SHORTCUT } from "@/lib/shortcuts";

const SAMPLE = `# Welcome to Redraft

Paste or open a markdown document, select any sentence or paragraph, and press ${SUGGEST_SHORTCUT}. On a phone, tap Suggest instead. Three alternatives appear in the suggestions panel; click one (or press Alt+1, Alt+2, Alt+3) to swap it in.

Use the steering box at the bottom to tell the model what you are going for. Pick a context folder of notes so suggestions match your facts and voice. Everything runs in your browser: text goes only to the model endpoint you set.
`;

export function App() {
  const [document, setDocument] = usePersistentString("document", SAMPLE);
  const [steering, setSteering] = usePersistentString("steering", "");
  const settings = useModelSettings();
  const [context, setContext] = useState<ContextIndex | null>(null);
  const [vim, setVim] = usePersistentString("vim", "off");
  const vimMode = vim === "on";
  const editor = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const suggester = useSuggester(settings.llm, settings.model, context);
  const { state, suggest, clear } = useSuggestions({ document, steering, suggester });

  const target = state.status === "idle" ? null : state.target;
  useEffect(() => {
    editor.current?.highlight(target && { from: target.from, to: target.to });
  }, [target]);

  const apply = (alternative: Alternative) => {
    if (!target) return;
    if (editor.current?.replace(target, alternative.text)) clear();
  };

  const suggestForSelection = () => {
    if (editor.current) suggest(editor.current.selection());
  };

  useShortcuts({
    onSuggest: suggestForSelection,
    alternatives: state.status === "done" ? state.result.alternatives : null,
    onApply: apply,
  });

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setDocument(await file.text());
    clear();
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2 md:gap-3 md:px-4">
        <h1 className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="size-4 text-yellow-500" />
          <span className="max-sm:sr-only">Redraft</span>
        </h1>
        <Button
          size="sm"
          variant="outline"
          aria-label="Open file"
          onClick={() => fileInput.current?.click()}
        >
          <FileUp /> <span className="max-sm:hidden">Open</span>
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown,.mdx,.txt"
          className="hidden"
          onChange={(e) => void openFile(e.target.files?.[0])}
        />
        <ContextPicker value={context} onChange={setContext} />
        <div className="ml-auto">
          <SettingsMenu
            settings={settings}
            vim={vimMode}
            onVimChange={(on) => setVim(on ? "on" : "off")}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[1fr_24rem]">
        <section className="min-h-0 flex-1 overflow-hidden">
          <Editor ref={editor} value={document} onChange={setDocument} vimMode={vimMode} />
        </section>
        <aside
          className="flex max-h-[55dvh] flex-col border-t bg-muted/30 md:max-h-none md:min-h-0 md:border-t-0 md:border-l"
          aria-label="Suggestions"
        >
          <SuggestionPanel
            state={state}
            onApply={apply}
            onSuggest={suggestForSelection}
            onDismiss={clear}
          />
        </aside>
      </main>

      <footer className="border-t bg-background p-2 md:p-3">
        <Textarea
          className="max-h-32 min-h-10 resize-none md:max-h-40 md:min-h-12"
          placeholder="Steer the suggestions: audience, tone, goal, constraints…"
          aria-label="Steering prompt"
          value={steering}
          onChange={(e) => setSteering(e.target.value)}
        />
      </footer>
    </div>
  );
}
