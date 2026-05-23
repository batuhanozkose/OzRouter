"use client";

import { Card, Button } from "@/shared/components";
import { useTranslations } from "next-intl";

interface InstallProgressModalProps {
  open: boolean;
  output: string | null;
  error: string | null;
  installing?: boolean;
  onClose: () => void;
}

export default function InstallProgressModal({
  open,
  output,
  error,
  installing = false,
  onClose,
}: InstallProgressModalProps) {
  const t = useTranslations("cliTools");

  if (!open) return null;

  const failed = !!error || !!output?.includes("OZROUTER_INSTALL_STATUS=failed");
  const done = !installing && (output || error);
  const title = installing ? t("installing") : failed ? t("installFailed") : t("installComplete");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            disabled={installing}
            className="text-text-muted hover:text-text-main disabled:opacity-40"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
            {installing ? (
              <>
                <div className="w-6 h-6 border-2 border-primary/20 rounded-full border-t-primary animate-spin" />
                <span className="text-sm text-text-muted">{t("installingPackage")}</span>
              </>
            ) : failed ? (
              <>
                <span className="material-symbols-outlined text-red-500 text-[22px]">error</span>
                <span className="text-sm text-red-500">{t("installFailed")}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-green-500 text-[22px]">
                  check_circle
                </span>
                <span className="text-sm text-green-500">{t("installSuccess")}</span>
              </>
            )}
          </div>

          {(output || error || installing) && (
            <pre className="p-3 bg-black/10 dark:bg-white/5 rounded-lg text-xs font-mono text-text-main max-h-80 overflow-auto whitespace-pre-wrap">
              {output || error}
            </pre>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose} disabled={installing}>
              {t("close")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
