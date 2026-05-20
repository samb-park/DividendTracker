import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/api/snapshots/route.ts"), "utf8");

for (const range of ["3m", "6m", "1y", "3y", "5y", "all"]) {
  assert.match(source, new RegExp(`\\"${range}\\"`), `/api/snapshots must accept range=${range}`);
}

assert.match(source, /setFullYear\(since\.getFullYear\(\) - 3\)/, "3Y range should query snapshots since three years ago");
assert.match(source, /setFullYear\(since\.getFullYear\(\) - 5\)/, "5Y range should query snapshots since five years ago");

console.log("snapshots range tests passed");
