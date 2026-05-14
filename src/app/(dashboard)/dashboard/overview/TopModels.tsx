"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

interface ModelItem {
  model: string;
  provider: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  avgLatency: number;
  successRate: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function shortModel(model: string): string {
  // Remove provider prefix like openai/, anthropic/ etc
  const parts = model.split("/");
  const name = parts.length > 1 ? parts[parts.length - 1] : model;
  return name.length > 24 ? name.slice(0, 22) + "…" : name;
}

export default function TopModels({ data }: { data: ModelItem[] }) {
  const t = useTranslations("home");

  if (!data.length) {
    return (
      <div className="rounded-xl border border-border bg-bg p-4">
        <h3 className="text-sm font-semibold text-text-main">{t("topModelsTitle")}</h3>
        <p className="mt-6 text-center text-xs text-text-muted/60">{t("topModelsEmpty")}</p>
      </div>
    );
  }

  const maxReqs = Math.max(...data.map((d) => d.requests));

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-main">{t("topModelsTitle")}</h3>
        <Link
          href="/dashboard/analytics"
          className="text-[11px] text-text-muted/60 transition-colors hover:text-primary"
        >
          {t("viewAll")} →
        </Link>
      </div>
      <div className="space-y-1">
        {data.map((m, i) => (
          <div
            key={m.model + m.provider}
            className="group relative rounded-lg px-3 py-2 transition-colors hover:bg-surface/80"
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-lg bg-primary/[0.04] transition-all group-hover:bg-primary/[0.07]"
              style={{ width: `${(m.requests / maxReqs) * 100}%` }}
            />
            <div className="relative flex items-center gap-3">
              <span className="w-4 text-[10px] font-bold text-text-muted/40 tabular-nums">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-main truncate">
                    {shortModel(m.model)}
                  </span>
                  <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] font-medium text-text-muted">
                    {m.provider}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs tabular-nums text-text-muted">
                  {fmt(m.tokensIn + m.tokensOut)} tok
                </span>
                <span className="text-xs tabular-nums text-text-muted">{m.avgLatency}ms</span>
                <span
                  className={`min-w-[36px] text-right text-xs font-semibold tabular-nums ${
                    m.successRate >= 95
                      ? "text-emerald-500"
                      : m.successRate >= 80
                        ? "text-amber-500"
                        : "text-red-500"
                  }`}
                >
                  {m.successRate}%
                </span>
                <span className="min-w-[40px] text-right text-xs font-bold tabular-nums text-text-main">
                  {fmt(m.requests)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
