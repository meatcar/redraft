import { ChevronDown, Keyboard, PlugZap } from "lucide-react";

import { ModelSettings, type useModelSettings } from "@/components/ModelSettings";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  settings: ReturnType<typeof useModelSettings>;
  vim: boolean;
  onVimChange: (on: boolean) => void;
};

/** One header chip for the model connection; the fields open in a popover. */
export function SettingsMenu({ settings, vim, onVimChange }: Props) {
  const connected = settings.apiKey !== "";
  const model = settings.model || "choose a model";
  const summary = connected ? `${settings.provider} · ${model}` : "Connect a model";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant={connected ? "outline" : "default"}
            className="max-w-[55vw] md:max-w-md"
            aria-label={`Model settings: ${summary}`}
          />
        }
      >
        <PlugZap />
        <span className="truncate font-mono text-xs">
          {connected ? (
            <>
              <span className="max-sm:hidden">{settings.provider} · </span>
              {model}
            </>
          ) : (
            summary
          )}
        </span>
        <ChevronDown className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <ModelSettings settings={settings} />
        <p className="text-xs text-muted-foreground">
          Requests go straight from this browser to the endpoint. Keys stay in this browser.
        </p>
        <Button
          size="sm"
          variant={vim ? "secondary" : "ghost"}
          className="self-start"
          aria-pressed={vim}
          onClick={() => onVimChange(!vim)}
        >
          <Keyboard /> Vim
        </Button>
      </PopoverContent>
    </Popover>
  );
}
