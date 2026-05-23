"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Spinner } from "@/shared/components/Loading";

interface HealthPayload {
  status?: string;
  timestamp?: string;
  system?: {
    version?: string;
    uptime?: number;
    nodeVersion?: string;
    platform?: string;
    pid?: number;
    memoryUsage?: { rss?: number; heapTotal?: number; heapUsed?: number; external?: number };
  };
  version?: string;
  uptime?: number;
  memoryUsage?: { rss?: number; heapTotal?: number; heapUsed?: number; external?: number };
  providerHealth?: Record<string, { state?: string; failures?: number; lastFailure?: string | null; retryAfterMs?: number }>;
  providerSummary?: { catalogCount?: number; configuredCount?: number; activeCount?: number; monitoredCount?: number };
  circuitBreakers?: { open?: number; halfOpen?: number; closed?: number; total?: number };
  providerBreakers?: Array<{ provider: string; state: string; failureCount: number; lastFailure: string | null; retryAfterMs: number }>;
  localProviders?: Record<string, { nodeId?: string; prefix?: string; isHealthy?: boolean; lastCheck?: string; consecutiveFailures?: number; responseTimeMs?: number; lastError?: string }>;
  rateLimitStatus?: Record<string, unknown>;
  learnedLimits?: Record<string, unknown>;
  lockouts?: Record<string, unknown>;
  quotaMonitor?: { active?: number; alerting?: number; exhausted?: number; errors?: number; statusCounts?: Record<string, number>; byProvider?: Record<string, number>; monitors?: Array<{ sessionId?: string; provider?: string; accountId?: string; status?: string; lastPolledAt?: string | null; lastQuotaPercent?: number | null; lastQuotaUsed?: number | null; lastQuotaTotal?: number | null; totalPolls?: number; totalAlerts?: number; consecutiveFailures?: number }> };
  sessions?: { activeCount?: number; stickyBoundCount?: number; byApiKey?: Record<string, number>; top?: Array<{ sessionId?: string; requestCount?: number; connectionId?: string | null; ageMs?: number; idleMs?: number; createdAt?: string; lastActiveAt?: string }> };
  dedup?: { inflightRequests?: number };
  cryptography?: { status?: string; provider?: string };
  setupComplete?: boolean;
  error?: string;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return "0m";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatMs(ms?: number) {
  if (ms === undefined || ms === null) return "n/a";
  return `${ms}ms`;
}

function formatAge(ms?: number) {
  if (!ms) return "0s";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export default function StatusPage() {
  const t = useTranslations("statusPages");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/monitoring/health", { cache: "no-store" });
      const data = (await response.json()) as HealthPayload;
      if (!response.ok) {
        setError(data.error || t("statusLoadFailed"));
        setHealth(null);
        return;
      }
      setHealth(data);
    } catch {
      setError(t("statusEndpointUnreachable"));
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  const providerStats = useMemo(() => {
    const providers = Object.entries(health?.providerHealth || {});
    const open = providers.filter(([, p]) => p.state === "OPEN").length;
    const halfOpen = providers.filter(([, p]) => p.state === "HALF_OPEN").length;
    const closed = providers.filter(([, p]) => p.state === "CLOSED").length;
    return { total: providers.length, open, halfOpen, closed };
  }, [health]);

  return (
    <main className="min-h-screen bg-bg text-text-main p-6 sm:p-10">
      <section className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("systemStatus")}</h1>
            <p className="text-text-muted mt-1">{t("systemStatusDescription")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-surface text-text-main hover:bg-bg-alt transition-all duration-200"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">dashboard</span>
              {t("dashboard")}
            </Link>
            <button
              onClick={() => void loadHealth()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-primary to-primary-hover text-white transition-all duration-200"
            >
              {t("refresh")}
            </button>
          </div>
        </header>

        {loading && (
          <div
            className="rounded-xl border border-border bg-surface p-6 flex items-center gap-3"
            role="status"
            aria-live="polite"
          >
            <Spinner size="md" />
            <span className="text-text-muted">{t("loadingHealthMetrics")}</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6" role="alert">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
              {t("healthCheckFailed")}
            </h2>
            <p className="mt-2 text-sm text-text-muted">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/offline"
                className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-bg-alt transition-colors"
              >
                {t("openConnectivityHelp")}
              </Link>
              <Link
                href="/maintenance"
                className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-bg-alt transition-colors"
              >
                {t("maintenanceInfo")}
              </Link>
            </div>
          </div>
        )}

        {!loading && health && (
          <>
            {/* ── Quick Overview Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{t("service")}</p>
                <p className="mt-2 text-xl font-semibold flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${health.status === "healthy" ? "bg-green-500" : "bg-red-500"}`} />
                  {health.status || "unknown"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{t("version")}</p>
                <p className="mt-2 text-xl font-semibold">{health.system?.version || health.version || "n/a"}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{t("uptime")}</p>
                <p className="mt-2 text-xl font-semibold">{formatUptime(health.system?.uptime ?? health.uptime)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{t("providersTracked")}</p>
                <p className="mt-2 text-xl font-semibold">{providerStats.total}</p>
              </div>
            </div>

            {/* ── Provider Summary ── */}
            {health.providerSummary && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("providerSummary")}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-primary">{health.providerSummary.catalogCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("configured")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-green-500">{health.providerSummary.configuredCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("active")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-cyan-400">{health.providerSummary.activeCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("monitored")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-purple-400">{health.providerSummary.monitoredCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("providersTracked")}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── System Resources ── */}
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold mb-3">{t("systemResources")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-bg-alt">
                  <p className="text-xs text-text-muted">{t("nodeVersion")}</p>
                  <p className="text-sm font-mono mt-1">{health.system?.nodeVersion || "n/a"}</p>
                </div>
                <div className="p-3 rounded-lg bg-bg-alt">
                  <p className="text-xs text-text-muted">{t("platform")}</p>
                  <p className="text-sm font-mono mt-1">{health.system?.platform || "n/a"}</p>
                </div>
                <div className="p-3 rounded-lg bg-bg-alt">
                  <p className="text-xs text-text-muted">{t("pid")}</p>
                  <p className="text-sm font-mono mt-1">{health.system?.pid ?? "n/a"}</p>
                </div>
                <div className="p-3 rounded-lg bg-bg-alt">
                  <p className="text-xs text-text-muted">{t("memoryUsage")}</p>
                  <p className="text-sm font-mono mt-1">
                    {health.system?.memoryUsage || health.memoryUsage
                      ? formatBytes((health.system?.memoryUsage || health.memoryUsage)?.rss)
                      : "n/a"}
                  </p>
                </div>
              </div>
              {(health.system?.memoryUsage || health.memoryUsage) && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="text-center text-xs text-text-muted">
                    Heap: {formatBytes((health.system?.memoryUsage || health.memoryUsage)?.heapUsed)} / {formatBytes((health.system?.memoryUsage || health.memoryUsage)?.heapTotal)}
                  </div>
                  <div className="text-center text-xs text-text-muted">
                    RSS: {formatBytes((health.system?.memoryUsage || health.memoryUsage)?.rss)}
                  </div>
                  <div className="text-center text-xs text-text-muted">
                    External: {formatBytes((health.system?.memoryUsage || health.memoryUsage)?.external)}
                  </div>
                </div>
              )}
            </div>

            {/* ── Circuit Breaker Summary + Rate Limits + Quota Monitor ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("circuitBreakerSummary")}</h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />{t("open")}</span>
                    <span className="font-mono font-bold text-red-400">{health.circuitBreakers?.open ?? providerStats.open}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />{t("halfOpen")}</span>
                    <span className="font-mono font-bold text-yellow-400">{health.circuitBreakers?.halfOpen ?? providerStats.halfOpen}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />{t("closed")}</span>
                    <span className="font-mono font-bold text-green-400">{health.circuitBreakers?.closed ?? providerStats.closed}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                    <span className="text-text-muted">{t("total")}</span>
                    <span className="font-mono font-bold">{health.circuitBreakers?.total ?? providerStats.total}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("rateLimitSummary")}</h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">{t("accountsLimited")}</span>
                    <span className="font-mono font-bold">{Object.keys(health.rateLimitStatus || {}).length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">{t("learnedLimits")}</span>
                    <span className="font-mono font-bold">{Object.keys(health.learnedLimits || {}).length}</span>
                  </div>
                </div>
                {health.dedup && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">{t("activeSessions")}</span>
                      <span className="font-mono font-bold">{health.dedup.inflightRequests ?? 0}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("quotaMonitor")}</h2>
                {health.quotaMonitor ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">{t("active")}</span>
                      <span className="font-mono font-bold text-cyan-400">{health.quotaMonitor.active ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">{t("alerting")}</span>
                      <span className="font-mono font-bold text-yellow-400">{health.quotaMonitor.alerting ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">{t("exhausted")}</span>
                      <span className="font-mono font-bold text-red-400">{health.quotaMonitor.exhausted ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">{t("errors")}</span>
                      <span className="font-mono font-bold text-red-400">{health.quotaMonitor.errors ?? 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">{t("none")}</p>
                )}
              </div>
            </div>

            {/* ── Active Sessions ── */}
            {health.sessions && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("activeSessions")}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-cyan-400">{health.sessions.activeCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("active")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-bg-alt">
                    <p className="text-2xl font-bold text-purple-400">{health.sessions.stickyBoundCount ?? 0}</p>
                    <p className="text-xs text-text-muted mt-1">{t("stickyBound")}</p>
                  </div>
                </div>
                {health.sessions.top && health.sessions.top.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-text-muted mb-2">{t("topSessions")}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-text-muted border-b border-border">
                            <th className="text-left py-1.5 px-2">{t("sessionId")}</th>
                            <th className="text-right py-1.5 px-2">{t("requests")}</th>
                            <th className="text-right py-1.5 px-2">{t("age")}</th>
                            <th className="text-right py-1.5 px-2">{t("idle")}</th>
                            <th className="text-left py-1.5 px-2">{t("connectionId")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {health.sessions.top.map((s, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-bg-alt">
                              <td className="py-1.5 px-2 font-mono">{s.sessionId?.slice(0, 12)}</td>
                              <td className="py-1.5 px-2 text-right font-mono">{s.requestCount}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-text-muted">{formatAge(s.ageMs)}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-text-muted">{s.idleMs !== undefined ? formatAge(s.idleMs) : "n/a"}</td>
                              <td className="py-1.5 px-2 font-mono text-text-muted">{s.connectionId || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Setup + Cryptography Status ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("cryptography")}</h2>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${
                    health.cryptography?.status === "healthy"
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {health.cryptography?.status === "healthy" ? t("healthy") : t("missingOrInvalid")}
                  </span>
                  <span className="text-sm text-text-muted">{t("encryptionKey")}</span>
                </div>
                {health.cryptography?.provider && (
                  <p className="mt-2 text-xs text-text-muted">Provider: {health.cryptography.provider}</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("setupStatus")}</h2>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${
                    health.setupComplete
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                  }`}>
                    {health.setupComplete ? t("completed") : t("notCompleted")}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Provider Circuit Breaker Detail ── */}
            {health.providerBreakers && health.providerBreakers.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("providerHealth")}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-border">
                        <th className="text-left py-1.5 px-2">{t("provider")}</th>
                        <th className="text-left py-1.5 px-2">{t("status")}</th>
                        <th className="text-right py-1.5 px-2">{t("failures")}</th>
                        <th className="text-right py-1.5 px-2">{t("retryAfter")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.providerBreakers.map((cb) => (
                        <tr key={cb.provider} className="border-b border-border/50 hover:bg-bg-alt">
                          <td className="py-1.5 px-2 font-medium">{cb.provider}</td>
                          <td className="py-1.5 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              cb.state === "OPEN" ? "bg-red-500/10 text-red-400" :
                              cb.state === "HALF_OPEN" ? "bg-yellow-500/10 text-yellow-400" :
                              "bg-green-500/10 text-green-400"
                            }`}>{cb.state}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{cb.failureCount || 0}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-muted">{cb.retryAfterMs ? formatMs(cb.retryAfterMs) : t("neverFailed")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Local Provider Health ── */}
            {health.localProviders && Object.keys(health.localProviders).length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("localProviders")}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-border">
                        <th className="text-left py-1.5 px-2">{t("prefix")}</th>
                        <th className="text-left py-1.5 px-2">{t("status")}</th>
                        <th className="text-right py-1.5 px-2">{t("failures")}</th>
                        <th className="text-right py-1.5 px-2">{t("responseTime")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(health.localProviders).map(([id, lp]) => (
                        <tr key={id} className="border-b border-border/50 hover:bg-bg-alt">
                          <td className="py-1.5 px-2 font-mono">{lp.prefix || id}</td>
                          <td className="py-1.5 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              lp.isHealthy ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                            }`}>{lp.isHealthy ? t("healthy") : t("unhealthy")}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{lp.consecutiveFailures ?? 0}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-muted">{lp.responseTimeMs ? formatMs(lp.responseTimeMs) : "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Account Lockouts ── */}
            {health.lockouts && Object.keys(health.lockouts).length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("lockouts")}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-border">
                        <th className="text-left py-1.5 px-2">{t("provider")}</th>
                        <th className="text-left py-1.5 px-2">{t("models")}</th>
                        <th className="text-left py-1.5 px-2">{t("accounts")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(health.lockouts).map(([provider, models]: [string, any]) => {
                        const modelEntries = typeof models === "object" && models !== null ? Object.entries(models) : [];
                        return modelEntries.length > 0 ? modelEntries.map(([model, accounts]: [string, any]) => (
                          <tr key={`${provider}-${model}`} className="border-b border-border/50 hover:bg-bg-alt">
                            <td className="py-1.5 px-2 font-mono">{provider}</td>
                            <td className="py-1.5 px-2 font-mono text-text-muted">{model}</td>
                            <td className="py-1.5 px-2 font-mono">{Array.isArray(accounts) ? accounts.length : 1}</td>
                          </tr>
                        )) : (
                          <tr key={provider} className="border-b border-border/50 hover:bg-bg-alt">
                            <td className="py-1.5 px-2 font-mono">{provider}</td>
                            <td className="py-1.5 px-2 font-mono text-text-muted">—</td>
                            <td className="py-1.5 px-2 font-mono">1</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Quota Monitor Detail ── */}
            {health.quotaMonitor?.monitors && health.quotaMonitor.monitors.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold mb-3">{t("quotaMonitorActive")}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-border">
                        <th className="text-left py-1.5 px-2">{t("provider")}</th>
                        <th className="text-left py-1.5 px-2">{t("accountId") || "Account"}</th>
                        <th className="text-left py-1.5 px-2">{t("status")}</th>
                        <th className="text-right py-1.5 px-2">{t("quotaPercent")}</th>
                        <th className="text-right py-1.5 px-2">{t("polls")}</th>
                        <th className="text-left py-1.5 px-2">{t("lastPolled")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.quotaMonitor.monitors.map((m, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-bg-alt">
                          <td className="py-1.5 px-2 font-mono">{m.provider || "—"}</td>
                          <td className="py-1.5 px-2 font-mono text-text-muted">{m.accountId || "—"}</td>
                          <td className="py-1.5 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              m.status === "healthy" ? "bg-green-500/10 text-green-400" :
                              m.status === "warning" ? "bg-yellow-500/10 text-yellow-400" :
                              m.status === "exhausted" || m.status === "error" ? "bg-red-500/10 text-red-400" :
                              "bg-gray-500/10 text-gray-400"
                            }`}>{m.status || t("none")}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {m.lastQuotaPercent !== null && m.lastQuotaPercent !== undefined
                              ? `${m.lastQuotaPercent.toFixed(1)}%`
                              : "n/a"}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-muted">{m.totalPolls ?? 0}</td>
                          <td className="py-1.5 px-2 font-mono text-text-muted">
                            {m.lastPolledAt ? new Date(m.lastPolledAt).toLocaleTimeString() : t("never")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Last Update ── */}
            <div className="text-center text-xs text-text-muted pb-6">
              {t("lastUpdate")}: {health.timestamp ? new Date(health.timestamp).toLocaleString() : "n/a"}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
