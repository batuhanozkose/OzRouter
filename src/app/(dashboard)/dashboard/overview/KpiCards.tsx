"use client";

import { useTranslations } from "next-intl";
import {
  Activity,
  CheckCircle2,
  Timer,
  DollarSign,
  Zap,
  TrendingUp,
  Database,
  Layers,
} from "lucide-react";

interface KpiData {
  todayRequests: number;
  todayTokens: number;
  weekRequests: number;
  weekTokens: number;
  successRate: number;
  avgLatencyMs: number;
  monthlyCost: number;
  connectedProviders: number;
  activeCombos: number;
  allTimeRequests: number;
  allTimeTokens: number;
  uniqueModels: number;
  uniqueProviders: number;
  peakHour: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 1) return "$" + n.toFixed(3);
  return "$" + n.toFixed(2);
}

function MiniCard({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  gradient: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-bg p-4 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className={`absolute inset-0 opacity-[0.03] ${gradient}`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <Icon className="h-4 w-4 text-text-muted/60" />
          <span className="text-[10px] font-medium text-text-muted/50 uppercase tracking-widest">
            {label}
          </span>
        </div>
        <div className="mt-3 text-2xl font-bold tracking-tight text-text-main">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export default function KpiCards({ data }: { data: KpiData }) {
  const t = useTranslations("home");

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      <MiniCard
        icon={Activity}
        label={t("kpiTodayRequests")}
        value={fmt(data.todayRequests)}
        sub={`${fmt(data.weekRequests)} ${t("kpiThisWeek")}`}
        gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
      />
      <MiniCard
        icon={CheckCircle2}
        label={t("kpiSuccessRate")}
        value={`${data.successRate}%`}
        gradient={
          data.successRate >= 95
            ? "bg-gradient-to-br from-emerald-500 to-green-500"
            : "bg-gradient-to-br from-amber-500 to-orange-500"
        }
      />
      <MiniCard
        icon={Timer}
        label={t("kpiAvgLatency")}
        value={data.avgLatencyMs > 0 ? `${data.avgLatencyMs}ms` : "—"}
        sub={data.peakHour !== "—" ? `${t("kpiPeakHour")}: ${data.peakHour}` : undefined}
        gradient="bg-gradient-to-br from-violet-500 to-purple-500"
      />
      <MiniCard
        icon={DollarSign}
        label={t("kpiMonthlyCost")}
        value={fmtCost(data.monthlyCost)}
        gradient="bg-gradient-to-br from-amber-500 to-yellow-500"
      />
      <MiniCard
        icon={Zap}
        label={t("kpiTokensToday")}
        value={fmt(data.todayTokens)}
        sub={`${fmt(data.weekTokens)} ${t("kpiThisWeek")}`}
        gradient="bg-gradient-to-br from-pink-500 to-rose-500"
      />
      <MiniCard
        icon={Database}
        label={t("kpiAllTime")}
        value={fmt(data.allTimeRequests)}
        sub={`${fmt(data.allTimeTokens)} tokens`}
        gradient="bg-gradient-to-br from-indigo-500 to-blue-500"
      />
      <MiniCard
        icon={TrendingUp}
        label={t("kpiModels")}
        value={data.uniqueModels.toString()}
        sub={`${data.uniqueProviders} ${t("kpiProviderCount")}`}
        gradient="bg-gradient-to-br from-teal-500 to-emerald-500"
      />
      <MiniCard
        icon={Layers}
        label={t("kpiInfra")}
        value={`${data.connectedProviders}/${data.activeCombos}`}
        sub={t("kpiInfraSub")}
        gradient="bg-gradient-to-br from-orange-500 to-red-500"
      />
    </div>
  );
}
