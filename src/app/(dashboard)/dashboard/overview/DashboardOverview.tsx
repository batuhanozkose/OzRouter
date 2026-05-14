"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { RefreshCw, Copy, Check, Globe } from "lucide-react";
import KpiCards from "./KpiCards";
import RequestChart from "./RequestChart";
import TopModels from "./TopModels";
import TokenBreakdown from "./TokenBreakdown";
import RecentRequests from "./RecentRequests";

/* --- Types --- */
interface DashboardData {
  kpi: {
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
  };
  hourlyChart: Array<{
    hour: string;
    requests: number;
    successes: number;
    failures: number;
    tokens: number;
  }>;
  dailyTrend: Array<{
    date: string;
    requests: number;
    tokens: number;
    avgLatency: number;
    successes: number;
  }>;
  topModels: Array<{
    model: string;
    provider: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
    avgLatency: number;
    successRate: number;
  }>;
  topProviders: Array<{
    provider: string;
    requests: number;
    tokens: number;
    avgLatency: number;
    successRate: number;
  }>;
  recentRequests: Array<{
    id: string;
    model: string;
    provider: string;
    status: number;
    duration: number;
    timestamp: string;
  }>;
  tokenBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    reasoning: number;
  };
}

const REFRESH_INTERVAL = 30_000;
const emptySubscribe = () => () => {};

function useOrigin() {
  return useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => ""
  );
}

/* --- Endpoint copy bar --- */
function EndpointBar() {
  const t = useTranslations("home");
  const origin = useOrigin();
  const endpoint = origin ? `${origin}/v1` : "/v1";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const links = [
    { href: "/dashboard/providers", label: t("linkProviders") },
    { href: "/dashboard/combos", label: t("linkCombos") },
    { href: "/dashboard/logs", label: t("linkLogs") },
    { href: "/dashboard/analytics", label: t("linkAnalytics") },
    { href: "/dashboard/settings", label: t("linkSettings") },
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        onClick={copy}
        className="group flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left transition-all hover:border-primary/30"
      >
        <Globe className="h-3.5 w-3.5 shrink-0 text-text-muted/40" />
        <code className="flex-1 truncate text-xs text-text-muted">{endpoint}</code>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-text-muted/30 transition-colors group-hover:text-text-main" />
        )}
      </button>
      <div className="flex gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-[11px] font-medium text-text-muted transition-all hover:border-primary/30 hover:text-primary"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* --- Skeleton --- */
function DashboardSkeleton() {
  const t = useTranslations("home");
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <div className="h-6 w-32 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border bg-bg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 h-[280px] animate-pulse rounded-xl border border-border bg-bg" />
        <div className="lg:col-span-2 h-[280px] animate-pulse rounded-xl border border-border bg-bg" />
      </div>
    </div>
  );
}

/* --- Main --- */
export default function DashboardOverview({ machineId }: { machineId: string }) {
  const t = useTranslations("home");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const res = await fetch("/api/dashboard/overview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to fetch");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="mt-3 text-xs text-text-muted hover:text-text-main transition-colors"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-main tracking-tight">{t("dashboardTitle")}</h1>
          {lastUpdated && (
            <p className="text-[10px] text-text-muted/40 tabular-nums">
              {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition-all hover:border-primary/30 hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {t("refresh")}
        </button>
      </div>

      {/* KPI Cards */}
      <KpiCards data={data.kpi} />

      {/* Row 2: Chart + Token Breakdown */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RequestChart hourly={data.hourlyChart} daily={data.dailyTrend} />
        </div>
        <div className="lg:col-span-2">
          <TokenBreakdown tokens={data.tokenBreakdown} providers={data.topProviders} />
        </div>
      </div>

      {/* Row 3: Top Models + Recent Requests */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopModels data={data.topModels} />
        </div>
        <div className="lg:col-span-2">
          <RecentRequests data={data.recentRequests} />
        </div>
      </div>

      {/* Endpoint + Quick Access */}
      <EndpointBar />
    </div>
  );
}
