import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { agentBrowser } from "./search/browser";

// NOTE: serialize measurements to avoid CPU and memory interference.
/* oxlint-disable no-await-in-loop */
const work = resolvePath(Bun.argv[2] ?? "dist/search-bench");
const trials = Number(Bun.argv[3] ?? 3);
const engines = (
  Bun.argv[4] ?? "fts5,minisearch,flexsearch,orama,bm25,elasticlunr,lunr,fuse,sqljs"
).split(",");
const flags =
  "--js-flags=--expose-gc --max-old-space-size=512,--enable-precise-memory-info,--disable-features=BackForwardCache,--disable-extensions,--no-first-run";
const agent = agentBrowser.bind(null, "search-audit", flags);

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  let listener;
  const pending = new Map();
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("CDP connection closed"));
    }
    pending.clear();
  });
  socket.addEventListener("message", ({ data }) => {
    const reply = JSON.parse(data);
    listener?.(reply);
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    clearTimeout(request.timeout);
    if (reply.error) request.reject(new Error(JSON.stringify(reply.error)));
    else request.resolve(reply.result);
  });
  return {
    close: () => socket.close(),
    onEvent: (handler) => {
      listener = handler;
    },
    call: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 60000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      }),
  };
}

const manifest = await Bun.file(`${work}/manifest.json`).json();
const sizes = await Bun.file(`${work}/sizes.json`).json();
const output = Bun.file(`${work}/measurements.json`);
const evidence = (await output.exists())
  ? await output.json()
  : { manifest, sizes, flags, samples: [] };
if (
  evidence.manifest.corpusSha256 !== manifest.corpusSha256 ||
  evidence.manifest.queriesSha256 !== manifest.queriesSha256 ||
  evidence.flags !== flags
)
  throw new Error(
    "Existing measurements use a different corpus, queries, or browser configuration",
  );
