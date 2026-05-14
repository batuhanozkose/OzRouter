"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "bootstrap-banner-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function shouldShowBootstrapBanner(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const ts = Number(raw);
    return Date.now() - ts >= DISMISS_DURATION_MS;
  } catch {
    return true;
  }
}

/**
 * Shown when OzRouter was started with auto-generated secrets (zero-config mode).
 * Dismissible — stays hidden for 7 days via localStorage.
 */
export default function BootstrapBanner() {
  const t = useTranslations("bootstrap");
  const [visible, setVisible] = useState(shouldShowBootstrapBanner);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      /* quota */
    }
  };

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4"
    >
      <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-300">{t("title")}</p>
        <p className="mt-0.5 text-amber-200/80">
          {t.rich("description", {
            dataDir: (chunks) => (
              <code className="font-mono bg-amber-500/20 px-1 rounded text-xs">{chunks}</code>
            ),
            jwtSecret: (chunks) => (
              <code className="font-mono bg-amber-500/20 px-1 rounded text-xs">{chunks}</code>
            ),
            storageKey: (chunks) => (
              <code className="font-mono bg-amber-500/20 px-1 rounded text-xs">{chunks}</code>
            ),
          })}
        </p>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors ml-1"
        aria-label={t("dismiss")}
      >
        ✕
      </button>
    </div>
  );
}
