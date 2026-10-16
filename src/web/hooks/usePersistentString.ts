import { useCallback, useState } from "react";

/** A string in localStorage under `redraft:<key>`; a new key reads its own stored value. */
export function usePersistentString(key: string, initial: string) {
  const storageKey = `redraft:${key}`;
  const [state, setState] = useState(() => ({
    storageKey,
    value: localStorage.getItem(storageKey) ?? initial,
  }));
  const value =
    state.storageKey === storageKey ? state.value : (localStorage.getItem(storageKey) ?? initial);

  const setValue = useCallback(
    (next: string) => {
      localStorage.setItem(storageKey, next);
      setState({ storageKey, value: next });
    },
    [storageKey],
  );
  return [value, setValue] as const;
}
