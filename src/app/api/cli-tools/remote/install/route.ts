"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";
import { getInstance } from "@/lib/db/remoteInstances";
import { connectionManager } from "@/lib/ssh/connectionManager";
import {
  buildRemoteToolLookupCommand,
  buildRemoteToolVersionCommand,
} from "@/shared/services/remoteCliRuntime";
import { CLI_TOOL_IDS, getCliToolRequiresBinary } from "@/shared/services/cliRuntime";

const INSTALLERS: Record<
  string,
  {
    packageName: string;
    binaryName: string;
    installCommand?: string;
    requiresStoredCredentials?: boolean;
    requiresNode?: boolean;
  }
> = {
  claude: {
    packageName: "@anthropic-ai/claude-code",
    binaryName: "claude",
    requiresNode: true,
  },
  codex: {
    packageName: "@openai/codex",
    binaryName: "codex",
    requiresNode: true,
  },
  droid: {
    packageName: "Factory Droid installer",
    binaryName: "droid",
    installCommand: "curl -fsSL https://app.factory.ai/cli | sh 2>&1",
  },
  openclaw: {
    packageName: "OpenClaw installer",
    binaryName: "openclaw",
    installCommand: "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard 2>&1",
  },
  cursor: {
    packageName: "Cursor CLI installer",
    binaryName: "cursor-agent",
    installCommand: "curl https://cursor.com/install -fsS | bash 2>&1",
  },
  cline: {
    packageName: "cline",
    binaryName: "cline",
    requiresNode: true,
  },
  kilo: {
    packageName: "@kilocode/cli",
    binaryName: "kilocode",
    requiresNode: true,
  },
  opencode: {
    packageName: "OpenCode installer",
    binaryName: "opencode",
    installCommand: "curl -fsSL https://opencode.ai/install | bash 2>&1",
  },
  amp: {
    packageName: "Amp installer",
    binaryName: "amp",
    installCommand: "curl -fsSL https://ampcode.com/install.sh | bash 2>&1",
  },
  qoder: {
    packageName: "@qoder-ai/qodercli",
    binaryName: "qodercli",
    requiresNode: true,
  },
  qwen: {
    packageName: "@qwen-code/qwen-code@latest",
    binaryName: "qwen",
    requiresNode: true,
  },
};

type RemoteCommandResult = { stdout: string; stderr: string; exitCode: number };

const COMMON_PRECHECK_COMMANDS = ["sh", "bash", "mkdir", "chmod", "uname"];

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function remoteNodeSetupCommand(): string {
  return [
    'export NVM_DIR="$HOME/.nvm"',
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    '[ -d /usr/local/share/nvm/current/bin ] && export PATH="/usr/local/share/nvm/current/bin:$PATH"',
  ].join("; ");
}

function commandCheckScript(commands: string[]): string {
  return commands
    .map(
      (command) =>
        `if command -v ${shellQuote(command)} >/dev/null 2>&1; then echo ${shellQuote(`${command}=ok`)}; else echo ${shellQuote(`${command}=missing`)}; fi`
    )
    .join("; ");
}

function parseCommandCheck(output: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const line of output.split(/\r?\n/)) {
    const [name, status] = line.trim().split("=");
    if (!name || !status) continue;
    result[name] = status === "ok";
  }
  return result;
}

function packageManagerInstallCommand(commands: string[]): string {
  const packages = [...new Set(commands)].join(" ");
  return [
    "set -e",
    "if ! command -v sudo >/dev/null 2>&1 || ! sudo -n true >/dev/null 2>&1; then echo 'sudo is not available without a password'; exit 42; fi",
    `packages=${shellQuote(packages)}`,
    "if command -v apt-get >/dev/null 2>&1; then sudo -n apt-get update && sudo -n apt-get install -y $packages; exit $?; fi",
    "if command -v dnf >/dev/null 2>&1; then sudo -n dnf install -y $packages; exit $?; fi",
    "if command -v yum >/dev/null 2>&1; then sudo -n yum install -y $packages; exit $?; fi",
    "if command -v apk >/dev/null 2>&1; then sudo -n apk add --no-cache $packages; exit $?; fi",
    "if command -v zypper >/dev/null 2>&1; then sudo -n zypper --non-interactive install $packages; exit $?; fi",
    "echo 'No supported package manager found'; exit 43",
  ].join("; ");
}

function downloaderCommand(url: string): string {
  const quotedUrl = shellQuote(url);
  return `if command -v curl >/dev/null 2>&1; then curl -fsSL ${quotedUrl}; elif command -v wget >/dev/null 2>&1; then wget -qO- ${quotedUrl}; else echo 'Neither curl nor wget is available' >&2; exit 44; fi`;
}

