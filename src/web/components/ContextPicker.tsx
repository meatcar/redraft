import { FolderSearch } from "lucide-react";
import { useEffect, useState } from "react";

import type { ContextStatus } from "../../shared/api";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Status =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ok"; value: ContextStatus }
  | { kind: "error"; message: string };

type Props = { value: string; onChange: (value: string) => void };

export function ContextPicker({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<Status>({ kind: "none" });

  useEffect(() => {
    let live = true;
    if (value.trim()) {
      setStatus({ kind: "loading" });
      api
        .context(value)
        .then((result) => live && setStatus({ kind: "ok", value: result }))
        .catch((error: Error) => live && setStatus({ kind: "error", message: error.message }));
    } else {
      setStatus({ kind: "none" });
    }
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div className="flex min-w-fit flex-1 items-center gap-2">
      <FolderSearch className="size-4 shrink-0 text-muted-foreground" />
      <Input
        className="h-8 max-w-sm min-w-24 font-mono text-xs"
        placeholder="Context folder, e.g. ~/notes"
        aria-label="Context folder"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft)}
        onKeyDown={(e) => e.key === "Enter" && onChange(draft)}
        aria-invalid={status.kind === "error"}
      />
      <span
        className={`text-xs ${status.kind === "error" ? "truncate text-destructive" : "shrink-0 whitespace-nowrap text-muted-foreground"}`}
        title={status.kind === "error" ? status.message : undefined}
      >
        {status.kind === "loading" && "Indexing…"}
        {status.kind === "ok" && `${status.value.files} files · ${status.value.chunks} sections`}
        {status.kind === "error" && status.message}
      </span>
    </div>
  );
}
