import { ChevronRight, Cpu, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { Llm } from "@core/llm";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersistentString } from "@/hooks/usePersistentString";
import { cn } from "@/lib/utils";

type Listing =
  | { kind: "loading" }
  | { kind: "ok"; models: string[] }
  | { kind: "error"; message: string };

type Props = { llm: Llm; value: string; onChange: (value: string) => void };

/** Lists the endpoint's models for the current endpoint and key, grouped by vendor prefix. */
export function ModelPicker({ llm, value, onChange }: Props) {
  const [listing, setListing] = useState<Listing>({ kind: "loading" });
  const [openGroups, toggleGroup] = useOpenGroups(vendorOf(value));

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
  const { ungrouped, groups } = groupByVendor(models);
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
        value={models.includes(value) ? value : null}
        onValueChange={(id) => id && onChange(id)}
        disabled={models.length === 0}
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 flex-1 font-mono text-xs"
          aria-label="Model"
          aria-invalid={listing.kind === "error"}
        >
          <SelectValue placeholder={placeholder}>
            {(id: string | null) => id ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80" alignItemWithTrigger={false}>
          {ungrouped.map((id) => (
            <ModelItem key={id} id={id} label={id} />
          ))}
          {groups.map(([vendor, ids]) => {
            const open = openGroups.has(vendor);
            return (
              <SelectGroup key={vendor} aria-label={vendor} className="p-0">
                <button
                  type="button"
                  aria-expanded={open}
                  className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 font-mono text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => toggleGroup(vendor)}
                >
                  <ChevronRight
                    className={cn("size-3 transition-transform", open && "rotate-90")}
                  />
                  {vendor}
                  <span className="ml-auto tabular-nums">{ids.length}</span>
                </button>
                {open &&
                  ids.map((id) => (
                    <ModelItem key={id} id={id} label={id.slice(vendor.length + 1)} inset />
                  ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function ModelItem({ id, label, inset }: { id: string; label: string; inset?: boolean }) {
  return (
    <SelectItem value={id} className={cn("font-mono text-xs", inset && "pl-6")}>
      {label}
    </SelectItem>
  );
}

const vendorOf = (id: string) => (id.includes("/") ? id.slice(0, id.indexOf("/")) : "");

function groupByVendor(models: string[]) {
  const groups = Map.groupBy(models, vendorOf);
  const ungrouped = groups.get("") ?? [];
  groups.delete("");
  return { ungrouped, groups: [...groups].toSorted(([a], [b]) => a.localeCompare(b)) };
}

/** Open vendor groups, remembered once the user toggles one; until then the current vendor's. */
function useOpenGroups(currentVendor: string) {
  const [stored, setStored] = usePersistentString("modelGroups", "");
  const open = new Set<string>(stored ? JSON.parse(stored) : [currentVendor]);
  const toggle = (vendor: string) => {
    if (!open.delete(vendor)) open.add(vendor);
    setStored(JSON.stringify([...open].filter(Boolean)));
  };
  return [open, toggle] as const;
}
