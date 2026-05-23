import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const route = await import("../../src/app/api/cli-tools/codex-settings/route.ts");

const originalEnv = { ...process.env };

async function authenticatedRequest(url: string, init: RequestInit = {}) {
  process.env.JWT_SECRET = "codex-settings-reset-test-secret";
  const token = await new SignJWT({ sub: "test" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const headers = new Headers(init.headers);
  headers.set("cookie", `auth_token=${token}`);
  return new Request(url, { ...init, headers });
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

test.afterEach(() => {
  restoreEnv();
});

test("Codex reset restores the pre-OzRouter OPENAI_API_KEY", async () => {
  const configHome = await fs.mkdtemp(path.join(os.homedir(), "ozrouter-codex-reset-"));
  process.env.CLI_CONFIG_HOME = configHome;
  process.env.CLI_ALLOW_CONFIG_WRITES = "true";

  const codexDir = path.join(configHome, ".codex");
  const configPath = path.join(codexDir, "config.toml");
  const authPath = path.join(codexDir, "auth.json");
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(
    configPath,
    ['model = "gpt-5.5"', 'openai_base_url = "http://localhost:20128/api/v1"', ""].join("\n")
  );
  await fs.writeFile(
    authPath,
    JSON.stringify(
      {
        OPENAI_API_KEY: "sk-ozrouter",
        OZROUTER_PREVIOUS_OPENAI_API_KEY: "sk-openai-normal",
      },
      null,
      2
    )
  );

  const response = await route.DELETE(
    await authenticatedRequest("http://localhost/api/cli-tools/codex-settings")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(await fs.readFile(configPath, "utf-8"), 'model = "gpt-5.5"\n');
  assert.deepEqual(JSON.parse(await fs.readFile(authPath, "utf-8")), {
    OPENAI_API_KEY: "sk-openai-normal",
  });

  await fs.rm(configHome, { recursive: true, force: true });
});

test("Codex apply preserves the prior OPENAI_API_KEY for reset", async () => {
  const configHome = await fs.mkdtemp(path.join(os.homedir(), "ozrouter-codex-apply-"));
  process.env.CLI_CONFIG_HOME = configHome;
  process.env.CLI_ALLOW_CONFIG_WRITES = "true";

  const codexDir = path.join(configHome, ".codex");
  const authPath = path.join(codexDir, "auth.json");
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(authPath, JSON.stringify({ OPENAI_API_KEY: "sk-openai-normal" }, null, 2));

  const response = await route.POST(
    await authenticatedRequest("http://localhost/api/cli-tools/codex-settings", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: "http://localhost:20128",
        apiKey: "sk-ozrouter",
        model: "gpt-5.5",
        reasoningEffort: "none",
        wireApi: "chat",
      }),
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(JSON.parse(await fs.readFile(authPath, "utf-8")), {
    OPENAI_API_KEY: "sk-ozrouter",
    OZROUTER_PREVIOUS_OPENAI_API_KEY: "sk-openai-normal",
  });

  await fs.rm(configHome, { recursive: true, force: true });
});
