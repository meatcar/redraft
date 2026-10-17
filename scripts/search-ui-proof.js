import { strict as assert } from "node:assert";

import { agentBrowser } from "./search/browser";

// NOTE: folder mutations and browser phases must run in sequence.
/* oxlint-disable no-await-in-loop */
const variant = Bun.argv[2];
const flags =
  "--js-flags=--expose-gc,--enable-precise-memory-info,--disable-features=BackForwardCache";
const run = agentBrowser.bind(null, "search-ui-proof", flags);
const evaluate = async (code) => {
  const result = JSON.parse(await run("eval", code, "--json"));
  if (!result.success) throw Error(JSON.stringify(result));
  return result.data.result;
};
await run("open", "http://localhost:3002/seed");
await run("set", "viewport", "1280", "720", "2");
const seed = await evaluate(`(async()=>{
  localStorage.clear();
  localStorage.setItem('redraft:endpoint','http://localhost:3002');
  localStorage.setItem('redraft:apiKey:http://localhost:3002','proof-not-a-secret');
  localStorage.setItem('redraft:model:http://localhost:3002','proof-model');
  localStorage.setItem('redraft:document','The plan is affordable.');
  localStorage.setItem('redraft:steering','Use the current support plan price from context.');
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('notes',{create:true});
  const files=await (await fetch('/fixture.json')).json();
  for(let at=0;at<files.length;at+=32) await Promise.all(files.slice(at,at+32).map(async({path,text})=>{
    const parts=path.split('/');let dir=root;
    for(const part of parts.slice(0,-1)) dir=await dir.getDirectoryHandle(part,{create:true});
    const writer=await (await dir.getFileHandle(parts.at(-1),{create:true})).createWritable();
    await writer.write(text);await writer.close();
  }));
  return {files:files.length,bytes:files.reduce((n,f)=>n+new TextEncoder().encode(f.text).length,0)};
})()`);
console.log("seed", JSON.stringify(seed));
await run("open", `http://localhost:3002/${variant}.html`);
await run(
  "wait",
  "--fn",
  "document.querySelector('.cm-content') && document.body.textContent.includes('proof-model')",
);
await evaluate(`(()=>{
  window.fileReads=[];const text=File.prototype.text;
  File.prototype.text=function(){window.fileReads.push({name:this.name,size:this.size});return text.call(this)};
  window.showDirectoryPicker=async()=>await(await navigator.storage.getDirectory()).getDirectoryHandle('notes');
  return true;
})()`);
await run("click", '[aria-label="Context folder"]');
await run("wait", "--fn", "document.body.textContent.includes('3761 files')");
const indexed = await evaluate("({reads:window.fileReads.length,text:document.body.innerText})");
assert.equal(indexed.reads, 3761);
const phases = [];
for (const phase of ["initial", "unchanged", "edited", "deleted", "forgotten"]) {
  const previousCalls = (await (await fetch("http://localhost:3002/log.json")).json()).length;
  if (phase === "edited")
    await evaluate(
      String.raw`(async()=>{const dir=await(await(await navigator.storage.getDirectory()).getDirectoryHandle('notes')).getDirectoryHandle('proof');const w=await(await dir.getFileHandle('canary.md')).createWritable();await w.write('# House style\n\nThe support plan costs 27 dollars. benchmarkuicanaryqz Updated.\n');await w.close();return true})()`,
    );
  if (phase === "deleted")
    await evaluate(
      "(async()=>{const dir=await(await(await navigator.storage.getDirectory()).getDirectoryHandle('notes')).getDirectoryHandle('proof');await dir.removeEntry('canary.md');return true})()",
    );
  if (phase === "forgotten") await run("click", '[aria-label="Forget context folder"]');
  await evaluate("window.fileReads.length=0");
  if (phase === "initial") {
    await run("click", ".cm-content");
    await run("press", "Control+a");
    await run("press", "Control+Space");
  } else await run("click", '[title="Suggest for the selection, or refresh these"]');
  const expected =
    phase === "edited"
      ? "27 dollars"
      : phase === "deleted" || phase === "forgotten"
        ? "No context found."
        : "12 dollars";
  await run(
    "wait",
    "--fn",
    `document.body.innerText.includes(${JSON.stringify(expected)}) && !document.body.innerText.includes('Drafting alternatives')`,
  );
  const state = await evaluate(
    "({reads:window.fileReads.length,text:document.body.innerText,sources:[...document.querySelectorAll('details li')].map(x=>x.textContent.trim()),options:document.querySelectorAll('aside button.group').length})",
  );
  assert.ok((await (await fetch("http://localhost:3002/log.json")).json()).length > previousCalls);
  assert.equal(state.options, 3);
  assert.equal(
    state.reads,
    phase === "initial" || phase === "unchanged" ? 2 : phase === "edited" ? 3 : 0,
  );
  assert.deepEqual(
    state.sources,
    phase === "deleted" || phase === "forgotten" ? [] : ["proof/canary.md"],
  );
  phases.push({ phase, expected, ...state });
  console.log("phase", phase, "reads", state.reads, "sources", JSON.stringify(state.sources));
}
await Bun.write(
  `dist/search-ui-${variant}.json`,
  JSON.stringify({ variant, seed, indexed, phases }, null, 2),
);
await run("close");
