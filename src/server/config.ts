import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LLM_BASE_URL: z.url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_STRUCTURED_OUTPUTS: flag.default(true),
  LLM_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(6),
  CONTEXT_ROOT: z.string().default(homedir()),
  CONTEXT_DIR: z.string().optional(),
  XDG_CACHE_HOME: z.string().default(join(homedir(), ".cache")),
  INDEX_PATH: z.string().optional(),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const blankAsUnset = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = envSchema.safeParse(blankAsUnset);
  if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  const { XDG_CACHE_HOME, INDEX_PATH, ...config } = parsed.data;
  return { ...config, INDEX_PATH: INDEX_PATH ?? join(XDG_CACHE_HOME, "redraft", "index.sqlite") };
}
