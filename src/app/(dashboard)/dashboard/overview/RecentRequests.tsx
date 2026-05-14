"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

interface RecentRequest {
  id: string;
  model: string;
  provider: string;
  status: number;
  duration: number;
  timestamp: string;
}

function StatusDot({ status }: { status: number }) {
  const isOk = status >= 200 && status < 400;
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        isOk
          ? "bg-emerald-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"
          : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]"
      }`}
    />
  );
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "now";
    if (diff < 3600_000) return Math.floor(diff / 60_000) + "m";
    if (diff < 86400_000) return Math.floor(diff / 3600_000) + "h";
    return Math.floor(diff / 86400_000) + "d";
  } catch {
    return "—";
  }
}

function shortModel(model: string): string {
  const parts = model.split("/");
  const name = parts.length > 1 ? parts[parts.length - 1] : model;
  return name.length > 22 ? name.slice(0, 20) + "…" : name;
}

export default function RecentRequests({ data }: { data: RecentRequest[] }) {
  const t = useTranslations("home");

  if (!data.length) {
    return (
      <div className="rounded-xl border border-border bg-bg p-4">
        <h3 className="text-sm font-semibold text-text-main">{t("recentRequestsTitle")}</h3>
        <p className="mt-6 text-center text-xs text-text-muted/60">{t("recentRequestsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-main">{t("recentRequestsTitle")}</h3>
        <Link
          href="/dashboard/logs"
          className="text-[11px] text-text-muted/60 transition-colors hover:text-primary"
        >
          {t("viewAll")} →
        </Link>
      </div>
      <div className="space-y-0.5">
        {data.map((req) => (
          <div
            key={req.id}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-surface/80"
          >
            <StatusDot status={req.status} />
            <span className="flex-1 truncate font-mono text-xs text-text-main">
              {shortModel(req.model)}
            </span>
            <span className="hidden rounded bg-surface/80 px-1.5 py-0.5 text-[9px] text-text-muted sm:inline">
              {req.provider}
            </span>
            <span className="min-w-[44px] text-right text-xs tabular-nums text-text-muted">
              {req.duration > 0 ? `${req.duration}ms` : "—"}
            </span>
            <span className="w-8 text-right text-[10px] tabular-nums text-text-muted/40">
              {timeAgo(req.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
