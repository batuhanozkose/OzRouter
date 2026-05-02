export const OZROUTER_RESPONSE_HEADERS = {
  cache: "X-OzRouter-Cache",
  cacheHit: "X-OzRouter-Cache-Hit",
  latencyMs: "X-OzRouter-Latency-Ms",
  model: "X-OzRouter-Model",
  progress: "X-OzRouter-Progress",
  provider: "X-OzRouter-Provider",
  responseCost: "X-OzRouter-Response-Cost",
  tokensIn: "X-OzRouter-Tokens-In",
  tokensOut: "X-OzRouter-Tokens-Out",
} as const;
