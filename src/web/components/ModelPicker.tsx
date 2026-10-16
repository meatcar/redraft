import { Cpu } from "lucide-react";
import { useEffect, useState } from "react";

import type { ModelsResponse } from "../../shared/api";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Props = { value: string; onChange: (value: string) => void };

export function ModelPicker({ value, onChange }: Props) {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.models().then(setModels, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex items-center gap-2" title={error ?? undefined}>
      <Cpu className={`size-4 shrink-0 ${error ? "text-destructive" : "text-muted-foreground"}`} />
      <Input
        className="h-8 w-56 font-mono text-xs"
        list="redraft-models"
        aria-label="Model"
        aria-invalid={Boolean(error)}
        placeholder={error ? "No model endpoint" : (models?.defaultModel ?? "Model id")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="redraft-models">
        {models?.models.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </div>
  );
}
