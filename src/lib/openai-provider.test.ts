/* Run: npx tsx src/lib/openai-provider.test.ts */
import { strict as assert } from "node:assert";
import { resolveAiProviderConfig } from "./openai";

const originalEnv = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODEL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("openai provider config tests");
console.log("----------------------------");

test("uses Hermes API server when AI_PROVIDER=hermes", () => {
  resetEnv({
    AI_PROVIDER: "hermes",
    AI_ENDPOINT: "http://100.88.130.67:8642/v1/chat/completions",
    AI_MODEL: "hermes-agent",
    HERMES_API_KEY: "hermes-test",
  });
  const cfg = resolveAiProviderConfig();
  assert.equal(cfg.provider, "hermes");
  assert.equal(cfg.endpoint, "http://100.88.130.67:8642/v1/chat/completions");
  assert.equal(cfg.model, "hermes-agent");
  assert.equal(cfg.token, "hermes-test");
});

test("prefers OpenRouter GPT-5.5 when OPENROUTER_API_KEY is configured", () => {
  resetEnv({ OPENROUTER_API_KEY: "or-test" });
  const cfg = resolveAiProviderConfig();
  assert.equal(cfg.provider, "openrouter");
  assert.equal(cfg.endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(cfg.model, "openai/gpt-5.5");
  assert.equal(cfg.token, "or-test");
});

test("honors explicit AI_MODEL for OpenRouter", () => {
  resetEnv({ OPENROUTER_API_KEY: "or-test", AI_MODEL: "openai/gpt-5.5-pro" });
  const cfg = resolveAiProviderConfig();
  assert.equal(cfg.provider, "openrouter");
  assert.equal(cfg.model, "openai/gpt-5.5-pro");
});

test("falls back to GitHub Models gpt-4o-mini when only GITHUB_TOKEN exists", () => {
  resetEnv({ GITHUB_TOKEN: "gh-test" });
  const cfg = resolveAiProviderConfig();
  assert.equal(cfg.provider, "github");
  assert.equal(cfg.endpoint, "https://models.inference.ai.azure.com/chat/completions");
  assert.equal(cfg.model, "gpt-4o-mini");
  assert.equal(cfg.token, "gh-test");
});

process.env = originalEnv;
