import { Client, ConnectConfig } from "ssh2";
import { execFile } from "child_process";
import { getInstance, type RemoteInstanceRow } from "@/lib/db/remoteInstances";

const IDLE_TTL = 5 * 60 * 1000;
const CONNECT_TIMEOUT = 10000;
const CLEANUP_INTERVAL = 60_000;
const SFTP_MAX_FILE_SIZE = 1 * 1024 * 1024;
const SFTP_TIMEOUT = 8000;
const OPENSSH_TIMEOUT = 15000;
const OPENSSH_EXIT_SENTINEL = "__OZROUTER_REMOTE_EXIT_CODE__:";

interface PooledConnection {
  client: Client;
  lastUsed: number;
  connecting: Promise<Client> | null;
}

export class ConnectionManager {
  private pool: Map<string, PooledConnection> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), CLEANUP_INTERVAL);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  private getConnectConfig(instance: RemoteInstanceRow): ConnectConfig {
    const config: ConnectConfig = {
      host: instance.host,
      port: instance.port,
      username: instance.username,
      readyTimeout: CONNECT_TIMEOUT,
      keepaliveInterval: 30000,
    };

    const hasPassword = instance.authType === "password" && instance.password;
    const hasKey = instance.authType === "privateKey" && instance.privateKey;

    if (hasPassword) {
      config.password = instance.password!;
    } else if (hasKey) {
      config.privateKey = instance.privateKey!;
    } else {
      config.agent = process.env.SSH_AUTH_SOCK || undefined;
      config.tryKeyboard = true;
    }

    return config;
  }

  canUseSystemSsh(instance: RemoteInstanceRow): boolean {
    return !instance.password && !instance.privateKey;
  }

  async execSystemSshCommand(
    instance: RemoteInstanceRow,
    command: string,
    timeoutMs: number = OPENSSH_TIMEOUT
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const encodedCommand = Buffer.from(command, "utf-8").toString("base64");
      const remoteCommand = [
        "tmp=$(mktemp)",
        `printf %s ${encodedCommand} | base64 -d > "$tmp"`,
        'sh "$tmp"',
        "code=$?",
        'rm -f "$tmp"',
        `printf '\\n${OPENSSH_EXIT_SENTINEL}%s\\n' "$code"`,
        "exit 0",
      ].join("; ");
      const args = [
        "-o",
        "BatchMode=yes",
        "-o",
        `ConnectTimeout=${Math.max(1, Math.ceil(timeoutMs / 1000))}`,
        "-o",
        "StrictHostKeyChecking=no",
        "-p",
        String(instance.port),
        `${instance.username}@${instance.host}`,
        remoteCommand,
      ];

      execFile("ssh", args, { timeout: timeoutMs }, (error, stdout, stderr) => {
        const processExitCode =
          typeof (error as NodeJS.ErrnoException | null)?.code === "number"
            ? ((error as NodeJS.ErrnoException).code as number)
            : error
              ? 255
              : 0;
        const rawStdout = String(stdout || "");
        const sentinelPattern = new RegExp(`\\n?${OPENSSH_EXIT_SENTINEL}(\\d+)\\s*$`);
        const sentinelMatch = rawStdout.match(sentinelPattern);
        const remoteExitCode = sentinelMatch ? Number(sentinelMatch[1]) : null;
        const cleanStdout = sentinelMatch
          ? rawStdout.replace(sentinelPattern, "").trim()
          : rawStdout.trim();
        const cleanStderr = String(stderr || "").trim();
        const exitCode = remoteExitCode ?? processExitCode;

        if (error && remoteExitCode == null && processExitCode === 255 && !cleanStdout) {
          reject(
            Object.assign(new Error(cleanStderr || error.message), { code: "SSH_SYSTEM_ERROR" })
          );
          return;
        }

        resolve({
          stdout: cleanStdout,
          stderr: cleanStderr,
          exitCode,
        });
      });
    });
  }

  async execInstanceCommand(
    instanceId: string,
    command: string,
    timeoutMs: number = 15000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error(`Remote instance ${instanceId} not found`);

    if (this.canUseSystemSsh(instance)) {
      return this.execSystemSshCommand(instance, command, timeoutMs);
    }

    const client = await this.connect(instanceId);
    return this.execCommand(client, command, timeoutMs);
  }

  async connect(instanceId: string): Promise<Client> {
    const pooled = this.pool.get(instanceId);
    if (pooled) {
      pooled.lastUsed = Date.now();
      if (pooled.connecting) {
        return await pooled.connecting;
      }
      try {
        const ready = await this.pooledReady(pooled.client);
        return ready;
      } catch {
        pooled.client?.end();
        this.pool.delete(instanceId);
      }
    }

    const instance = getInstance(instanceId);
    if (!instance) throw new Error(`Remote instance ${instanceId} not found`);

    const connectPromise = this.createClient(instance);

    const pooledConn: PooledConnection = {
      client: null as unknown as Client,
      lastUsed: Date.now(),
      connecting: connectPromise,
    };

    this.pool.set(instanceId, pooledConn);

    try {
      const client = await connectPromise;
      pooledConn.client = client;
      pooledConn.connecting = null;
      return client;
    } catch (err) {
      this.pool.delete(instanceId);
      throw err;
    }
  }

  private createClient(instance: RemoteInstanceRow): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const config = this.getConnectConfig(instance);
      console.log("[SSH] Connecting with config:", {
        host: config.host,
        port: config.port,
        username: config.username,
        hasPassword: !!config.password,
        hasKey: !!config.privateKey,
        hasAgent: !!config.agent,
      });

      let settled = false;

      const handleReady = () => {
        if (settled) return;
        settled = true;
        console.log("[SSH] Connected successfully to", instance.host);
        resolve(client);
      };

      const handleError = (err: Error & { level?: string }) => {
        if (settled) return;
        settled = true;
        console.error("[SSH] Connection error:", err.level, err.message);
        client.end();

        const code =
          err.level === "client-authentication"
            ? "SSH_AUTH_FAILED"
            : err.message.includes("TIMEOUT") || err.message.includes("timeout")
              ? "SSH_CONNECT_TIMEOUT"
              : err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND")
                ? "SSH_HOST_UNREACHABLE"
                : "SSH_CONNECTION_ERROR";

        reject(Object.assign(new Error(err.message), { code }));
      };

      client.once("ready", handleReady);
      client.once("error", handleError);
      client.connect(config);
    });
  }

  private pooledReady(client: Client): Promise<Client> {
    return new Promise((resolve, reject) => {
      if (client.writable && !client.destroyed) {
        resolve(client);
        return;
      }
      client.once("ready", () => resolve(client));
      client.once("error", reject);
    });
  }

  async execCommand(
    client: Client,
    command: string,
    timeoutMs: number = 15000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let streamRef: any = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        streamRef?.close?.();
        reject(Object.assign(new Error("SSH_COMMAND_TIMEOUT"), { code: "SSH_COMMAND_TIMEOUT" }));
      }, timeoutMs);

      const settleResolve = (result: { stdout: string; stderr: string; exitCode: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      client.exec(command, (err, stream) => {
        if (err) {
          settleReject(err);
          return;
        }
        streamRef = stream;

        let stdout = "";
        let stderr = "";
        let exitCode: number | null = null;

        stream.on("data", (data: Buffer) => {
          stdout += data.toString("utf-8");
        });
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString("utf-8");
        });
        stream.on("exit", (code: number | null) => {
          exitCode = code ?? null;
        });
        stream.on("close", (code: number | null) => {
          settleResolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? code ?? -1,
          });
        });
        stream.on("error", (err: Error) => {
          settleReject(err);
        });
      });
    });
  }

  async execCommandStream(
    client: Client,
    command: string,
    options: {
      timeoutMs?: number;
      onStdout?: (data: string) => void | Promise<void>;
      onStderr?: (data: string) => void | Promise<void>;
    } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { timeoutMs = 15000, onStdout, onStderr } = options;

    return new Promise((resolve, reject) => {
      let settled = false;
      let streamRef: any = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        streamRef?.close?.();
        reject(Object.assign(new Error("SSH_COMMAND_TIMEOUT"), { code: "SSH_COMMAND_TIMEOUT" }));
      }, timeoutMs);

      const settleResolve = (result: { stdout: string; stderr: string; exitCode: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      client.exec(command, (err, stream) => {
        if (err) {
          settleReject(err);
          return;
        }
        streamRef = stream;

        let stdout = "";
        let stderr = "";
        let exitCode: number | null = null;

        stream.on("data", (data: Buffer) => {
          const chunk = data.toString("utf-8");
          stdout += chunk;
          void onStdout?.(chunk);
        });
        stream.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString("utf-8");
          stderr += chunk;
          void onStderr?.(chunk);
        });
        stream.on("exit", (code: number | null) => {
          exitCode = code ?? null;
        });
        stream.on("close", (code: number | null) => {
          settleResolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? code ?? -1,
          });
        });
        stream.on("error", (err: Error) => {
          settleReject(err);
        });
      });
    });
  }

  async readFile(client: Client, remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) return reject(err);

        const chunks: Buffer[] = [];
        let totalSize = 0;
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          stream.destroy(new Error("SFTP_READ_TIMEOUT"));
          reject(Object.assign(new Error("SFTP_READ_TIMEOUT"), { code: "SFTP_READ_TIMEOUT" }));
        }, SFTP_TIMEOUT);

        const stream = sftp.createReadStream(remotePath);
        const settleResolve = (content: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(content);
        };
        const settleReject = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };
        stream.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > SFTP_MAX_FILE_SIZE) {
            stream.destroy(new Error("SFTP file exceeds 1MB limit"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          settleResolve(Buffer.concat(chunks).toString("utf-8"));
        });
        stream.on("error", (err: Error) => {
          settleReject(err);
        });
      });
    });
  }

  async writeFile(client: Client, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) return reject(err);

        const buffer = Buffer.from(content, "utf-8");

        const write = () => {
          const stream = sftp.createWriteStream(remotePath);
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            stream.destroy(new Error("SFTP_WRITE_TIMEOUT"));
            reject(Object.assign(new Error("SFTP_WRITE_TIMEOUT"), { code: "SFTP_WRITE_TIMEOUT" }));
          }, SFTP_TIMEOUT);
          const settleResolve = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          };
          const settleReject = (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          };
          stream.on("finish", settleResolve);
          stream.on("error", settleReject);
          stream.end(buffer);
        };

        const dir = remotePath.substring(0, remotePath.lastIndexOf("/"));
        if (dir) {
          sftp.mkdir(dir, { mode: 0o755 }, (mkdirErr) => {
            write();
          });
        } else {
          write();
        }
      });
    });
  }

  async resolveHomeDir(client: Client): Promise<string> {
    const { stdout } = await this.execCommand(client, "echo $HOME");
    return stdout.trim() || "/root";
  }

  async testConnection(instanceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      let instance: RemoteInstanceRow;
      try {
        instance = getInstance(instanceId);
        if (!instance) return { success: false, error: "Instance not found" };
      } catch {
        return { success: false, error: "Instance not found" };
      }

      const client = await this.createClient(instance);
      try {
        await this.execCommand(client, "echo ok", 5000);
        return { success: true };
      } finally {
        client.end();
      }
    } catch (err: any) {
      return { success: false, error: err.code || err.message };
    }
  }

  disconnect(instanceId: string): void {
    const pooled = this.pool.get(instanceId);
    if (pooled) {
      pooled.client?.end();
      this.pool.delete(instanceId);
    }
  }

  disconnectAll(): void {
    for (const [id, pooled] of this.pool) {
      pooled.client?.end();
    }
    this.pool.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanupIdle(): void {
    const now = Date.now();
    for (const [id, pooled] of this.pool) {
      if (now - pooled.lastUsed > IDLE_TTL) {
        pooled.client?.end();
        this.pool.delete(id);
      }
    }
  }
}

export const connectionManager = new ConnectionManager();
