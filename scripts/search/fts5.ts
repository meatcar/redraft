import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm" with { type: "file" };

import { ftsMatch, type Engine } from "./terms";

type Init = (options: { locateFile: () => string }) => ReturnType<typeof sqlite3InitModule>;

export async function makeEngine(): Promise<Engine> {
  const sqlite = await (sqlite3InitModule as Init)({ locateFile: () => wasmUrl });
  const db = new sqlite.oo1.DB(":memory:", "c");
  db.exec(
    "CREATE VIRTUAL TABLE chunks USING fts5(heading, body, path, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
  );
  const add = db.prepare("INSERT INTO chunks(rowid,heading,body,path) VALUES(?,?,?,?)");
  const remove = db.prepare("DELETE FROM chunks WHERE rowid=?");
  return {
    add: (doc) => {
      add.bind([doc.id, doc.heading, doc.body, doc.path]).stepReset();
    },
    remove: (id) => {
      remove.bind([id]).stepReset();
    },
    search: (query, limit) => {
      const match = ftsMatch(query);
      if (!match) return [];
      return db
        .selectObjects(
          "SELECT rowid AS id, -bm25(chunks,2,1,1.5) AS score FROM chunks WHERE chunks MATCH ? ORDER BY score DESC LIMIT ?",
          [match, limit],
        )
        .map((row) => ({ id: Number(row.id), score: Number(row.score) }));
    },
    transaction: (work) => {
      db.transaction(work);
    },
    wasmBytes: () => sqlite.wasm.heap8u().byteLength,
  };
}
