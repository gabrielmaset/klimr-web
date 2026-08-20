#!/usr/bin/env node
// KFU-034: canonical-zeros migration checksum. A file cannot contain its own
// hash, so the recorded checksum is sha256 of the file with its own checksum
// literal replaced by 64 zeros. `node scripts/migration-checksum.mjs <file>`
// prints the canonical hash and, when a journal_migration checksum literal is
// present, whether it matches.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const f = process.argv[2];
if (!f) { console.error("usage: migration-checksum.mjs <migration.sql>"); process.exit(2); }
const src = readFileSync(f, "utf8");
const m = src.match(/journal_migration\('\d{4}',[^,]+,\s*'([0-9a-f]{64})'/);
const canonical = m ? src.replace(m[1], "0".repeat(64)) : src;
const hash = createHash("sha256").update(canonical).digest("hex");
console.log("canonical sha256:", hash);
if (m) {
  const ok = m[1] === hash;
  console.log(ok ? "recorded checksum MATCHES" : `MISMATCH — recorded ${m[1]}`);
  process.exit(ok ? 0 : 1);
}
