import {
  resolveAntigravityModelId,
  toClientAntigravityModelId,
} from "@ozrouter/open-sse/config/antigravityModelAliases";
import { PROVIDER_ID_TO_ALIAS } from "@ozrouter/open-sse/config/providerModels";

export type PricingByProvider = Record<string, Record<string, Record<string, unknown>>>;

export type PricingResolutionSource =
  | "provider-exact"
  | "provider-alias"
  | "family-fallback"
  | "global-exact";

export type PricingResolution = {
  pricing: Record<string, unknown>;
  pricingProvider: string;
  pricingModel: string;
  source: PricingResolutionSource;
  estimated: boolean;
};

const SAFE_SUFFIXES = ["-thinking", "-think", "-high", "-medium", "-low"];

function addUnique(values: string[], value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized && !values.includes(normalized)) values.push(normalized);
}

export function normalizeModelName(model: string): string {
  if (!model || !model.includes("/")) return model;
  const parts = model.split("/");
  return parts[parts.length - 1];
}

function shortModelName(model: string): string {
  if (!model) return model;
  const parts = model.split(/[/:]/);
  return parts[parts.length - 1] || model;
}

function stripSafeSuffixes(model: string): string[] {
  const variants: string[] = [];
  let current = model;

  for (let i = 0; i < 3; i += 1) {
    const suffix = SAFE_SUFFIXES.find((item) => current.endsWith(item));
    if (!suffix) break;
    current = current.slice(0, -suffix.length);
    addUnique(variants, current);
  }

  return variants;
}

function addGeminiPreviewVariants(variants: string[]) {
  for (const model of [...variants]) {
    if (/^gemini-\d/.test(model) && !model.endsWith("-preview")) {
      addUnique(variants, `${model}-preview`);
    }
  }
}

export function getPricingModelCandidates(provider: string, model: string): string[] {
  const candidates: string[] = [];
  addUnique(candidates, model);
  addUnique(candidates, normalizeModelName(model));
  addUnique(candidates, shortModelName(model));

  if (provider === "antigravity") {
    for (const candidate of [...candidates]) {
      addUnique(candidates, resolveAntigravityModelId(candidate));
      addUnique(candidates, toClientAntigravityModelId(candidate));
    }
  }

  for (const candidate of [...candidates]) {
    for (const stripped of stripSafeSuffixes(candidate)) {
      addUnique(candidates, stripped);
    }
  }

  if (provider === "antigravity") {
    for (const candidate of [...candidates]) {
      addUnique(candidates, resolveAntigravityModelId(candidate));
      addUnique(candidates, toClientAntigravityModelId(candidate));
    }
  }

  addGeminiPreviewVariants(candidates);
  return candidates;
}

function getFamilyProviders(modelCandidates: string[]): string[] {
  const providers: string[] = [];
  const joined = modelCandidates.join(" ").toLowerCase();

  if (/(^|[/\s])claude[-/]/.test(joined)) {
    addUnique(providers, "anthropic");
    addUnique(providers, "cc");
  }
  if (/(^|[/\s])gemini[-/]/.test(joined)) {
    addUnique(providers, "gemini");
    addUnique(providers, "gemini-cli");
    addUnique(providers, "google-vertex");
  }
  if (/(^|[/\s])(gpt-|o[1345](?:-|$))/.test(joined)) {
    addUnique(providers, "openai");
    addUnique(providers, "cx");
  }
  if (/(^|[/\s])qwen[-/]/.test(joined)) {
    addUnique(providers, "alibaba");
    addUnique(providers, "ali");
  }
  if (/(^|[/\s])deepseek[-/]/.test(joined)) {
    addUnique(providers, "deepseek");
    addUnique(providers, "ds");
  }

  return providers;
}

function findInProvider(
  pricingByProvider: PricingByProvider,
  provider: string,
  modelCandidates: string[]
): { pricing: Record<string, unknown>; pricingModel: string } | null {
  const providerPricing = pricingByProvider[provider];
  if (!providerPricing) return null;

  for (const model of modelCandidates) {
    const pricing = providerPricing[model];
    if (pricing) return { pricing, pricingModel: model };
  }

  return null;
}

function pricingSignature(pricing: Record<string, unknown>): string {
  return JSON.stringify({
    input: pricing.input ?? null,
    output: pricing.output ?? null,
    cached: pricing.cached ?? null,
    reasoning: pricing.reasoning ?? null,
    cache_creation: pricing.cache_creation ?? null,
  });
}

function findGlobalExact(
  pricingByProvider: PricingByProvider,
  modelCandidates: string[]
): { pricing: Record<string, unknown>; pricingProvider: string; pricingModel: string } | null {
  const matches: Array<{
    pricing: Record<string, unknown>;
    pricingProvider: string;
    pricingModel: string;
  }> = [];

  for (const [provider, models] of Object.entries(pricingByProvider)) {
    for (const model of modelCandidates) {
      const pricing = models[model];
      if (pricing) matches.push({ pricing, pricingProvider: provider, pricingModel: model });
    }
  }

  if (matches.length === 0) return null;

  const signatures = new Set(matches.map((match) => pricingSignature(match.pricing)));
  if (signatures.size > 1) return null;
  return matches[0];
}

export function resolvePricingForModel(
  pricingByProvider: PricingByProvider,
  provider: string,
  model: string
): PricingResolution | null {
  if (!provider || !model) return null;

  const modelCandidates = getPricingModelCandidates(provider, model);
  const providerCandidates = [provider, PROVIDER_ID_TO_ALIAS[provider]].filter(
    (key, index, keys): key is string =>
      typeof key === "string" && key.length > 0 && keys.indexOf(key) === index
  );

  for (const providerKey of providerCandidates) {
    const match = findInProvider(pricingByProvider, providerKey, modelCandidates);
    if (!match) continue;

    return {
      pricing: match.pricing,
      pricingProvider: providerKey,
      pricingModel: match.pricingModel,
      source: providerKey === provider ? "provider-exact" : "provider-alias",
      estimated: false,
    };
  }

  for (const providerKey of getFamilyProviders(modelCandidates)) {
    if (providerCandidates.includes(providerKey)) continue;
    const match = findInProvider(pricingByProvider, providerKey, modelCandidates);
    if (!match) continue;

    return {
      pricing: match.pricing,
      pricingProvider: providerKey,
      pricingModel: match.pricingModel,
      source: "family-fallback",
      estimated: true,
    };
  }

  const globalMatch = findGlobalExact(pricingByProvider, modelCandidates);
  if (!globalMatch) return null;

  return {
    ...globalMatch,
    source: "global-exact",
    estimated: true,
  };
}
