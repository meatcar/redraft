import { markdown } from "@codemirror/lang-markdown";
import { Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import CodeMirror from "@uiw/react-codemirror";
import { useImperativeHandle, useRef, type Ref } from "react";

import type { Target } from "@/hooks/useSuggestions";

const setTarget = StateEffect.define<{ from: number; to: number } | null>();
const targetMark = Decoration.mark({ class: "cm-redraft-target" });

const targetField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setTarget)) continue;
      next = effect.value
        ? Decoration.set([targetMark.range(effect.value.from, effect.value.to)])
        : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px" },
  ".cm-scroller": {
    fontFamily: "ui-serif, Georgia, serif",
    lineHeight: "1.7",
    padding: "1.5rem 2rem",
  },
  // NOTE: CodeMirror paints full-line selection across this padding; keep it small.
  ".cm-content": { maxWidth: "calc(42rem + 0.5em)", margin: "0 auto", padding: "0 0.25em" },
  ".cm-redraft-target": { backgroundColor: "rgb(250 204 21 / 0.35)", borderRadius: "2px" },
  "&.cm-focused": { outline: "none" },
});

const baseExtensions = [markdown(), EditorView.lineWrapping, targetField, theme];
// NOTE: vim keymaps must outrank basicSetup's, which the wrapper installs first.
const vimExtensions = [Prec.highest(vim({ status: true })), ...baseExtensions];

export type EditorHandle = {
  /** Replaces the target if the document still holds its original text. */
  replace: (target: Target, text: string) => boolean;
  highlight: (range: { from: number; to: number } | null) => void;
  selection: () => { from: number; to: number };
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  vimMode?: boolean;
  ref?: Ref<EditorHandle>;
};

export function Editor({ value, onChange, vimMode = false, ref }: Props) {
  const view = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    replace(target, text) {
      const current = view.current;
      if (!current || current.state.sliceDoc(target.from, target.to) !== target.text) return false;
      const end = target.from + text.length;
      current.dispatch({
        changes: { from: target.from, to: target.to, insert: text },
        selection: { anchor: end },
        effects: setTarget.of(null),
      });
      current.focus();
      return true;
    },
    highlight(range) {
      view.current?.dispatch({ effects: setTarget.of(range) });
    },
    selection() {
      const { from, to } = view.current?.state.selection.main ?? { from: 0, to: 0 };
      return { from, to };
    },
  }));

  return (
    <CodeMirror
      className="h-full"
      value={value}
      height="100%"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        // NOTE: autocompletion binds Ctrl+Space, the suggest shortcut.
        autocompletion: false,
      }}
      extensions={vimMode ? vimExtensions : baseExtensions}
      onChange={onChange}
      onCreateEditor={(created) => {
        view.current = created;
      }}
      aria-label="Document"
    />
  );
}
