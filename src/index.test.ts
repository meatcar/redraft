import { describe, expect, test } from "bun:test";

import { main } from "./index";

describe("main", () => {
  test("returns the Bun greeting", () => {
    expect(main()).toBe("Hello, Bun!");
  });
});
