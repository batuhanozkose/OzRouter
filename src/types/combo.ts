/**
 * Combo — a routing group that distributes requests across provider nodes.
 */
export interface Combo {
  id: string;
  name: string;
  description?: string;
  model: string;
  strategy: ComboStrategy;
  isActive: boolean;
  nodes: ComboNode[];
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  healthCheckEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ComboStrategy =
  | "priority"
  | "weighted"
  | "round-robin"
  | "context-relay"
  | "random"
  | "least-used"
  | "cost-optimized"
  | "strict-random"
  | "auto"
  | "fill-first"
  | "p2c"
  | "lkgp"
  | "context-optimized";

export interface ComboNode {
  connectionId: string;
  provider: string;
  weight: number;
  priority: number;
}
