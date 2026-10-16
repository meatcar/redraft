import { FolderSearch, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { ContextIndex } from "@core/context";
import { directorySource, snapshotSource, type FileSource } from "@core/files";
import { Button } from "@/components/ui/button";

type Props = { value: ContextIndex | null; onChange: (value: ContextIndex | null) => void };

type Status = { kind: "idle" } | { kind: "indexing" } | { kind: "error"; message: string };

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Picks a folder in the browser and indexes it in memory; nothing is uploaded. */
export function ContextPicker({ value, onChange }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fallbackInput = useRef<HTMLInputElement>(null);

  const open = async (source: FileSource) => {
    setStatus({ kind: "indexing" });
    try {
      onChange(await ContextIndex.open(source));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const pick = async () => {
    if (!window.showDirectoryPicker) {
      fallbackInput.current?.click();
      return;
    }
    try {
      await open(directorySource(await window.showDirectoryPicker({ id: "redraft-context" })));
    } catch (error) {
      if (!isAbort(error)) throw error;
    }
  };

  const summary = value?.status;

  return (
    <div className="flex min-w-fit items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void pick()}
        disabled={status.kind === "indexing"}
        title="Notes the model can search. Files stay in your browser."
      >
        {status.kind === "indexing" ? <Loader2 className="animate-spin" /> : <FolderSearch />}
        {summary ? summary.name : "Context folder"}
      </Button>
      <input
        ref={(input) => {
          if (input) input.webkitdirectory = true;
          fallbackInput.current = input;
        }}
        type="file"
        multiple
        hidden
        aria-label="Context folder files"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void open(snapshotSource(files));
        }}
      />
      <span
        className={`text-xs ${status.kind === "error" ? "truncate text-destructive" : "shrink-0 whitespace-nowrap text-muted-foreground"}`}
        title={status.kind === "error" ? status.message : undefined}
      >
        {status.kind === "indexing" && "Indexing…"}
        {status.kind === "idle" && summary && `${summary.files} files · ${summary.chunks} sections`}
        {status.kind === "error" && status.message}
      </span>
      {summary && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Forget context folder"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
