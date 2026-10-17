import { initSqlJs } from "fts5-sql-bundle";
import wasmUrl from "fts5-sql-bundle/dist/sql-wasm.wasm" with { type: "file" };

import { ftsMatch, type Engine } from "./terms";

export async function makeEngine(): Promise<Engine> {
  const sql = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new sql.Database();
  db.run(
    "CREATE VIRTUAL TABLE chunks USING fts5(heading, body, path, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
  );
  const add = db.prepare("INSERT INTO chunks(rowid,heading,body,path) VALUES(?,?,?,?)");
  const remove = db.prepare("DELETE FROM chunks WHERE rowid=?");
  const search = db.prepare(
    "SELECT rowid AS id, -bm25(chunks,2,1,1.5) AS score FROM chunks WHERE chunks MATCH ? ORDER BY score DESC LIMIT ?",
  );
  return {
    add: (doc) => {
      add.run([doc.id, doc.heading, doc.body, doc.path]);
    },
    remove: (id) => {
      remove.run([id]);
    },
    search: (query, limit) => {
      const match = ftsMatch(query);
      if (!match) return [];
      search.bind([match, limit]);
      const hits = [];
      while (search.step()) {
        const [id, score] = search.get();
        hits.push({ id: Number(id), score: Number(score) });
      }
      search.reset();
      return hits;
    },
    transaction: (work) => {
      db.run("BEGIN");
      work();
      db.run("COMMIT");
    },
    wasmBytes: () => {
      if ("HEAP8" in sql && sql.HEAP8 instanceof Int8Array) return sql.HEAP8.byteLength;
      throw new Error("SQL.js did not expose its wasm heap");
    },
  };
}
