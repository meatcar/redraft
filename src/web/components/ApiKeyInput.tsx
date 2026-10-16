import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

type Props = { value: string; onChange: (value: string) => void };

/** Commits on blur or Enter so model discovery runs once per key, not per keystroke. */
export function ApiKeyInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  const commit = () => draft.trim() !== value && onChange(draft.trim());

  return (
    <div className="flex items-center gap-2">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" />
      <Input
        type="password"
        autoComplete="off"
        className="h-8 w-44 font-mono text-xs"
        placeholder="API key"
        aria-label="API key"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}
