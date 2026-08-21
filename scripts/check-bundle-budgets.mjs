#!/usr/bin/env node
// KFU-015, Turbopack era: the budget gate re-grounded on build ARTIFACTS.
// Next 16's Turbopack prints a route table with no size columns, so the old
// log parser could only fail loudly (which it did — correctly). This version
// measures the client JS that will actually ship: the shared entry graph
// from .next/build-manifest.json rootMainFiles, and the total of every JS
// chunk under .next/static/chunks. Fail-loud invariants preserved: a missing
// build, an empty manifest, or zero chunks can never be green.
// argv[2] (the old build-log path) is accepted for CI compatibility, unused.
import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const budgets = JSON.parse(readFileSync(new URL("./bundle-budgets.json", import.meta.url), "utf8"));
const NEXT = ".next";

if (!existsSync(join(NEXT, "build-manifest.json"))) {
  console.error("check-bundle-budgets: .next/build-manifest.json missing — no build to measure. Failing loudly rather than passing on nothing.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8"));
const rootMainFiles = manifest.rootMainFiles ?? [];
if (rootMainFiles.length === 0) {
  console.error("check-bundle-budgets: rootMainFiles is empty — the manifest shape changed. Failing loudly; update this gate deliberately, never let it pass on nothing.");
  process.exit(1);
}
const sharedKB = rootMainFiles.reduce((s, f) => s + (existsSync(join(NEXT, f)) ? statSync(join(NEXT, f)).size : 0), 0) / 1024;

const chunks = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) chunks.push({ path: p, kb: statSync(p).size / 1024 });
  }
};
const chunksDir = join(NEXT, "static", "chunks");
if (!existsSync(chunksDir)) {
  console.error("check-bundle-budgets: .next/static/chunks missing — nothing to measure. Failing loudly.");
  process.exit(1);
}
walk(chunksDir);
if (chunks.length === 0) {
  console.error("check-bundle-budgets: zero JS chunks found — a zero-row measurement must never be green.");
  process.exit(1);
}
const totalKB = chunks.reduce((s, c) => s + c.kb, 0);
const top = [...chunks].sort((a, b) => b.kb - a.kb).slice(0, 10)
  .map((c) => ({ chunk: c.path.replace(NEXT + "/", ""), kb: +c.kb.toFixed(1) }));

writeFileSync("route-bundle-stats.json", JSON.stringify({
  generatedAt: new Date().toISOString(),
  sharedEntryKB: +sharedKB.toFixed(1),
  totalClientKB: +totalKB.toFixed(1),
  chunkCount: chunks.length,
  ceilings: { sharedEntryKB: budgets.sharedEntryKB, totalClientKB: budgets.totalClientKB },
  topChunks: top,
}, null, 2));

console.log(`check-bundle-budgets: shared entry ${sharedKB.toFixed(0)} kB (ceiling ${budgets.sharedEntryKB}) · total client ${totalKB.toFixed(0)} kB across ${chunks.length} chunks (ceiling ${budgets.totalClientKB})`);
const breaches = [];
if (sharedKB > budgets.sharedEntryKB) breaches.push(`shared entry ${sharedKB.toFixed(0)} kB > ${budgets.sharedEntryKB} kB`);
if (totalKB > budgets.totalClientKB) breaches.push(`total client ${totalKB.toFixed(0)} kB > ${budgets.totalClientKB} kB`);
if (breaches.length) {
  console.error("BUDGET BREACH:");
  for (const b of breaches) console.error("  " + b);
  console.error("Largest chunks are listed in route-bundle-stats.json — find the re-entry before raising a ceiling.");
  process.exit(1);
}
