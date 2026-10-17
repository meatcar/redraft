import { expect, test } from "bun:test";

import { cn } from "./utils";

test("cn preserves conditional classes and resolves directional and variant conflicts", () => {
  expect(
    cn(
      "px-2 py-1",
      ["hover:bg-red-500", false, { "md:px-4": true }],
      undefined,
      "px-6 hover:bg-blue-500",
    ),
  ).toBe("py-1 md:px-4 px-6 hover:bg-blue-500");
  expect(cn("p-2", "px-6")).toBe("p-2 px-6");
  expect(cn("px-6", "p-2")).toBe("p-2");
  expect(cn("[mask-type:luminance]", "[mask-type:alpha]")).toBe("[mask-type:alpha]");
});
