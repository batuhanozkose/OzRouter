"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface HourlyPoint {
  hour: string;
  requests: number;
  successes: number;
  failures: number;
  tokens: number;
}

interface DailyPoint {
  date: string;
  requests: number;
  tokens: number;
  avgLatency: number;
  successes: number;
}

function formatHour(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatDate(d: string): string {
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 font-medium text-text-main">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-text-muted">{p.name}:</span>
          <span className="font-medium text-text-main">
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RequestChart({
  hourly,
  daily,
}: {
  hourly: HourlyPoint[];
  daily: DailyPoint[];
}) {
  const t = useTranslations("home");
  const [view, setView] = useState<"24h" | "14d">("24h");

  const hasData = view === "24h" ? hourly.length > 0 : daily.length > 0;

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-main">{t("chartTitle")}</h3>
        <div className="flex gap-1 rounded-lg border border-border bg-surface/50 p-0.5">
          <button
            onClick={() => setView("24h")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
              view === "24h"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            24h
          </button>
          <button
            onClick={() => setView("14d")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
              view === "14d"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            14d
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-[200px] items-center justify-center">
          <p className="text-xs text-text-muted/60">{t("chartNoData")}</p>
        </div>
      ) : view === "24h" ? (
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={hourly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-success" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-fail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                className="fill-text-muted"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                className="fill-text-muted"
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="successes"
                name={t("chartSuccess")}
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#grad-success)"
              />
              <Area
                type="monotone"
                dataKey="failures"
                name={t("chartFailures")}
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#grad-fail)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                className="fill-text-muted"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                className="fill-text-muted"
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="requests"
                name={t("chartRequests")}
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
