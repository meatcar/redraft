import { describe, expect, test } from "bun:test";

import { normalizeEndpoint } from "./llm";

describe("normalizeEndpoint", () => {
  test.each([
    ["llm.test", "https://llm.test/v1"],
    ["llm.test/", "https://llm.test/v1"],
    ["localhost:11434", "http://localhost:11434/v1"],
    ["127.0.0.1:4999", "http://127.0.0.1:4999/v1"],
    ["http://llm.test", "http://llm.test/v1"],
    ["https://llm.test/v1/", "https://llm.test/v1"],
    ["https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1"],
    ["llm.test/openai", "https://llm.test/openai"],
    ["  HTTPS://LLM.test  ", "https://llm.test/v1"],
  ])("%p becomes %p", (input, expected) => {
    expect(normalizeEndpoint(input)).toBe(expected);
  });

  test("leaves text that is not a URL for the user to fix", () => {
    expect(normalizeEndpoint("not a url")).toBe("not a url");
  });
});
