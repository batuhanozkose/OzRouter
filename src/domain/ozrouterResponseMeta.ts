import { getProviderAlias } from "@/shared/constants/providers";
import { OZROUTER_RESPONSE_HEADERS } from "@/shared/constants/headers";

type UsageLike = Record<string, unknown> | null | undefined;

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.round(toFiniteNumber(value)));
}

export function getOzRouterTokenCounts(usage: UsageLike): { input: number; output: number } {
  if (!usage || typeof usage !== "object") {
    return { input: 0, output: 0 };
  }

  return {
    input: toNonNegativeInteger(
      usage.input ??
        usage.prompt_tokens ??
        usage.input_tokens ??
        usage.promptTokens ??
        usage.inputTokens
    ),
    output: toNonNegativeInteger(
      usage.output ??
        usage.completion_tokens ??
        usage.output_tokens ??
        usage.completionTokens ??
        usage.outputTokens
    ),
  };
}

export function formatOzRouterCost(costUsd: unknown): string {
  const normalized = toFiniteNumber(costUsd);
  return normalized > 0 ? normalized.toFixed(10) : "0.0000000000";
}

export function buildOzRouterResponseMetaHeaders({
  cacheHit = false,
  costUsd = 0,
  latencyMs = 0,
  model = null,
  provider = null,
  usage = null,
}: {
  cacheHit?: boolean;
  costUsd?: unknown;
  latencyMs?: unknown;
  model?: string | null;
  provider?: string | null;
  usage?: UsageLike;
}): Record<string, string> {
  const tokens = getOzRouterTokenCounts(usage);
  const headers: Record<string, string> = {
    [OZROUTER_RESPONSE_HEADERS.cacheHit]: String(cacheHit),
    [OZROUTER_RESPONSE_HEADERS.latencyMs]: String(toNonNegativeInteger(latencyMs)),
    [OZROUTER_RESPONSE_HEADERS.responseCost]: formatOzRouterCost(costUsd),
    [OZROUTER_RESPONSE_HEADERS.tokensIn]: String(tokens.input),
    [OZROUTER_RESPONSE_HEADERS.tokensOut]: String(tokens.output),
  };

  if (typeof model === "string" && model.trim().length > 0) {
    headers[OZROUTER_RESPONSE_HEADERS.model] = model;
  }

  if (typeof provider === "string" && provider.trim().length > 0) {
    headers[OZROUTER_RESPONSE_HEADERS.provider] = getProviderAlias(provider);
  }

  return headers;
}

export function buildOzRouterSseMetadataComment(
  options: Parameters<typeof buildOzRouterResponseMetaHeaders>[0]
): string {
  const headers = buildOzRouterResponseMetaHeaders(options);
  const lines = Object.entries(headers)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([name, value]) => `: ${name.toLowerCase()}=${value}`);

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
