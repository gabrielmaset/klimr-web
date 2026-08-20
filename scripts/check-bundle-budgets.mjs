#!/usr/bin/env node
// KFU-015: the enforcing replacement for the inert bundle scraper. Parses the
// route table Next prints at build time (the same numbers the auditor used to
// find four ~5.57MB routes), writes route-bundle-stats.json as the machine
// artifact, and FAILS the build when any route's First Load JS exceeds its
// budget. A silent regression to a multi-megabyte route is now impossible.
import { readFileSync, writeFileSync } from "node:fs";

const logPath = process.argv[2] ?? "/tmp/build.log";
const budgets = JSON.parse(readFileSync(new URL("./bundle-budgets.json", import.meta.url), "utf8"));
const log = readFileSync(logPath, "utf8");

const toKB = (num, unit) => {
  const n = parseFloat(num);
  if (unit === "B") return n / 1024;
  if (unit === "kB") return n;
  if (unit === "MB") return n * 1024;
  throw new Error(`unknown size unit ${unit}`);
};

// Rows look like: "├ ƒ /marketplace   12.3 kB   5.57 MB" (route, Size, First Load JS)
const rowRe = /^[├└│]\s+[ƒ○●λ]?\s*(\/\S*)\s+([\d.]+)\s+(B|kB|MB)\s+([\d.]+)\s+(B|kB|MB)\s*$/;
const routes = [];
for (const line of log.split("\n")) {
  const m = line.match(rowRe);
  if (m) routes.push({ route: m[1], sizeKB: +toKB(m[2], m[3]).toFixed(1), firstLoadKB: +toKB(m[4], m[5]).toFixed(1) });
}
if (routes.length === 0) {
  console.error("check-bundle-budgets: no route rows parsed from " + logPath + " — the table format changed or the build log is missing. Failing loudly rather than passing on nothing (a zero-row parse must never be green).");
  process.exit(1);
}

writeFileSync("route-bundle-stats.json", JSON.stringify({ generatedAt: new Date().toISOString(), defaultFirstLoadKB: budgets.defaultFirstLoadKB, routes }, null, 2));

const breaches = routes.filter((r) => r.firstLoadKB > (budgets.overrides[r.route] ?? budgets.defaultFirstLoadKB));
console.log(`check-bundle-budgets: ${routes.length} routes parsed; ceiling ${budgets.defaultFirstLoadKB} kB (${Object.keys(budgets.overrides).length} overrides)`);
if (breaches.length) {
  console.error("BUDGET BREACH — First Load JS over ceiling:");
  for (const b of breaches) console.error(`  ${b.route}  ${b.firstLoadKB} kB > ${budgets.overrides[b.route] ?? budgets.defaultFirstLoadKB} kB`);
  process.exit(1);
}
console.log("all routes within budget");
