import assert from "node:assert/strict";
import {
  isLocalAuthBypassEnabled,
  isLocalhostHost,
  normalizeHostHeader,
  shouldUseLocalAuthBypass,
} from "./local-auth-bypass";

const ENV_KEY = "DIVIDENDTRACKER_LOCAL_AUTH_BYPASS";
const originalValue = process.env[ENV_KEY];

function setBypass(value: string | undefined) {
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
}

try {
  assert.equal(normalizeHostHeader("localhost:3000"), "localhost");
  assert.equal(normalizeHostHeader("127.0.0.1:3000"), "127.0.0.1");
  assert.equal(normalizeHostHeader("[::1]:3000"), "[::1]");
  assert.equal(normalizeHostHeader("dividend.example.com"), "dividend.example.com");

  assert.equal(isLocalhostHost("localhost:3000"), true);
  assert.equal(isLocalhostHost("127.0.0.1:3000"), true);
  assert.equal(isLocalhostHost("[::1]:3000"), true);
  assert.equal(isLocalhostHost("dividend.example.com"), false);

  setBypass(undefined);
  assert.equal(isLocalAuthBypassEnabled(), false);
  assert.equal(shouldUseLocalAuthBypass("localhost:3000"), false);

  setBypass("false");
  assert.equal(shouldUseLocalAuthBypass("localhost:3000"), false);

  setBypass("true");
  assert.equal(isLocalAuthBypassEnabled(), true);
  assert.equal(shouldUseLocalAuthBypass("localhost:3000"), true);
  assert.equal(shouldUseLocalAuthBypass("127.0.0.1:3000"), true);
  assert.equal(shouldUseLocalAuthBypass("[::1]:3000"), true);
  assert.equal(shouldUseLocalAuthBypass("dividend.example.com"), false);
} finally {
  setBypass(originalValue);
}

console.log("local-auth-bypass tests passed");
