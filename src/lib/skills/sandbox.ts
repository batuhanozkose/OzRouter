interface SandboxConfig {
  cpuLimit: number;
  memoryLimit: number;
  timeout: number;
  networkEnabled: boolean;
  readOnly: boolean;
}

interface SandboxResult {
  id: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

const DEFAULT_CONFIG: SandboxConfig = {
  cpuLimit: 100,
  memoryLimit: 256,
  timeout: 30000,
  networkEnabled: false,
  readOnly: true,
};

class SandboxRunner {
  private static instance: SandboxRunner;
  private config: SandboxConfig;

  private constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<SandboxConfig>): SandboxRunner {
    if (!SandboxRunner.instance) {
      SandboxRunner.instance = new SandboxRunner(config);
    }
    return SandboxRunner.instance;
  }

  setConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async run(
    _image: string,
    _command: string[],
    _env: Record<string, string> = {},
    _configOverride: Partial<SandboxConfig> = {}
  ): Promise<SandboxResult> {
    return {
      id: "disabled",
      exitCode: -1,
      stdout: "",
      stderr: "Built-in code execution is disabled in this GitHub-only build.",
      duration: 0,
      killed: false,
    };
  }

  kill(): boolean {
    return false;
  }

  killAll(): void {}

  isRunning(): boolean {
    return false;
  }

  getRunningCount(): number {
    return 0;
  }
}

export const sandboxRunner = SandboxRunner.getInstance();
export type { SandboxConfig, SandboxResult };
