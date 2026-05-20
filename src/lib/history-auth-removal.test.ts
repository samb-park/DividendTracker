import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    if (rel.includes("node_modules") || rel.includes(".next")) continue;
    if (statSync(full).isDirectory()) entries.push(...walk(full));
    else entries.push(rel);
  }
  return entries;
}

const sourceFiles = walk(srcRoot).filter((file) => {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) return false;
  // The regression tests themselves intentionally mention removed symbols in
  // assertions; scan production source only to avoid self-matching.
  return !file.endsWith(".test.ts") && !file.endsWith(".test.tsx");
});
const sourceText = sourceFiles.map((file) => `\n// ${file}\n${read(file)}`).join("\n");

// History tab cleanup: the dedicated Div Growth subtab and API route are removed.
assert.ok(!existsSync(path.join(root, "src/components/dividend-growth-chart.tsx")), "dedicated DividendGrowthChart component must be deleted");
assert.ok(!existsSync(path.join(root, "src/app/api/dividend-growth/route.ts")), "dedicated /api/dividend-growth route must be deleted");
assert.doesNotMatch(read("src/components/more-client.tsx"), /DIV GROWTH|divgrowth|DividendGrowthChart|\/api\/dividend-growth/, "History/More UI must not expose Div Growth tab or fetch route");
assert.doesNotMatch(sourceText, /DIV GROWTH|DividendGrowthChart/, "source must not expose dedicated Div Growth UI labels/components");
assert.doesNotMatch(sourceText, /\/api\/dividend-growth/, "production source must not fetch the removed dividend-growth API route");

// Browser auth cleanup: login/logout/auth routes and NextAuth remnants are removed.
for (const removedPath of [
  "src/app/(auth)",
  "src/app/api/auth",
  "src/auth.config.ts",
  "src/types/next-auth.d.ts",
  "src/components/sign-out-button.tsx",
]) {
  assert.ok(!existsSync(path.join(root, removedPath)), `${removedPath} must be removed in single-user mode`);
}

assert.doesNotMatch(sourceText, /next-auth|NextAuth|useSession|getServerSession|signIn|signOut|\/api\/auth|SignOutButton|LogOut/, "source must not contain browser auth/logout remnants");
assert.doesNotMatch(sourceText, /USER MANAGEMENT|AdminUserList|\/api\/admin|\/v1\/admin|href=\{?["']\/admin/, "source must not contain admin/user-management UI remnants");

const packageJson = read("package.json");
assert.doesNotMatch(packageJson, /"next-auth"/, "next-auth dependency must be removed");

const envExample = existsSync(path.join(root, ".env.example")) ? read(".env.example") : "";
assert.doesNotMatch(envExample, /NEXTAUTH|GOOGLE_CLIENT|GOOGLE_SECRET|AUTH_SECRET|AUTH_URL/, "env example must not document removed browser auth variables");

// Operational bearer auth must stay for cron/Hermes automation endpoints.
const proxySource = read("src/proxy.ts");
assert.match(proxySource, /CRON_SECRET/, "cron/Hermes bearer-token protection must remain");
assert.match(proxySource, /pathname\.startsWith\("\/api\/cron"\)/, "cron route matcher must remain protected");

console.log("history/auth removal regression tests passed");
