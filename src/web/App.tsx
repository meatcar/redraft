import { FileUp, Keyboard, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Alternative } from "../shared/api";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { ContextPicker } from "@/components/ContextPicker";
import { Editor, type EditorHandle } from "@/components/Editor";
import { ModelPicker } from "@/components/ModelPicker";
import { SuggestionPanel } from "@/components/SuggestionPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePersistentString } from "@/hooks/usePersistentString";
import { useSuggestions } from "@/hooks/useSuggestions";
import { SUGGEST_SHORTCUT, isSuggestShortcut } from "@/lib/shortcuts";

const SAMPLE = `# Welcome to Redraft

Paste or open a markdown document, select any sentence or paragraph, and press ${SUGGEST_SHORTCUT}. Three alternatives appear on the right; click one (or press Alt+1, Alt+2, Alt+3) to swap it in.

Use the steering box at the bottom to tell the model what you are going for. Point the context folder at your notes so suggestions match your facts and voice.
`;

export function App() {
  const [document, setDocument] = usePersistentString("document", SAMPLE);
  const [steering, setSteering] = usePersistentString("steering", "");
  const [contextPath, setContextPath] = usePersistentString("contextPath", "");
  const [model, setModel] = usePersistentString("model", "");
  const [apiKey, setApiKey] = usePersistentString("apiKey", "");
  const [vim, setVim] = usePersistentString("vim", "off");
  const vimMode = vim === "on";
  const editor = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { state, suggest, clear } = useSuggestions({
    document,
    steering,
    contextPath: contextPath || undefined,
    model: model || undefined,
    apiKey,
  });

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isSuggestShortcut(event)) {
        event.preventDefault();
        suggestForSelection();
        return;
      }
      if (event.altKey && state.status === "done") {
        const alternative = state.result.alternatives[Number(event.key) - 1];
        if (alternative) {
          event.preventDefault();
          apply(alternative);
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setDocument(await file.text());
    clear();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
        <h1 className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="size-4 text-yellow-500" /> Redraft
        </h1>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <FileUp /> Open
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown,.mdx,.txt"
          className="hidden"
          onChange={(e) => void openFile(e.target.files?.[0])}
        />
        <ContextPicker value={contextPath} onChange={setContextPath} />
        <ApiKeyInput value={apiKey} onChange={setApiKey} />
        <ModelPicker apiKey={apiKey} value={model} onChange={setModel} />
        <Button
          size="sm"
          variant={vimMode ? "secondary" : "ghost"}
          aria-pressed={vimMode}
          onClick={() => setVim(vimMode ? "off" : "on")}
        >
          <Keyboard /> Vim
        </Button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[1fr_24rem]">
        <section className="min-h-0 overflow-hidden">
          <Editor ref={editor} value={document} onChange={setDocument} vimMode={vimMode} />
        </section>
        <aside className="min-h-0 border-l bg-muted/30" aria-label="Suggestions">
          <SuggestionPanel state={state} onApply={apply} onSuggest={suggestForSelection} />
        </aside>
      </main>

      <footer className="border-t bg-background p-3">
        <Textarea
          className="max-h-40 min-h-12 resize-none"
          placeholder={`Steer the suggestions: audience, tone, goal, constraints… (${SUGGEST_SHORTCUT} to refresh)`}
          aria-label="Steering prompt"
          value={steering}
          onChange={(e) => setSteering(e.target.value)}
        />
      </footer>
    </div>
  );
}
