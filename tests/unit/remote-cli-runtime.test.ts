import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemoteToolLookupCommand,
  buildRemoteToolsLookupCommand,
  buildRemoteToolVersionCommand,
  buildRemoteToolConfigPatch,
  buildCodexToml,
  mergeCodexRemoteAuth,
  parseCodexOzRouterStatus,
  getRemoteToolCommandCandidates,
} from "../../src/shared/services/remoteCliRuntime.ts";

test("remote CLI status uses the same default binary candidates as local runtime", () => {
  assert.deepEqual(getRemoteToolCommandCandidates("claude"), ["claude"]);
  assert.deepEqual(getRemoteToolCommandCandidates("kilo"), ["kilocode"]);
  assert.deepEqual(getRemoteToolCommandCandidates("cursor"), ["cursor-agent", "agent", "cursor"]);
  assert.deepEqual(getRemoteToolCommandCandidates("qoder"), ["qodercli"]);
});

test("remote CLI lookup includes common user, npm, and nvm binary directories", () => {
  const command = buildRemoteToolLookupCommand(["claude"]);

  assert.match(command, /\$HOME\/\.local\/bin/);
  assert.match(command, /npm config get prefix/);
  assert.match(command, /\$HOME\/\.nvm\/versions\/node/);
  assert.match(command, /\/usr\/local\/share\/nvm\/versions\/node/);
  assert.match(command, /command -v "\$cmd"/);
});

test("remote CLI batch lookup checks all tool command candidates in one SSH exec", () => {
  const command = buildRemoteToolsLookupCommand(["claude", "kilo", "cursor"]);

  assert.match(command, /check_tool 'claude' 'claude'/);
  assert.match(command, /check_tool 'kilo' 'kilocode'/);
  assert.match(command, /check_tool 'cursor' 'cursor-agent' 'agent' 'cursor'/);
});

test("remote CLI version probe quotes paths and captures stderr output", () => {
  const command = buildRemoteToolVersionCommand("/home/alex/bin/claude cli", "--version");

  assert.match(command, /'\/home\/alex\/bin\/claude cli' --version 2>&1$/);
});

test("remote CLI config patches match provider-specific local config formats", () => {
  assert.deepEqual(
    buildRemoteToolConfigPatch("claude", {
      baseUrl: "http://localhost:3000/v1",
      apiKey: "sk-test",
    }),
    {
      env: {
        ANTHROPIC_BASE_URL: "http://localhost:3000/v1",
        ANTHROPIC_AUTH_TOKEN: "sk-test",
      },
    }
  );

  assert.deepEqual(
    buildRemoteToolConfigPatch("cline", {
      baseUrl: "http://localhost:3000/v1",
      apiKey: "sk-test",
      model: "gpt-test",
    }),
    {
      globalState: {
        actModeApiProvider: "openai",
        planModeApiProvider: "openai",
        openAiBaseUrl: "http://localhost:3000",
        openAiModelId: "gpt-test",
        planModeOpenAiModelId: "gpt-test",
      },
      secrets: { openAiApiKey: "sk-test" },
    }
  );

  assert.deepEqual(
    buildRemoteToolConfigPatch("kilo", {
      baseUrl: "http://localhost:3000",
      apiKey: "sk-test",
      model: "gpt-test",
    }),
    {
      "openai-compatible": {
        type: "api-key",
        apiKey: "sk-test",
        baseUrl: "http://localhost:3000/v1",
        model: "gpt-test",
      },
    }
  );
});

test("remote Codex config uses auth.json for chat mode and env export for responses mode", () => {
  const chatConfig = buildCodexToml({
    baseUrl: "http://localhost:20128",
    model: "gpt-5.5",
    wireApi: "chat",
  });

  assert.match(chatConfig, /openai_base_url = "http:\/\/localhost:20128\/api\/v1"/);
  assert.doesNotMatch(chatConfig, /model_provider = "ozrouter"/);
  assert.doesNotMatch(chatConfig, /env_key = "OPENAI_API_KEY"/);

  const responsesConfig = buildCodexToml({
    baseUrl: "http://localhost:20128",
    model: "gpt-5.5",
    wireApi: "responses",
  });

  assert.match(responsesConfig, /model_provider = "ozrouter"/);
  assert.match(responsesConfig, /wire_api = "responses"/);
  assert.match(responsesConfig, /env_key = "OPENAI_API_KEY"/);
});

test("remote Codex status detects both chat and responses OzRouter configs", () => {
  assert.equal(
    parseCodexOzRouterStatus('model = "gpt-5.5"\nopenai_base_url = "http://x/api/v1"\n'),
    true
  );
  assert.equal(
    parseCodexOzRouterStatus('model_provider = "ozrouter"\n[model_providers.ozrouter]\n'),
    true
  );
  assert.equal(parseCodexOzRouterStatus('model = "gpt-5.5"\n'), false);
});

test("remote Codex auth merge preserves previous OpenAI key for reset", () => {
  assert.deepEqual(mergeCodexRemoteAuth({ OPENAI_API_KEY: "sk-openai" }, "sk-ozrouter"), {
    OPENAI_API_KEY: "sk-ozrouter",
    OZROUTER_PREVIOUS_OPENAI_API_KEY: "sk-openai",
  });

  assert.deepEqual(
    mergeCodexRemoteAuth(
      { OPENAI_API_KEY: "sk-old", OZROUTER_PREVIOUS_OPENAI_API_KEY: "sk-openai" },
      "sk-ozrouter"
    ),
    { OPENAI_API_KEY: "sk-ozrouter", OZROUTER_PREVIOUS_OPENAI_API_KEY: "sk-openai" }
  );
});
