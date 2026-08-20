#!/usr/bin/env node
// KFU-034: per-release manifest binding file digests to the artifact. Walks
// the source tree (node_modules/.next/.git excluded), writes sorted
// "sha256  path" lines to RELEASE_MANIFEST.sha256, and prints the manifest's
// own top-hash — record that top-hash in the batch's DESIGN_DECISIONS entry
// so artifact ↔ digests ↔ ledger bind. Run as part of the pre-zip gate.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
const SKIP = new Set(["node_modules", ".next", ".git", "RELEASE_MANIFEST.sha256"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push(relative(".", p));
  }
})(".");
files.sort();
const lines = files.map((p) => `${createHash("sha256").update(readFileSync(p)).digest("hex")}  ${p}`);
writeFileSync("RELEASE_MANIFEST.sha256", lines.join("\n") + "\n");
const top = createHash("sha256").update(lines.join("\n") + "\n").digest("hex");
console.log(`RELEASE_MANIFEST.sha256: ${files.length} files, top-hash ${top}`);
