type Fields = Record<string, unknown>;

const quiet = process.env.NODE_ENV === "test";

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  if (quiet) return;
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
