import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const testFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(path);
    } else if (entry.endsWith(".test.ts")) {
      testFiles.push(path);
    }
  }
}

walk(join(root, "src"));
testFiles.sort();

if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

let failed = 0;

for (const file of testFiles) {
  const relative = file.slice(root.length + 1);
  console.log(`\n> ${relative}`);
  const result = spawnSync("./node_modules/.bin/sucrase-node", [relative], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} test file(s) failed.`);
  process.exit(1);
}

console.log(`\n${testFiles.length} test file(s) passed.`);