function installerRequiredCommands(installer: (typeof INSTALLERS)[string]): string[] {
  const required = new Set(COMMON_PRECHECK_COMMANDS);
  if (installer.requiresNode) {
    required.add("bash");
  }
  if (installer.installCommand) {
    required.add("bash");
    required.add("curl");
  }
  return [...required];
}

async function tryInstallMissingCommands(
  instanceId: string,
  missing: string[],
  send: (line: string) => void,
  sendChunk: (chunk: string) => void
): Promise<void> {
  if (missing.length === 0) return;
  send(`[info] Missing command(s): ${missing.join(", ")}`);
  send("[info] Trying non-interactive package manager repair");
  const install = await connectionManager.execInstanceCommand(
    instanceId,
    packageManagerInstallCommand(missing),
    180000
  );
  if (install.stdout) sendChunk(`${install.stdout}\n`);
  if (install.stderr) sendChunk(`${install.stderr}\n`);
}

async function preflightRemoteInstall(
  instanceId: string,
  installer: (typeof INSTALLERS)[string],
  send: (line: string) => void,
  sendChunk: (chunk: string) => void
): Promise<{ ok: true } | { ok: false; message: string }> {
  const shell = await connectionManager.execInstanceCommand(
    instanceId,
    'printf \'home=%s\\nuser=%s\\nshell=%s\\n\' "$HOME" "$(id -un 2>/dev/null || whoami)" "$SHELL"; test -n "$HOME" && test -w "$HOME"',
    10000
  );
  if (shell.exitCode !== 0) {
    return { ok: false, message: "Remote shell is not usable or HOME is not writable" };
  }
  if (shell.stdout.trim()) send(shell.stdout.trim());

  const requiredCommands = installerRequiredCommands(installer);
  const commandCheck = await connectionManager.execInstanceCommand(
    instanceId,
    commandCheckScript(requiredCommands),
    10000
  );
  const commandStatus = parseCommandCheck(commandCheck.stdout);
  let missing = requiredCommands.filter((command) => !commandStatus[command]);

  if (missing.length > 0) {
    await tryInstallMissingCommands(instanceId, missing, send, sendChunk);
    const recheck = await connectionManager.execInstanceCommand(
      instanceId,
      commandCheckScript(requiredCommands),
      10000
    );
    const nextStatus = parseCommandCheck(recheck.stdout);
    missing = requiredCommands.filter((command) => !nextStatus[command]);
  }

  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing required command(s): ${missing.join(", ")}. Install them on the remote machine and retry.`,
    };
  }
  send(`[ok] Required command(s): ${requiredCommands.join(", ")}`);

  const network = await connectionManager.execInstanceCommand(
    instanceId,
    "if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 15 https://registry.npmjs.org/-/ping >/dev/null; elif command -v wget >/dev/null 2>&1; then wget -q --timeout=15 -O /dev/null https://registry.npmjs.org/-/ping; fi",
    20000
  );
  if (network.exitCode !== 0) {
    const detail = [network.stderr, network.stdout].filter(Boolean).join(" ").trim();
    return {
      ok: false,
      message: `Remote outbound HTTPS check failed${detail ? `: ${detail}` : ""}`,
    };
  }
  send("[ok] Remote outbound HTTPS works");

  return { ok: true };
}

export async function POST(request: NextRequest) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  let body: { instanceId?: string; toolId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { instanceId, toolId } = body;
  if (!instanceId || !toolId) {
    return NextResponse.json({ error: "instanceId and toolId are required" }, { status: 400 });
  }

  const installer = INSTALLERS[toolId];
  if (!installer) {
    if (CLI_TOOL_IDS.includes(toolId) && !getCliToolRequiresBinary(toolId)) {
      return NextResponse.json(
        { error: "This tool does not require a CLI binary installation" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Unsupported remote installer" }, { status: 400 });
  }

  const instance = getInstance(instanceId);
  if (!instance) {
    return NextResponse.json({ error: "Remote instance not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => {
        controller.enqueue(encoder.encode(`${line}\n`));
      };
      const sendChunk = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      const finish = (ok: boolean, message: string) => {
        send(`\n[${ok ? "ok" : "failed"}] ${message}`);
        send(`OZROUTER_INSTALL_STATUS=${ok ? "success" : "failed"}`);
        controller.close();
      };

      try {
        send(`[start] Connecting to ${instance.username}@${instance.host}:${instance.port}`);
        const client = connectionManager.canUseSystemSsh(instance)
          ? null
          : await connectionManager.connect(instanceId);
        send("[ok] SSH connection ready");

        send("[1/4] Checking runtime prerequisites");
        const preflight = await preflightRemoteInstall(instanceId, installer, send, sendChunk);
        if (!preflight.ok) {
          finish(false, preflight.message);
          return;
        }

        if (installer.requiresNode) {
          const nodeCheck = await connectionManager.execInstanceCommand(
            instanceId,
            `${remoteNodeSetupCommand()}; node --version 2>/dev/null || echo NOT_FOUND`,
            8000
          );
          if (nodeCheck.stdout.includes("NOT_FOUND")) {
            send("[info] Node.js not found, installing nvm and Node.js 22");
            const installNvmCommand = `${downloaderCommand("https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh")} | bash 2>&1`;
            const installNodeCommand = `${remoteNodeSetupCommand()}; nvm install 22 2>&1`;
            const installNode = client
              ? await (async () => {
                  await connectionManager.execCommandStream(client, installNvmCommand, {
                    timeoutMs: 60000,
                    onStdout: sendChunk,
                    onStderr: sendChunk,
                  });
                  return connectionManager.execCommandStream(client, installNodeCommand, {
                    timeoutMs: 180000,
                    onStdout: sendChunk,
                    onStderr: sendChunk,
                  });
                })()
              : await (async () => {
                  const nvm = await connectionManager.execInstanceCommand(
                    instanceId,
                    installNvmCommand,
                    60000
                  );
                  if (nvm.stdout) sendChunk(`${nvm.stdout}\n`);
                  if (nvm.stderr) sendChunk(`${nvm.stderr}\n`);
                  if (nvm.exitCode !== 0) return nvm;
                  const node = await connectionManager.execInstanceCommand(
                    instanceId,
                    installNodeCommand,
                    180000
                  );
                  if (node.stdout) sendChunk(`${node.stdout}\n`);
                  if (node.stderr) sendChunk(`${node.stderr}\n`);
                  return node;
                })();
            if (installNode.exitCode !== 0) {
              finish(false, "Node.js installation failed");
              return;
            }
          } else {
            send(`[ok] Found ${nodeCheck.stdout.trim()}`);
          }

          send("[2/4] Resolving npm");
          const npmCheck = await connectionManager.execInstanceCommand(
            instanceId,
            `${remoteNodeSetupCommand()}; npm --version 2>/dev/null || echo NOT_FOUND`,
            8000
          );
          if (npmCheck.stdout.includes("NOT_FOUND")) {
            finish(false, "npm was not found after Node.js setup");
            return;
          }
          send(`[ok] npm ${npmCheck.stdout.trim()}`);
        } else {
          send("[ok] Installer script includes its own runtime setup");
          send("[2/4] Skipping npm resolution");
        }

        send(`[3/4] Installing ${installer.packageName}`);
        if (installer.requiresStoredCredentials && !client) {
          finish(
            false,
            `${installer.binaryName} installer requires stored password or private key credentials`
          );
          return;
        }
        const installCommand =
          installer.installCommand ||
          `${remoteNodeSetupCommand()}; npm install -g ${installer.packageName} 2>&1`;
        if (client) {
          const install = await connectionManager.execCommandStream(client, installCommand, {
            timeoutMs: 180000,
            onStdout: sendChunk,
            onStderr: sendChunk,
          });
          if (install.exitCode !== 0) {
            send(
              `[warn] npm install exited with ${install.exitCode}; verifying binary before failing`
            );
          }
        } else {
          const install = await connectionManager.execInstanceCommand(
            instanceId,
            installCommand,
            180000
          );
          if (install.stdout) sendChunk(`${install.stdout}\n`);
          if (install.stderr) sendChunk(`${install.stderr}\n`);
          if (install.exitCode !== 0) {
            send(
              `[warn] npm install exited with ${install.exitCode}; verifying binary before failing`
            );
          }
        }

        send(`\n[4/4] Verifying ${installer.binaryName}`);
        const lookup = await connectionManager.execInstanceCommand(
          instanceId,
          buildRemoteToolLookupCommand([installer.binaryName]),
          10000
        );
        const commandPath = lookup.stdout.trim();
        if (!commandPath || commandPath === "NOT_FOUND") {
          finish(false, `${installer.binaryName} was not found on PATH after install`);
          return;
        }

        send(`[ok] Found ${commandPath}`);
        const verify = await connectionManager.execInstanceCommand(
          instanceId,
          buildRemoteToolVersionCommand(commandPath, "--version"),
          15000
        );
        if (verify.exitCode !== 0) {
          send(verify.stderr || verify.stdout || "[warn] Version command returned no output");
          finish(false, `${installer.binaryName} is installed but not runnable`);
          return;
        }

        send(`[ok] ${verify.stdout || verify.stderr}`.trim());
        finish(true, `${installer.binaryName} installed and verified`);
      } catch (error: any) {
        finish(false, error?.message || error?.code || "Unknown install error");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
