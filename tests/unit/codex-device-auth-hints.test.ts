import test from "node:test";
import assert from "node:assert/strict";

import { extractCodexDeviceAuthHints } from "../../src/app/api/oauth/[provider]/[action]/route.ts";

test("extractCodexDeviceAuthHints parses Codex CLI 4-5 device code", () => {
  const output = `
To sign in, open:
https://auth.openai.com/activate

2. Enter this one-time code (expires in 15 minutes)
   GQ4D-6R8T0
`;

  const hints = extractCodexDeviceAuthHints(output);

  assert.equal(hints.verificationUrl, "https://auth.openai.com/activate");
  assert.equal(hints.userCode, "GQ4D-6R8T0");
});

test("extractCodexDeviceAuthHints keeps legacy 4-4 device codes working", () => {
  const hints = extractCodexDeviceAuthHints("Enter verification code ABCD-EFGH");

  assert.equal(hints.userCode, "ABCD-EFGH");
});
