import { connectionManager } from "@/lib/ssh/connectionManager";
import { getInstance } from "@/lib/db/remoteInstances";
import {
  CLI_TOOL_IDS,
  getCliPrimaryConfigPath,
  getCliToolCommandCandidates,
  getCliToolHealthcheckTimeoutMs,
  getCliToolRequiresBinary,
} from "./cliRuntime";

const SETTINGS_TOOLS = new Set(["claude", "codex", "droid", "openclaw", "cline", "kilo", "qwen"]);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function buildRemotePathSetup(): string {
  return [
    'PATH="$HOME/.local/bin:$HOME/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:$PATH"',
    '[ -d /usr/local/share/nvm/current/bin ] && PATH="/usr/local/share/nvm/current/bin:$PATH"',
    'if [ -d /usr/local/share/nvm/versions/node ]; then for node_bin in /usr/local/share/nvm/versions/node/*/bin; do [ -d "$node_bin" ] && PATH="$node_bin:$PATH"; done; fi',
    'if command -v npm >/dev/null 2>&1; then npm_prefix="$(npm config get prefix 2>/dev/null || true)"; if [ -n "$npm_prefix" ] && [ "$npm_prefix" != "undefined" ]; then PATH="$npm_prefix/bin:$PATH"; fi; fi',
    'if [ -d "$HOME/.nvm/versions/node" ]; then for node_bin in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$node_bin" ] && PATH="$node_bin:$PATH"; done; fi',
    "export PATH",
  ].join("; ");
}