if (evidence.inFlight) {
  (evidence.failures ??= []).push({
    ...evidence.inFlight,
    error: "Previous measurement process terminated before completion; cause not established",
  });
  delete evidence.inFlight;
}
for (let trial = 0; trial < trials; trial++) {
  const order = engines.toSorted(
    (a, b) =>
      Number(Bun.hash(`${trial}/${a}`) % 1000000n) - Number(Bun.hash(`${trial}/${b}`) % 1000000n),
  );
  for (const engine of order) {
    if (evidence.samples.some((sample) => sample.engine === engine && sample.trial === trial))
      continue;
    const progress = { engine, trial, stage: "open", peakRss: 0 };
    evidence.inFlight = progress;
    await Bun.write(output, JSON.stringify(evidence, null, 2));
    try {
      const url = `http://localhost:3001/?engine=${engine}`;
      try {
        await agent("open", url);
      } catch (error) {
        if (!String(error).includes("Could not configure browser")) throw error;
        await agent("open", url);
      }
      const browserUrl = (await agent("get", "cdp-url")).trim();
      const endpoint = `http://${new URL(browserUrl).host}`;
      const targets = await (await fetch(`${endpoint}/json/list`)).json();
      const target = targets.find((entry) => entry.url.includes(":3001/"));
      const page = await connect(target.webSocketDebuggerUrl);
      const version = await (await fetch(`${endpoint}/json/version`)).json();
      const browser = await connect(version.webSocketDebuggerUrl);
      for (const other of targets.filter(
        (entry) => entry.type === "page" && entry.id !== target.id,
      ))
        await browser.call("Target.closeTarget", { targetId: other.id });
      const evaluate = async (expression) => {
        const reply = await page.call("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
        return reply.result.value;
      };
      const deadline = Date.now() + 30000;
      while (!(await evaluate("!!window.benchmarkReady"))) {
        if (Date.now() > deadline) throw new Error(`${engine}: initialization did not finish`);
        await Bun.sleep(100);
      }
      const pids = new Set();
      let tracingDone;
      const tracing = new Promise((resolve) => {
        tracingDone = resolve;
      });
      browser.onEvent(({ method, params }) => {
        if (method === "Tracing.dataCollected") {
          params.value
            .filter((event) => event.name === "redraft-pid-probe")
            .forEach((event) => pids.add(event.pid));
        }
        if (method === "Tracing.tracingComplete") tracingDone();
      });
      await browser.call("Tracing.start", {
        categories: "blink.user_timing",
        transferMode: "ReportEvents",
      });
      await evaluate('performance.mark("redraft-pid-probe")');
      await browser.call("Tracing.end");
      await tracing;
      if (pids.size !== 1) throw new Error("Cannot identify benchmark renderer PID");
      const [rendererPid] = pids;
      const rss = () => {
        try {
          return (
            Number(
              /^VmRSS:\s+(\d+)/m.exec(readFileSync(`/proc/${rendererPid}/status`, "utf8"))[1],
            ) * 1024
          );
        } catch {
          return null;
        }
      };
      await page.call("HeapProfiler.collectGarbage");
      const heapBefore = await page.call("Runtime.getHeapUsage");
      const rssBefore = rss();
      const rssSamples = [rssBefore];
      progress.stage = "build";
      console.log(JSON.stringify(progress));
      const sampler = setInterval(() => {
        const current = rss();
        if (current !== null) rssSamples.push(current);
        progress.peakRss = Math.max(...rssSamples);
      }, 25);
      let build;
      try {
        build = await evaluate("window.runBuild()");
      } finally {
        clearInterval(sampler);
      }
      rssSamples.push(rss());
      await page.call("HeapProfiler.collectGarbage");
      const heapAfter = await page.call("Runtime.getHeapUsage");
      const rssAfter = rss();
      Object.assign(progress, { build, heapBefore, heapAfter, rssBefore, rssAfter });
      progress.stage = "queries";
      const results = [];
      progress.results = results;
      await Bun.write(output, JSON.stringify(evidence, null, 2));
      for (const [number, query] of manifest.queries.entries()) {
        if (Bun.argv[5] === "tasks" && query.kind === "title") continue;
        results.push(await evaluate(`window.runQuery(${number})`));
      }
      progress.stage = "updates";
      await Bun.write(output, JSON.stringify(evidence, null, 2));
      const updates = await evaluate("window.runUpdates()");
      const churn = ["fts5", "minisearch", "bm25"].includes(engine)
        ? await evaluate("window.runChurn()")
        : null;
      await page.call("HeapProfiler.collectGarbage");
      const heapAfterUpdates = await page.call("Runtime.getHeapUsage");
      const rssAfterUpdates = rss();
      const contract = await evaluate("window.runContract()");
      const sample = {
        engine,
        trial,
        rendererPid,
        browser: version.Browser,
        build,
        heapBefore,
        heapAfter,
        rssBefore,
        rssAfter,
        peakBuildRss: Math.max(...rssSamples),
        rssSamples: rssSamples.length,
        results,
        updates,
        churn,
        heapAfterUpdates,
        rssAfterUpdates,
        contract,
      };
      evidence.samples.push(sample);
      delete evidence.inFlight;
      await Bun.write(output, JSON.stringify(evidence, null, 2));
      console.log(
        JSON.stringify({
          engine,
          trial,
          ...build,
          peakRssMiB: sample.peakBuildRss / 2 ** 20,
          updateMs: updates.updateMs,
        }),
      );
      page.close();
      browser.close();
    } catch (error) {
      const failure = { ...progress, error: String(error) };
      (evidence.failures ??= []).push(failure);
      delete evidence.inFlight;
      await Bun.write(output, JSON.stringify(evidence, null, 2));
      console.log(
        JSON.stringify({
          engine,
          trial,
          stage: failure.stage,
          peakRss: failure.peakRss,
          error: failure.error,
        }),
      );
    } finally {
      await agent("close");
    }
  }
}
