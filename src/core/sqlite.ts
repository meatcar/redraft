import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm" with { type: "file" };

type Init = (options: { locateFile: () => string }) => ReturnType<typeof sqlite3InitModule>;

let sqlite: ReturnType<typeof sqlite3InitModule> | undefined;

/** Opens a private in-memory database; loads the wasm module once per page. */
export async function openMemoryDatabase(): Promise<Database> {
  // NOTE: the published types omit init options; locateFile points at the bundled wasm asset.
  sqlite ??= (sqlite3InitModule as Init)({ locateFile: () => wasmUrl });
  const { oo1 } = await sqlite;
  return new oo1.DB(":memory:", "c");
}