function normalizeTrailingSlash(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizeV1BaseUrl(baseUrl: string): string {
  const normalized = normalizeTrailingSlash(baseUrl);
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function normalizeApiV1BaseUrl(baseUrl: string): string {
  return `${normalizeTrailingSlash(baseUrl)
    .replace(/\/v1$/, "")
    .replace(/\/api$/, "")}/api/v1`;
}

function normalizeWithoutV1BaseUrl(baseUrl: string): string {
  return normalizeTrailingSlash(baseUrl).replace(/\/v1$/, "");
}

function remotePath(homeDir: string, localPath: string): string {
  return localPath.replace(/^~/, homeDir);
}

function getRemoteConfigPath(homeDir: string, toolId: string, key?: string): string {
  if (key) {
    return getCliConfigPathsForRemote(toolId)[key].replace(/^~/, homeDir);
  }

  const configPath = getCliPrimaryConfigPath(toolId);
  if (!configPath) throw new Error(`No config path for tool: ${toolId}`);
  return remotePath(homeDir, configPath);
}

function getCliConfigPathsForRemote(toolId: string): Record<string, string> {
  switch (toolId) {
    case "codex":
      return { config: "~/.codex/config.toml", auth: "~/.codex/auth.json" };
    case "cline":
      return {
        globalState: "~/.cline/data/globalState.json",
        secrets: "~/.cline/data/secrets.json",
      };
    case "qwen":
      return { settings: "~/.qwen/settings.json", env: "~/.qwen/.env" };
    default:
      return {};
  }
}

function formatTomlValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) return value;
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildCodexToml(configData: Record<string, any>): string {
  const useCustomProvider = configData.wireApi === "responses";
  const root: Record<string, unknown> = {
    model: configData.model || "gpt-5.2-codex",
  };

  if (configData.reasoningEffort && configData.reasoningEffort !== "none") {
    root.model_reasoning_effort = configData.reasoningEffort;
  }

  if (useCustomProvider) {
    root.model_provider = "ozrouter";
  } else {
    root.openai_base_url = normalizeApiV1BaseUrl(configData.baseUrl);
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(root)) {
    lines.push(`${key} = ${formatTomlValue(value)}`);
  }

  if (useCustomProvider) {
    const provider = {
      name: "OzRouter",
      base_url: normalizeApiV1BaseUrl(configData.baseUrl),
      wire_api: "responses",
      env_key: "OPENAI_API_KEY",
    };

    lines.push("", "[model_providers.ozrouter]");
    for (const [key, value] of Object.entries(provider)) {
      lines.push(`${key} = ${formatTomlValue(value)}`);
    }
  }

  if (configData.modelMappings && Object.keys(configData.modelMappings).length > 0) {
    lines.push("", "[notice.model_migrations]");
    for (const [from, to] of Object.entries(configData.modelMappings)) {
      lines.push(`${formatTomlValue(from)} = ${formatTomlValue(to)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function parseCodexOzRouterStatus(config: string | null): boolean {
  if (!config) return false;
  return (
    config.includes("openai_base_url") ||
    config.includes('model_provider = "ozrouter"') ||
    config.includes("[model_providers.ozrouter]")
  );
}

export function mergeCodexRemoteAuth(
  existingAuth: Record<string, any>,
  apiKey: string
): Record<string, any> {
  const out = { ...existingAuth };
  if (
    out.OPENAI_API_KEY &&
    out.OPENAI_API_KEY !== apiKey &&
    !out.OZROUTER_PREVIOUS_OPENAI_API_KEY
  ) {
    out.OZROUTER_PREVIOUS_OPENAI_API_KEY = out.OPENAI_API_KEY;
  }
  out.OPENAI_API_KEY = apiKey;
  return out;
}

export function buildRemoteToolConfigPatch(
  toolId: string,
  configData: Record<string, any>
): Record<string, any> {
  const model = configData.model || "coder-model";
  const apiKey = configData.apiKey || "sk_ozrouter";

  switch (toolId) {
    case "claude": {
      const env: Record<string, any> = { ...(configData.env || {}) };
      if (configData.baseUrl) env.ANTHROPIC_BASE_URL = configData.baseUrl;
      if (configData.apiKey) env.ANTHROPIC_AUTH_TOKEN = configData.apiKey;
      return { env };
    }
    case "cline":
      return {
        globalState: {
          actModeApiProvider: "openai",
          planModeApiProvider: "openai",
          openAiBaseUrl: normalizeWithoutV1BaseUrl(configData.baseUrl),
          openAiModelId: model,
          planModeOpenAiModelId: model,
        },
        secrets: { openAiApiKey: apiKey },
      };
    case "kilo":
      return {
        "openai-compatible": {
          type: "api-key",
          apiKey,
          baseUrl: normalizeV1BaseUrl(configData.baseUrl),
          model,
        },
      };
    case "openclaw":
      return {
        agents: { defaults: { model: { primary: `ozrouter/${model}` } } },
        models: {
          providers: {
            ozrouter: {
              baseUrl: normalizeV1BaseUrl(configData.baseUrl),
              apiKey,
              api: "openai-completions",
              models: [{ id: model, name: String(model).split("/").pop() || model }],
            },
          },
        },
      };
    case "qwen": {
      const normalizedBaseUrl = normalizeTrailingSlash(configData.baseUrl);
      return {
        settings: {
          modelProviders: {
            openai: [
              {
                id: model,
                name: `${model} (OzRouter)`,
                envKey: "OPENAI_API_KEY",
                baseUrl: normalizedBaseUrl,
                generationConfig: { contextWindowSize: 200000 },
              },
            ],
            anthropic: [
              {
                id: "claude-sonnet-4-6",
                name: "Claude Sonnet 4.6 (OzRouter)",
                envKey: "ANTHROPIC_API_KEY",
                baseUrl: normalizedBaseUrl,
                generationConfig: { contextWindowSize: 200000 },
              },
            ],
            gemini: [
              {
                id: "gemini-3-flash",
                name: "Gemini 3 Flash (OzRouter)",
                envKey: "GEMINI_API_KEY",
                baseUrl: normalizedBaseUrl,
              },
            ],
          },
        },
        env: {
          OPENAI_API_KEY: apiKey,
          ANTHROPIC_API_KEY: apiKey,
          GEMINI_API_KEY: apiKey,
        },
      };
    }
    default:
      return configData;
  }
}

export function getRemoteToolCommandCandidates(toolId: string): string[] {
  return getCliToolCommandCandidates(toolId);
}

export function buildRemoteToolLookupCommand(commands: string[]): string {
  if (commands.length === 0) return "printf '%s\\n' NOT_FOUND";
  const quotedCommands = commands.map(shellQuote).join(" ");
  return [
    buildRemotePathSetup(),
    `for cmd in ${quotedCommands}; do found="$(command -v "$cmd" 2>/dev/null || which "$cmd" 2>/dev/null || true)"; if [ -n "$found" ]; then printf '%s\\n' "$found" | sed -n '1p'; exit 0; fi; done`,
    "printf '%s\\n' NOT_FOUND",
  ].join("; ");
}

export function buildRemoteToolsLookupCommand(toolIds: string[]): string {
  const checks = toolIds
    .map((toolId) => {
      const commands = getRemoteToolCommandCandidates(toolId);
      if (commands.length === 0) return "";
      const args = [toolId, ...commands].map(shellQuote).join(" ");
      return `check_tool ${args}`;
    })
    .filter(Boolean)
    .join("; ");

  return [
    buildRemotePathSetup(),
    'check_tool() { tool="$1"; shift; for cmd in "$@"; do found="$(command -v "$cmd" 2>/dev/null || which "$cmd" 2>/dev/null || true)"; if [ -n "$found" ]; then printf "%s\\t%s\\t%s\\n" "$tool" "$cmd" "$found" | sed -n "1p"; return 0; fi; done; printf "%s\\t\\tNOT_FOUND\\n" "$tool"; }',
    checks || "true",
  ].join("; ");
}

export function buildRemoteToolVersionCommand(commandPath: string, args: string): string {
  return `${buildRemotePathSetup()}; ${shellQuote(commandPath)} ${args} 2>&1`;
}

export async function getRemoteToolsShallowStatuses(
  instanceId: string,
  toolIds: string[]
): Promise<
  Record<
    string,
    {
      installed: boolean;
      runnable: boolean;
      command: string | null;
      commandPath: string | null;
      reason: string | null;
    }
  >
> {
  const statuses: Record<
    string,
    {
      installed: boolean;
      runnable: boolean;
      command: string | null;
      commandPath: string | null;
      reason: string | null;
    }
  > = {};
  const checkableToolIds: string[] = [];

  for (const toolId of toolIds) {
    if (!CLI_TOOL_IDS.includes(toolId)) {
      statuses[toolId] = {
        installed: false,
        runnable: false,
        command: null,
        commandPath: null,
        reason: "unknown_tool",
      };
      continue;
    }

    const commands = getRemoteToolCommandCandidates(toolId);
    if (!getCliToolRequiresBinary(toolId) && commands.length === 0) {
      statuses[toolId] = {
        installed: true,
        runnable: true,
        command: null,
        commandPath: null,
        reason: "not_required",
      };
      continue;
    }

    if (commands.length === 0) {
      statuses[toolId] = {
        installed: false,
        runnable: false,
        command: null,
        commandPath: null,
        reason: "missing_command",
      };
      continue;
    }

    checkableToolIds.push(toolId);
  }

  if (checkableToolIds.length === 0) return statuses;

  const result = await connectionManager.execInstanceCommand(
    instanceId,
    buildRemoteToolsLookupCommand(checkableToolIds),
    10_000
  );

  const seen = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [toolId, command, commandPath] = trimmed.split("\t");
    if (!toolId) continue;
    seen.add(toolId);
    if (commandPath && commandPath !== "NOT_FOUND") {
      statuses[toolId] = {
        installed: true,
        runnable: true,
        command: command || getRemoteToolCommandCandidates(toolId)[0] || null,
        commandPath,
        reason: null,
      };
    } else {
      statuses[toolId] = {
        installed: false,
        runnable: false,
        command: getRemoteToolCommandCandidates(toolId)[0] || null,
        commandPath: null,
        reason: "not_found",
      };
    }
  }

  for (const toolId of checkableToolIds) {
    if (!seen.has(toolId)) {
      statuses[toolId] = {
        installed: false,
        runnable: false,
        command: getRemoteToolCommandCandidates(toolId)[0] || null,
        commandPath: null,
        reason: "not_found",
      };
    }
  }

  return statuses;
}

export async function getRemoteToolBinaryStatus(
  instanceId: string,
  toolId: string,
  options: { healthcheck?: boolean } = {}
): Promise<{
  installed: boolean;
  runnable: boolean;
  command: string | null;
  commandPath: string | null;
  reason: string | null;
}> {
  if (!CLI_TOOL_IDS.includes(toolId)) {
    return {
      installed: false,
      runnable: false,
      command: null,
      commandPath: null,
      reason: "unknown_tool",
    };
  }

  const commands = getRemoteToolCommandCandidates(toolId);
  const requiresBinary = getCliToolRequiresBinary(toolId);
  if (!requiresBinary && commands.length === 0) {
    return {
      installed: true,
      runnable: true,
      command: null,
      commandPath: null,
      reason: "not_required",
    };
  }

  if (commands.length === 0) {
    return {
      installed: false,
      runnable: false,
      command: null,
      commandPath: null,
      reason: "missing_command",
    };
  }

  try {
    try {
      const whichResult = await connectionManager.execInstanceCommand(
        instanceId,
        buildRemoteToolLookupCommand(commands),
        8000
      );

      const commandPath = whichResult.stdout.trim();
      if (!commandPath || commandPath === "NOT_FOUND") {
        return {
          installed: false,
          runnable: false,
          command: commands[0],
          commandPath: null,
          reason: "not_found",
        };
      }

      if (options.healthcheck === false) {
        return {
          installed: true,
          runnable: true,
          command: commands[0],
          commandPath,
          reason: null,
        };
      }

      let runnable = false;
      let reason: string | null = "healthcheck_failed";

      for (const args of ["--version", "-v"]) {
        try {
          const result = await connectionManager.execInstanceCommand(
            instanceId,
            buildRemoteToolVersionCommand(commandPath, args),
            getCliToolHealthcheckTimeoutMs(toolId)
          );
          const output = `${result.stdout}\n${result.stderr}`.trim();
          if (result.exitCode === 0 && output.length > 0 && output.length < 4096) {
            runnable = true;
            reason = null;
            break;
          }
        } catch {
          continue;
        }
      }

      return {
        installed: true,
        runnable,
        command: commands[0],
        commandPath,
        reason,
      };
    } catch (err: any) {
      return {
        installed: false,
        runnable: false,
        command: commands[0],
        commandPath: null,
        reason: err.code || err.message || "ssh_error",
      };
    }
  } catch (err: any) {
    return {
      installed: false,
      runnable: false,
      command: commands[0],
      commandPath: null,
      reason: err.code || err.message || "ssh_connect_error",
    };
  }
}

export async function checkRemoteToolConfigStatus(
  instanceId: string,
  toolId: string
): Promise<"configured" | "not_configured" | "not_installed"> {
  const configPath = getCliPrimaryConfigPath(toolId);
  if (!configPath) return "unknown" as any;

  try {
    const client = await connectionManager.connect(instanceId);
    const homeDir = await connectionManager.resolveHomeDir(client);
    const remotePath = configPath.replace(/^~/, homeDir);

    const content = await connectionManager.readFile(client, remotePath);
    if (!content) return "not_configured";

    if (toolId === "codex") {
      const lower = content.toLowerCase();
      return lower.includes("ozrouter") ? "configured" : "not_configured";
    }

    const config = JSON.parse(content);

    switch (toolId) {
      case "claude":
        return config?.env?.ANTHROPIC_BASE_URL ? "configured" : "not_configured";
      default:
        const configStr = JSON.stringify(config).toLowerCase();
        return configStr.includes("ozrouter") || configStr.includes("sk_ozrouter")
          ? "configured"
          : "not_configured";
    }
  } catch {
    return "not_configured";
  }
}

export async function readRemoteConfigFile(
  instanceId: string,
  remotePath: string
): Promise<string | null> {
  try {
    const client = await connectionManager.connect(instanceId);
    return await connectionManager.readFile(client, remotePath);
  } catch {
    return null;
  }
}

export async function readRemoteToolPrimaryConfig(
  instanceId: string,
  toolId: string
): Promise<string | null> {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error(`Remote instance ${instanceId} not found`);

  if (connectionManager.canUseSystemSsh(instance)) {
    const { stdout: homeDirResult } = await connectionManager.execInstanceCommand(
      instanceId,
      "printf '%s\n' \"$HOME\"",
      5000
    );
    const homeDir = homeDirResult.trim() || "/home/daytona";
    const remoteConfigPath = getRemoteConfigPath(homeDir, toolId);
    const result = await connectionManager.execInstanceCommand(
      instanceId,
      `test -f ${shellQuote(remoteConfigPath)} && cat ${shellQuote(remoteConfigPath)} || true`,
      5000
    );
    if (result.exitCode !== 0) return null;
    return result.stdout || null;
  }

  const client = await connectionManager.connect(instanceId);
  const homeDir = await connectionManager.resolveHomeDir(client);
  const remoteConfigPath = getRemoteConfigPath(homeDir, toolId);
  try {
    return (await connectionManager.readFile(client, remoteConfigPath)) || null;
  } catch {
    return null;
  }
}

export async function writeRemoteConfigFile(
  instanceId: string,
  remotePath: string,
  content: string
): Promise<void> {
  const client = await connectionManager.connect(instanceId);
  await connectionManager.writeFile(client, remotePath, content);
}

export async function createRemoteBackup(instanceId: string, remotePath: string): Promise<void> {
  const client = await connectionManager.connect(instanceId);
  try {
    const existing = await connectionManager.readFile(client, remotePath);
    if (existing) {
      const bakPath = `${remotePath}.ozrouter.bak`;
      await connectionManager.writeFile(client, bakPath, existing);
    }
  } catch {
    // File doesn't exist, no backup needed
  }
}

export async function applyRemoteToolConfig(
  instanceId: string,
  toolId: string,
  configData: Record<string, any>
): Promise<void> {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error(`Remote instance ${instanceId} not found`);

  if (connectionManager.canUseSystemSsh(instance)) {
    const { stdout: homeDir } = await connectionManager.execInstanceCommand(
      instanceId,
      "printf '%s\\n' \"$HOME\"",
      5000
    );
    await applyRemoteToolConfigViaSystemSsh(
      instanceId,
      homeDir.trim() || "/home/daytona",
      toolId,
      configData
    );
    return;
  }

  const client = await connectionManager.connect(instanceId);
  const homeDir = await connectionManager.resolveHomeDir(client);

  const localConfigPath = getCliPrimaryConfigPath(toolId);
  if (!localConfigPath) throw new Error(`No config path for tool: ${toolId}`);
  const remoteConfigPath = localConfigPath.replace(/^~/, homeDir);

  await applyRemoteToolConfigViaSftp(client, homeDir, toolId, remoteConfigPath, configData);
}

async function applyRemoteToolConfigViaSystemSsh(
  instanceId: string,
  homeDir: string,
  toolId: string,
  configData: Record<string, any>
): Promise<void> {
  if (!SETTINGS_TOOLS.has(toolId)) return;

  const patch = buildRemoteToolConfigPatch(toolId, configData);

  switch (toolId) {
    case "codex":
      await writeRemoteTextConfigViaShell(
        instanceId,
        getRemoteConfigPath(homeDir, "codex", "config"),
        buildCodexToml(configData)
      );
      await mergeRemoteJsonConfigViaShell(
        instanceId,
        getRemoteConfigPath(homeDir, "codex", "auth"),
        { OPENAI_API_KEY: configData.apiKey },
        "codex"
      );
      return;
    case "cline":
      await mergeRemoteJsonConfigViaShell(
        instanceId,
        getRemoteConfigPath(homeDir, "cline", "globalState"),
        patch.globalState
      );
      await mergeRemoteJsonConfigViaShell(
        instanceId,
        getRemoteConfigPath(homeDir, "cline", "secrets"),
        patch.secrets
      );
      return;
    case "droid":
      await upsertDroidRemoteConfigViaShell(
        instanceId,
        getRemoteConfigPath(homeDir, "droid"),
        configData
      );
      return;
    case "qwen":
      await upsertQwenRemoteConfigViaShell(instanceId, homeDir, configData);
      return;
    default:
      await mergeRemoteJsonConfigViaShell(instanceId, getRemoteConfigPath(homeDir, toolId), patch);
  }
}

async function applyRemoteToolConfigViaSftp(
  client: any,
  homeDir: string,
  toolId: string,
  remoteConfigPath: string,
  configData: Record<string, any>
): Promise<void> {
  if (!SETTINGS_TOOLS.has(toolId)) return;

  const patch = buildRemoteToolConfigPatch(toolId, configData);

  switch (toolId) {
    case "claude":
      await applyJsonMergeRemote(client, remoteConfigPath, patch);
      return;
    case "codex":
      await writeTextRemote(
        client,
        getRemoteConfigPath(homeDir, "codex", "config"),
        buildCodexToml(configData)
      );
      await applyJsonMergeRemote(client, getRemoteConfigPath(homeDir, "codex", "auth"), {
        OPENAI_API_KEY: configData.apiKey,
        __ozrouterMergeMode: "codex",
      });
      return;
    case "cline":
      await applyJsonMergeRemote(
        client,
        getRemoteConfigPath(homeDir, "cline", "globalState"),
        patch.globalState
      );
      await applyJsonMergeRemote(
        client,
        getRemoteConfigPath(homeDir, "cline", "secrets"),
        patch.secrets
      );
      return;
    case "droid":
      await applyDroidRemote(client, remoteConfigPath, configData);
      return;
    case "qwen":
      await applyQwenRemote(client, homeDir, configData);
      return;
    default:
      await applyJsonMergeRemote(client, remoteConfigPath, patch);
  }
}

function deepMergeConfig(
  target: Record<string, any>,
  patch: Record<string, any>
): Record<string, any> {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMergeConfig(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function applyJsonMergeRemote(
  client: any,
  configPath: string,
  patch: Record<string, any>
): Promise<void> {
  let existing: Record<string, any> = {};
  try {
    const content = await connectionManager.readFile(client, configPath);
    if (content) existing = JSON.parse(content);
  } catch {}

  const mergeMode = patch.__ozrouterMergeMode;
  const normalizedPatch = { ...patch };
  delete normalizedPatch.__ozrouterMergeMode;
  const merged =
    mergeMode === "codex"
      ? mergeCodexRemoteAuth(existing, String(normalizedPatch.OPENAI_API_KEY || ""))
      : deepMergeConfig(existing, normalizedPatch);

  await createRemoteBackupConfigPath(client, configPath);
  await connectionManager.writeFile(client, configPath, JSON.stringify(merged, null, 2));
}

async function applyDroidRemote(client: any, configPath: string, configData: Record<string, any>) {
  let existing: Record<string, any> = {};
  try {
    const content = await connectionManager.readFile(client, configPath);
    if (content) existing = JSON.parse(content);
  } catch {}

  const apiKey = configData.apiKey || "your_api_key";
  const model = configData.model || "coder-model";
  const customModel = {
    model,
    id: "custom:OzRouter-0",
    index: 0,
    baseUrl: normalizeV1BaseUrl(configData.baseUrl),
    apiKey,
    displayName: model,
    maxOutputTokens: 131072,
    noImageSupport: false,
    provider: "openai",
  };

  const current = Array.isArray(existing.customModels) ? existing.customModels : [];
  existing.customModels = [
    customModel,
    ...current.filter((m: any) => m?.id !== "custom:OzRouter-0"),
  ];

  await createRemoteBackupConfigPath(client, configPath);
  await connectionManager.writeFile(client, configPath, JSON.stringify(existing, null, 2));
}

async function applyQwenRemote(client: any, homeDir: string, configData: Record<string, any>) {
  const paths = getCliConfigPathsForRemote("qwen");
  await applyQwenSettingsRemote(client, remotePath(homeDir, paths.settings), configData);
  await updateEnvFileRemote(
    client,
    remotePath(homeDir, paths.env),
    buildRemoteToolConfigPatch("qwen", configData).env
  );
}

async function applyQwenSettingsRemote(
  client: any,
  settingsPath: string,
  configData: Record<string, any>
) {
  let existing: Record<string, any> = {};
  try {
    const content = await connectionManager.readFile(client, settingsPath);
    if (content) existing = JSON.parse(content);
  } catch {}

  const patch = buildRemoteToolConfigPatch("qwen", configData).settings;
  const providers = patch.modelProviders;
  existing.modelProviders = existing.modelProviders || {};

  for (const [type, entries] of Object.entries(providers)) {
    const nextEntry = (entries as any[])[0];
    const current = Array.isArray(existing.modelProviders[type])
      ? existing.modelProviders[type]
      : [];
    const idx = current.findIndex(
      (p: any) =>
        p &&
        (p.baseUrl === nextEntry.baseUrl || p.id === "ozrouter" || p.name?.includes("OzRouter"))
    );
    if (idx >= 0) current[idx] = nextEntry;
    else current.push(nextEntry);
    existing.modelProviders[type] = current;
  }

  await createRemoteBackupConfigPath(client, settingsPath);
  await connectionManager.writeFile(client, settingsPath, JSON.stringify(existing, null, 2));
}

async function updateEnvFileRemote(client: any, envPath: string, values: Record<string, string>) {
  let content = "";
  try {
    content = (await connectionManager.readFile(client, envPath)) || "";
  } catch {}

  const keys = new Set(Object.keys(values));
  const lines = content.split("\n").filter((line) => line.trim() && !keys.has(line.split("=")[0]));

  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }

  await createRemoteBackupConfigPath(client, envPath);
  await connectionManager.writeFile(client, envPath, `${lines.join("\n").trim()}\n`);
}

async function writeTextRemote(client: any, configPath: string, content: string): Promise<void> {
  await createRemoteBackupConfigPath(client, configPath);
  await connectionManager.writeFile(client, configPath, content);
}

async function mergeRemoteJsonConfigViaShell(
  instanceId: string,
  configPath: string,
  patch: Record<string, any>,
  mergeMode?: "codex"
): Promise<void> {
  const patchBase64 = Buffer.from(JSON.stringify(patch), "utf-8").toString("base64");
  const script = [
    "const fs=require('fs')",
    "const path=require('path')",
    "const p=process.argv[1]",
    "const patch=JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'))",
    "let existing={}",
    "try{existing=JSON.parse(fs.readFileSync(p,'utf8'))}catch{}",
    "function merge(a,b){const o={...a};for(const [k,v] of Object.entries(b)){if(v&&typeof v==='object'&&!Array.isArray(v)&&o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k])) o[k]=merge(o[k],v); else o[k]=v}return o}",
    `const mergeMode=${JSON.stringify(mergeMode || "")}`,
    "let out=merge(existing,patch)",
    "if(mergeMode==='codex'){out={...existing};if(out.OPENAI_API_KEY&&out.OPENAI_API_KEY!==patch.OPENAI_API_KEY&&!out.OZROUTER_PREVIOUS_OPENAI_API_KEY) out.OZROUTER_PREVIOUS_OPENAI_API_KEY=out.OPENAI_API_KEY; out.OPENAI_API_KEY=patch.OPENAI_API_KEY}",
    "fs.mkdirSync(path.dirname(p),{recursive:true})",
    "try{if(fs.existsSync(p)) fs.copyFileSync(p,`${p}.ozrouter.bak`)}catch{}",
    "fs.writeFileSync(p,JSON.stringify(out,null,2))",
  ].join(";");
  const command = `${buildRemotePathSetup()}; node -e ${shellQuote(script)} ${shellQuote(
    configPath
  )} ${shellQuote(patchBase64)}`;
  const result = await connectionManager.execInstanceCommand(instanceId, command, 15000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to write remote config");
  }
}

async function writeRemoteTextConfigViaShell(
  instanceId: string,
  configPath: string,
  content: string
): Promise<void> {
  const contentBase64 = Buffer.from(content, "utf-8").toString("base64");
  const script = [
    "const fs=require('fs')",
    "const path=require('path')",
    "const p=process.argv[1]",
    "const content=Buffer.from(process.argv[2],'base64').toString('utf8')",
    "fs.mkdirSync(path.dirname(p),{recursive:true})",
    "try{if(fs.existsSync(p)) fs.copyFileSync(p,`${p}.ozrouter.bak`)}catch{}",
    "fs.writeFileSync(p,content)",
  ].join(";");
  const command = `${buildRemotePathSetup()}; node -e ${shellQuote(script)} ${shellQuote(
    configPath
  )} ${shellQuote(contentBase64)}`;
  const result = await connectionManager.execInstanceCommand(instanceId, command, 15000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to write remote config");
  }
}

async function upsertDroidRemoteConfigViaShell(
  instanceId: string,
  configPath: string,
  configData: Record<string, any>
): Promise<void> {
  const model = configData.model || "coder-model";
  const customModel = {
    model,
    id: "custom:OzRouter-0",
    index: 0,
    baseUrl: normalizeV1BaseUrl(configData.baseUrl),
    apiKey: configData.apiKey || "your_api_key",
    displayName: model,
    maxOutputTokens: 131072,
    noImageSupport: false,
    provider: "openai",
  };
  const modelBase64 = Buffer.from(JSON.stringify(customModel), "utf-8").toString("base64");
  const script = [
    "const fs=require('fs')",
    "const path=require('path')",
    "const p=process.argv[1]",
    "const model=JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'))",
    "let existing={}",
    "try{existing=JSON.parse(fs.readFileSync(p,'utf8'))}catch{}",
    "const current=Array.isArray(existing.customModels)?existing.customModels:[]",
    "existing.customModels=[model,...current.filter(m=>m&&m.id!=='custom:OzRouter-0')]",
    "fs.mkdirSync(path.dirname(p),{recursive:true})",
    "try{if(fs.existsSync(p)) fs.copyFileSync(p,`${p}.ozrouter.bak`)}catch{}",
    "fs.writeFileSync(p,JSON.stringify(existing,null,2))",
  ].join(";");
  const command = `${buildRemotePathSetup()}; node -e ${shellQuote(script)} ${shellQuote(
    configPath
  )} ${shellQuote(modelBase64)}`;
  const result = await connectionManager.execInstanceCommand(instanceId, command, 15000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to write remote config");
  }
}

async function upsertQwenRemoteConfigViaShell(
  instanceId: string,
  homeDir: string,
  configData: Record<string, any>
): Promise<void> {
  const paths = getCliConfigPathsForRemote("qwen");
  const patch = buildRemoteToolConfigPatch("qwen", configData);
  await upsertQwenSettingsViaShell(instanceId, remotePath(homeDir, paths.settings), patch.settings);
  await updateRemoteEnvFileViaShell(instanceId, remotePath(homeDir, paths.env), patch.env);
}

async function upsertQwenSettingsViaShell(
  instanceId: string,
  settingsPath: string,
  settingsPatch: Record<string, any>
): Promise<void> {
  const patchBase64 = Buffer.from(JSON.stringify(settingsPatch), "utf-8").toString("base64");
  const script = [
    "const fs=require('fs')",
    "const path=require('path')",
    "const p=process.argv[1]",
    "const patch=JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'))",
    "let existing={}",
    "try{existing=JSON.parse(fs.readFileSync(p,'utf8'))}catch{}",
    "existing.modelProviders=existing.modelProviders||{}",
    "for(const [type,entries] of Object.entries(patch.modelProviders||{})){const next=entries[0];const current=Array.isArray(existing.modelProviders[type])?existing.modelProviders[type]:[];const idx=current.findIndex(x=>x&&(x.baseUrl===next.baseUrl||x.id==='ozrouter'||String(x.name||'').includes('OzRouter')));if(idx>=0)current[idx]=next;else current.push(next);existing.modelProviders[type]=current}",
    "fs.mkdirSync(path.dirname(p),{recursive:true})",
    "try{if(fs.existsSync(p)) fs.copyFileSync(p,`${p}.ozrouter.bak`)}catch{}",
    "fs.writeFileSync(p,JSON.stringify(existing,null,2))",
  ].join(";");
  const command = `${buildRemotePathSetup()}; node -e ${shellQuote(script)} ${shellQuote(
    settingsPath
  )} ${shellQuote(patchBase64)}`;
  const result = await connectionManager.execInstanceCommand(instanceId, command, 15000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to write remote config");
  }
}

async function updateRemoteEnvFileViaShell(
  instanceId: string,
  envPath: string,
  values: Record<string, string>
): Promise<void> {
  const valuesBase64 = Buffer.from(JSON.stringify(values), "utf-8").toString("base64");
  const script = [
    "const fs=require('fs')",
    "const path=require('path')",
    "const p=process.argv[1]",
    "const values=JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'))",
    "const keys=new Set(Object.keys(values))",
    "let lines=[]",
    "try{lines=fs.readFileSync(p,'utf8').split('\\n').filter(line=>line.trim()&&!keys.has(line.split('=')[0]))}catch{}",
    "for(const [k,v] of Object.entries(values)) lines.push(`${k}=${v}`)",
    "fs.mkdirSync(path.dirname(p),{recursive:true})",
    "try{if(fs.existsSync(p)) fs.copyFileSync(p,`${p}.ozrouter.bak`)}catch{}",
    "fs.writeFileSync(p,`${lines.join('\\n').trim()}\\n`)",
  ].join(";");
  const command = `${buildRemotePathSetup()}; node -e ${shellQuote(script)} ${shellQuote(
    envPath
  )} ${shellQuote(valuesBase64)}`;
  const result = await connectionManager.execInstanceCommand(instanceId, command, 15000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to write remote env config");
  }
}

async function createRemoteBackupConfigPath(client: any, configPath: string): Promise<void> {
  try {
    const existing = await connectionManager.readFile(client, configPath);
    if (existing) {
      await connectionManager.writeFile(client, `${configPath}.ozrouter.bak`, existing);
    }
  } catch {}
}

export async function resetRemoteToolConfig(instanceId: string, toolId: string): Promise<void> {
  const client = await connectionManager.connect(instanceId);
  const homeDir = await connectionManager.resolveHomeDir(client);
  const localConfigPath = getCliPrimaryConfigPath(toolId);
  if (!localConfigPath) throw new Error(`No config path for tool: ${toolId}`);
  const remoteConfigPath = localConfigPath.replace(/^~/, homeDir);

  createRemoteBackupConfigPath(client, remoteConfigPath).catch(() => {});

  if (toolId === "claude") {
    let existing: Record<string, any> = {};
    try {
      const content = await connectionManager.readFile(client, remoteConfigPath);
      if (content) existing = JSON.parse(content);
    } catch {}
    if (existing.env) {
      delete existing.env.ANTHROPIC_BASE_URL;
      delete existing.env.ANTHROPIC_AUTH_TOKEN;
    }
    await connectionManager.writeFile(client, remoteConfigPath, JSON.stringify(existing, null, 2));
  }
}
