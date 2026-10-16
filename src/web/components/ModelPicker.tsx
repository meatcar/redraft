import { Cpu, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { Llm } from "@core/llm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Listing =
  | { kind: "loading" }
  | { kind: "ok"; models: string[] }
  | { kind: "error"; message: string };

type Props = { llm: Llm; value: string; onChange: (value: string) => void };

/** Lists the endpoint's models for the current endpoint and key. */
export function ModelPicker({ llm, value, onChange }: Props) {
  const [listing, setListing] = useState<Listing>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setListing({ kind: "loading" });
    llm.listModels(controller.signal).then(
      (models) => setListing({ kind: "ok", models }),
      (error: Error) => {
        if (!controller.signal.aborted) setListing({ kind: "error", message: error.message });
      },
    );
    return () => controller.abort();
  }, [llm]);

  const models = listing.kind === "ok" ? listing.models : [];
  const placeholder = {
    loading: "Loading models…",
    ok: models.length ? "Choose a model" : "No models available",
    error: "Models unavailable",
  }[listing.kind];

  return (
    <div
      className="flex items-center gap-2"
      title={listing.kind === "error" ? listing.message : undefined}
    >
      {listing.kind === "loading" ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Cpu
          className={`size-4 shrink-0 ${listing.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
        />
      )}
      <Select
        value={models.includes(value) ? value : ""}
        onValueChange={onChange}
        disabled={models.length === 0}
      >
        <SelectTrigger
          size="sm"
          className="w-64 font-mono text-xs"
          aria-label="Model"
          aria-invalid={listing.kind === "error"}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {models.map((id) => (
            <SelectItem key={id} value={id} className="font-mono text-xs">
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
