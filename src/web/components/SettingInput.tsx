import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  normalize?: (value: string) => string;
  className?: string;
};

/** Commits on blur or Enter so model discovery runs once per edit, not per keystroke. */
export function SettingInput({
  icon: Icon,
  label,
  value,
  onChange,
  secret,
  normalize = (text) => text.trim(),
  className,
}: Props) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const next = normalize(draft);
    setDraft(next);
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <Input
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        className={cn("h-8 flex-1 font-mono md:text-xs", className)}
        placeholder={label}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}
