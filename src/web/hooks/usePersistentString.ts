import { useEffect, useState } from "react";

export function usePersistentString(key: string, initial: string) {
  const storageKey = `redraft:${key}`;
  const [value, setValue] = useState(() => localStorage.getItem(storageKey) ?? initial);
  useEffect(() => {
    localStorage.setItem(storageKey, value);
  }, [storageKey, value]);
  return [value, setValue] as const;
}
