import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";

import { usePersistentString } from "./usePersistentString";

afterEach(() => localStorage.clear());

describe("usePersistentString", () => {
  test("follows a changed key instead of carrying the old value over", () => {
    localStorage.setItem("redraft:apiKey:b", "key-b");
    const { result, rerender } = renderHook(({ key }) => usePersistentString(key, ""), {
      initialProps: { key: "apiKey:a" },
    });
    act(() => result.current[1]("key-a"));

    rerender({ key: "apiKey:b" });
    expect(result.current[0]).toBe("key-b");
    rerender({ key: "apiKey:a" });
    expect(result.current[0]).toBe("key-a");
    expect(localStorage.getItem("redraft:apiKey:b")).toBe("key-b");
  });
});
