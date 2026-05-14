"use client";

import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface TokenData {
  input: number;
  output: number;
  cacheRead: number;
  reasoning: number;
}

interface ProviderItem {
  provider: string;
  requests: number;
  tokens: number;
  avgLatency: number;
  successRate: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

const TOKEN_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899"];

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs shadow-xl">
      <span style={{ color: d.payload.fill }}>{d.name}</span>: {fmt(d.value)}
    </div>
  );
}

export default function TokenBreakdown({
  tokens,
  providers,
}: {
  tokens: TokenData;
  providers: ProviderItem[];
}) {
  const t = useTranslations("home");
  const total = tokens.input + tokens.output + tokens.cacheRead + tokens.reasoning;

  const donutData = [
    { name: t("tokenInput"), value: tokens.input },
    { name: t("tokenOutput"), value: tokens.output },
    { name: t("tokenCache"), value: tokens.cacheRead },
    { name: t("tokenReasoning"), value: tokens.reasoning },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-main">{t("tokenBreakdownTitle")}</h3>

      <div className="flex items-center gap-4">
        {/* Donut */}
        {total > 0 ? (
          <div className="h-[120px] w-[120px] shrink-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={TOKEN_COLORS[i % TOKEN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[120px] w-[120px] items-center justify-center">
            <span className="text-xs text-text-muted/40">—</span>
          </div>
        )}

        {/* Legend + stats */}
        <div className="flex-1 space-y-2">
          {donutData.map((d, i) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <div key={d.name} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TOKEN_COLORS[i] }}
                />
                <span className="flex-1 text-xs text-text-muted">{d.name}</span>
                <span className="text-xs tabular-nums font-medium text-text-main">
                  {fmt(d.value)}
                </span>
                <span className="w-8 text-right text-[10px] tabular-nums text-text-muted/60">
                  {pct}%
                </span>
              </div>
            );
          })}
          {total > 0 && (
            <div className="border-t border-border pt-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-medium text-text-muted">
                  {t("tokenTotal")}
                </span>
                <span className="text-xs tabular-nums font-bold text-text-main">{fmt(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top providers mini-bar */}
      {providers.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="mb-2 text-[11px] font-medium text-text-muted/60 uppercase tracking-wider">
            {t("topProvidersTitle")}
          </h4>
          <div className="space-y-1.5">
            {providers.map((p) => {
              const maxReqs = Math.max(...providers.map((pp) => pp.requests));
              const pct = maxReqs > 0 ? (p.requests / maxReqs) * 100 : 0;
              return (
                <div key={p.provider} className="flex items-center gap-2">
                  <span className="w-20 truncate text-xs text-text-main">{p.provider}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-[10px] tabular-nums text-text-muted">
                    {fmt(p.requests)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
