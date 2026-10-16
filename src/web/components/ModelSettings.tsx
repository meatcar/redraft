import { Globe, KeyRound } from "lucide-react";
import { useMemo } from "react";

import { createLlm } from "@core/llm";
import { ModelPicker } from "@/components/ModelPicker";
import { SettingInput } from "@/components/SettingInput";
import { usePersistentString } from "@/hooks/usePersistentString";

const DEFAULT_ENDPOINT = "https://cpa.pvlv.ca/v1";

/** Endpoint, key, and model, remembered in this browser only. */
export function useModelSettings() {
  const [endpoint, setEndpoint] = usePersistentString("endpoint", DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = usePersistentString("apiKey", "");
  const [model, setModel] = usePersistentString("model", "");
  const llm = useMemo(() => createLlm({ baseURL: endpoint, apiKey }), [endpoint, apiKey]);
  return { endpoint, setEndpoint, apiKey, setApiKey, model, setModel, llm };
}

type Props = { settings: ReturnType<typeof useModelSettings> };

export function ModelSettings({ settings }: Props) {
  return (
    <>
      <SettingInput
        icon={Globe}
        label="Model endpoint"
        value={settings.endpoint}
        onChange={(value) => settings.setEndpoint(value || DEFAULT_ENDPOINT)}
        className="w-52"
      />
      <SettingInput
        icon={KeyRound}
        label="API key"
        secret
        value={settings.apiKey}
        onChange={settings.setApiKey}
        className="w-44"
      />
      <ModelPicker llm={settings.llm} value={settings.model} onChange={settings.setModel} />
    </>
  );
}
