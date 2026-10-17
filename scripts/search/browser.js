export async function agentBrowser(session, flags, ...args) {
  const proc = Bun.spawn(
    ["agent-browser", "--session", session, "--headed", "false", "--args", flags, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code) throw new Error(`${args[0]}: ${out} ${err}`);
  return out;
}
