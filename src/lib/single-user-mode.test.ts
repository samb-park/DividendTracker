import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const singleUserSource = read("src/lib/single-user-mode.ts");
assert.match(singleUserSource, /SINGLE_USER_ID_FALLBACK\s*=\s*["']sangbong["']/, "single-user fallback must be sangbong");
assert.match(singleUserSource, /DIVIDENDTRACKER_SINGLE_USER_ID/, "single-user id must be env-overridable");
assert.match(singleUserSource, /getSingleUserSession/, "single-user session helper must exist");

const authSource = read("src/auth.ts");
assert.doesNotMatch(authSource, /from\s+["']next-auth["']/, "src/auth.ts must not import NextAuth");
assert.doesNotMatch(authSource, /NextAuth\(/, "src/auth.ts must not initialize NextAuth");
assert.match(authSource, /getSingleUserSession/, "auth() must return the fixed single-user session");
assert.doesNotMatch(authSource, /signIn|signOut|handlers/, "auth.ts must not expose login/logout handlers");

const proxySource = read("src/proxy.ts");
assert.doesNotMatch(proxySource, /next-auth|req\.auth|\/login|\/pending/, "proxy must not enforce NextAuth login/pending redirects");
assert.match(proxySource, /api\/cron/, "proxy must still mention protected automation endpoints");
assert.match(proxySource, /Bearer|CRON_SECRET/, "proxy must preserve Bearer/CRON_SECRET automation protection");

const v1Page = read("src/app/v1/page.tsx");
assert.doesNotMatch(v1Page, /redirect\(["']\/api\/auth\/signin|redirect\(["']\/login/, "v1 must not redirect to login");
assert.match(v1Page, /auth\(\)/, "v1 should use the single-user auth helper for user scoping");

console.log("single-user mode tests passed");
