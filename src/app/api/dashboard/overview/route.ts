import { NextResponse } from "next/server";
import { getDbInstance } from "@/lib/db/core";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type JsonRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

/**
 * GET /api/dashboard/overview
 * Aggregated dashboard data: KPIs, hourly chart, daily trend, top models, recent requests, token breakdown
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const db = getDbInstance();

    // --- Time boundaries ---
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekISO = weekStart.toISOString();

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthISO = monthStart.toISOString();

    // --- KPIs (today) ---
    const todayStats = db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END) as successes,
          ROUND(AVG(duration)) as avgLatency,
          COALESCE(SUM(tokens_in), 0) as tokensIn,
          COALESCE(SUM(tokens_out), 0) as tokensOut
        FROM call_logs WHERE timestamp >= ?`
      )
      .get(todayISO) as JsonRecord | undefined;

    const weekStats = db
      .prepare(
        `SELECT COUNT(*) as total,
          SUM(CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END) as successes,
          COALESCE(SUM(tokens_in), 0) as tokensIn,
          COALESCE(SUM(tokens_out), 0) as tokensOut
        FROM call_logs WHERE timestamp >= ?`
      )
      .get(weekISO) as JsonRecord | undefined;

    const allTimeStats = db
      .prepare(
        `SELECT COUNT(*) as total,
          COALESCE(SUM(tokens_in + tokens_out), 0) as totalTokens,
          COUNT(DISTINCT model) as uniqueModels,
          COUNT(DISTINCT provider) as uniqueProviders
        FROM call_logs WHERE provider IS NOT NULL AND provider != '-'`
      )
      .get() as JsonRecord | undefined;

    const todayTotal = toNumber(todayStats?.total);
    const todaySuccesses = toNumber(todayStats?.successes);
    const successRate =
      todayTotal > 0 ? Math.round((todaySuccesses / todayTotal) * 1000) / 10 : 100;

    // --- Monthly cost estimate ---
    let monthlyCost = 0;
    try {
      const { getPricing } = await import("@/lib/db/settings");
      const { computeCostFromPricing, normalizeModelName } =
        await import("@/lib/usage/costCalculator");
      const pricingByProvider = (await getPricing()) as Record<string, Record<string, any>>;
      const costRows = db
        .prepare(
          `SELECT provider, model,
            COALESCE(tokens_in, 0) as tokens_in,
            COALESCE(tokens_out, 0) as tokens_out,
            COALESCE(tokens_cache_read, 0) as tokens_cache_read,
            COALESCE(tokens_reasoning, 0) as tokens_reasoning
          FROM call_logs WHERE timestamp >= ? AND provider IS NOT NULL`
        )
        .all(monthISO) as JsonRecord[];
      for (const row of costRows) {
        const provider = toStr(row.provider);
        const model = normalizeModelName(toStr(row.model));
        const pricing = pricingByProvider?.[provider]?.[model];
        if (!pricing) continue;
        monthlyCost += computeCostFromPricing(pricing, {
          input: toNumber(row.tokens_in),
          output: toNumber(row.tokens_out),
          cacheRead: toNumber(row.tokens_cache_read),
          reasoning: toNumber(row.tokens_reasoning),
        });
      }
    } catch {
      // pricing not available
    }

    // --- Hourly chart (last 24h) ---
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hourlyRows = db
      .prepare(
        `SELECT
          strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
          COUNT(*) as requests,
          SUM(CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as failures,
          COALESCE(SUM(tokens_in + tokens_out), 0) as tokens
        FROM call_logs WHERE timestamp >= ?
        GROUP BY strftime('%Y-%m-%dT%H:00:00', timestamp) ORDER BY hour ASC`
      )
      .all(oneDayAgo) as JsonRecord[];

    // --- Daily trend (last 14 days) ---
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const dailyRows = db
      .prepare(
        `SELECT
          DATE(timestamp) as date,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_in + tokens_out), 0) as tokens,
          ROUND(AVG(duration)) as avgLatency,
          SUM(CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END) as successes
        FROM call_logs WHERE timestamp >= ?
        GROUP BY DATE(timestamp) ORDER BY date ASC`
      )
      .all(twoWeeksAgo.toISOString()) as JsonRecord[];

    // --- Top models (by request count, last 7 days) ---
    const modelRows = db
      .prepare(
        `SELECT
          model, provider,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_in), 0) as tokensIn,
          COALESCE(SUM(tokens_out), 0) as tokensOut,
          ROUND(AVG(duration)) as avgLatency,
          ROUND(SUM(CASE WHEN status >= 200 AND status < 400 THEN 1.0 ELSE 0 END) * 100.0 / COUNT(*), 1) as successRate
        FROM call_logs
        WHERE timestamp >= ? AND model IS NOT NULL AND model != ''
        GROUP BY model, provider ORDER BY requests DESC LIMIT 8`
      )
      .all(weekISO) as JsonRecord[];

    // --- Top providers (by request count, last 7 days) ---
    const providerRows = db
      .prepare(
        `SELECT
          provider,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_in + tokens_out), 0) as tokens,
          ROUND(AVG(duration)) as avgLatency,
          ROUND(SUM(CASE WHEN status >= 200 AND status < 400 THEN 1.0 ELSE 0 END) * 100.0 / COUNT(*), 1) as successRate
        FROM call_logs
        WHERE timestamp >= ? AND provider IS NOT NULL AND provider != '-'
        GROUP BY provider ORDER BY requests DESC LIMIT 6`
      )
      .all(weekISO) as JsonRecord[];

    // --- Recent requests (last 8) ---
    const recentRows = db
      .prepare(
        `SELECT id, model, provider, status, duration, timestamp
        FROM call_logs ORDER BY timestamp DESC LIMIT 8`
      )
      .all() as JsonRecord[];

    // --- Token breakdown (input vs output vs cache, this week) ---
    const tokenBreakdown = db
      .prepare(
        `SELECT
          COALESCE(SUM(tokens_in), 0) as input,
          COALESCE(SUM(tokens_out), 0) as output,
          COALESCE(SUM(tokens_cache_read), 0) as cacheRead,
          COALESCE(SUM(tokens_reasoning), 0) as reasoning
        FROM call_logs WHERE timestamp >= ?`
      )
      .get(weekISO) as JsonRecord | undefined;

    // --- Connected providers + combos count ---
    let connectedProviders = 0;
    let activeCombos = 0;
    try {
      const pc = db
        .prepare(`SELECT COUNT(*) as cnt FROM provider_connections WHERE is_active = 1`)
        .get() as JsonRecord | undefined;
      connectedProviders = toNumber(pc?.cnt);
    } catch {}
    try {
      const cc = db.prepare(`SELECT COUNT(*) as cnt FROM combos WHERE is_active = 1`).get() as
        | JsonRecord
        | undefined;
      activeCombos = toNumber(cc?.cnt);
    } catch {}

    // --- Peak hour ---
    let peakHour = "—";
    if (hourlyRows.length > 0) {
      const peak = hourlyRows.reduce((a, b) =>
        toNumber(a.requests) > toNumber(b.requests) ? a : b
      );
      try {
        const d = new Date(toStr(peak.hour));
        peakHour = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      } catch {}
    }

    return NextResponse.json({
      kpi: {
        todayRequests: todayTotal,
        todayTokens: toNumber(todayStats?.tokensIn) + toNumber(todayStats?.tokensOut),
        weekRequests: toNumber(weekStats?.total),
        weekTokens: toNumber(weekStats?.tokensIn) + toNumber(weekStats?.tokensOut),
        successRate,
        avgLatencyMs: toNumber(todayStats?.avgLatency),
        monthlyCost,
        connectedProviders,
        activeCombos,
        allTimeRequests: toNumber(allTimeStats?.total),
        allTimeTokens: toNumber(allTimeStats?.totalTokens),
        uniqueModels: toNumber(allTimeStats?.uniqueModels),
        uniqueProviders: toNumber(allTimeStats?.uniqueProviders),
        peakHour,
      },
      hourlyChart: hourlyRows.map((r) => ({
        hour: toStr(r.hour),
        requests: toNumber(r.requests),
        successes: toNumber(r.successes),
        failures: toNumber(r.failures),
        tokens: toNumber(r.tokens),
      })),
      dailyTrend: dailyRows.map((r) => ({
        date: toStr(r.date),
        requests: toNumber(r.requests),
        tokens: toNumber(r.tokens),
        avgLatency: toNumber(r.avgLatency),
        successes: toNumber(r.successes),
      })),
      topModels: modelRows.map((r) => ({
        model: toStr(r.model),
        provider: toStr(r.provider),
        requests: toNumber(r.requests),
        tokensIn: toNumber(r.tokensIn),
        tokensOut: toNumber(r.tokensOut),
        avgLatency: toNumber(r.avgLatency),
        successRate: toNumber(r.successRate),
      })),
      topProviders: providerRows.map((r) => ({
        provider: toStr(r.provider),
        requests: toNumber(r.requests),
        tokens: toNumber(r.tokens),
        avgLatency: toNumber(r.avgLatency),
        successRate: toNumber(r.successRate),
      })),
      recentRequests: recentRows.map((r) => ({
        id: toStr(r.id),
        model: toStr(r.model),
        provider: toStr(r.provider),
        status: toNumber(r.status),
        duration: toNumber(r.duration),
        timestamp: toStr(r.timestamp),
      })),
      tokenBreakdown: {
        input: toNumber(tokenBreakdown?.input),
        output: toNumber(tokenBreakdown?.output),
        cacheRead: toNumber(tokenBreakdown?.cacheRead),
        reasoning: toNumber(tokenBreakdown?.reasoning),
      },
    });
  } catch (error) {
    console.error("[dashboard/overview] Error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard overview" }, { status: 500 });
  }
}
