import { Globe, KeyRound, Server } from "lucide-react";
import { useMemo, useState } from "react";

import { createLlm } from "@core/llm";
import { ModelPicker } from "@/components/ModelPicker";
import { SettingInput } from "@/components/SettingInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersistentString } from "@/hooks/usePersistentString";

const PRESETS = [
  { name: "OpenAI", url: "https://api.openai.com/v1" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
] as const;
const DEFAULT_ENDPOINT = PRESETS[1].url;
const CUSTOM = "Custom";

/** Endpoint, plus a key and model per endpoint, remembered in this browser only. */
export function useModelSettings() {
  const [endpoint, setEndpoint] = usePersistentString("endpoint", DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = usePersistentString(`apiKey:${endpoint}`, "");
  const [model, setModel] = usePersistentString(`model:${endpoint}`, "");
  const llm = useMemo(() => createLlm({ baseURL: endpoint, apiKey }), [endpoint, apiKey]);
  return { endpoint, setEndpoint, apiKey, setApiKey, model, setModel, llm };
}

type Props = { settings: ReturnType<typeof useModelSettings> };

export function ModelSettings({ settings }: Props) {
  const preset = PRESETS.find((p) => p.url === settings.endpoint)?.name;
  const [editingCustom, setEditingCustom] = useState(false);
  const provider = editingCustom || !preset ? CUSTOM : preset;

  const choose = (name: string) => {
    setEditingCustom(name === CUSTOM);
    const url = PRESETS.find((p) => p.name === name)?.url;
    if (url) settings.setEndpoint(url);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Server className="size-4 shrink-0 text-muted-foreground" />
        <Select value={provider} onValueChange={choose}>
          <SelectTrigger size="sm" className="w-32 text-xs" aria-label="Provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...PRESETS.map((p) => p.name), CUSTOM].map((name) => (
              <SelectItem key={name} value={name} className="text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {provider === CUSTOM && (
        <SettingInput
          icon={Globe}
          label="Model endpoint"
          value={settings.endpoint}
          onChange={(value) => settings.setEndpoint(value || DEFAULT_ENDPOINT)}
          className="w-44"
        />
      )}
      <SettingInput
        key={settings.endpoint}
        icon={KeyRound}
        label="API key"
        secret
        value={settings.apiKey}
        onChange={settings.setApiKey}
        className="w-36"
      />
      <ModelPicker llm={settings.llm} value={settings.model} onChange={settings.setModel} />
    </>
  );
}
