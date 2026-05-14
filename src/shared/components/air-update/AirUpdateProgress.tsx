"use client";

import { useTranslations } from "next-intl";
import { useAirUpdate, AirUpdatePhase, AirUpdateStep } from "./AirUpdateContext";
import Button from "../Button";

// ---------------------------------------------------------------------------
// Phase metadata for progress visualization
// ---------------------------------------------------------------------------

type PhaseConfig = {
  labelKey: string;
  icon: string;
  descriptionKey: string;
};

type AirUpdateTranslator = ReturnType<typeof useTranslations>;

const PHASE_CONFIG: Record<AirUpdatePhase, PhaseConfig> = {
  idle: { labelKey: "phaseReady", icon: "check_circle", descriptionKey: "phaseReadyDescription" },
  checking: {
    labelKey: "phaseChecking",
    icon: "search",
    descriptionKey: "phaseCheckingDescription",
  },
  backup: {
    labelKey: "phaseBackup",
    icon: "backup",
    descriptionKey: "phaseBackupDescription",
  },
  updating: {
    labelKey: "phaseDownloading",
    icon: "cloud_download",
    descriptionKey: "phaseDownloadingDescription",
  },
  installing: {
    labelKey: "phaseInstalling",
    icon: "package_2",
    descriptionKey: "phaseInstallingDescription",
  },
  rebuilding: {
    labelKey: "phaseBuilding",
    icon: "build",
    descriptionKey: "phaseBuildingDescription",
  },
  restarting: {
    labelKey: "phaseRestarting",
    icon: "restart_alt",
    descriptionKey: "phaseRestartingDescription",
  },
  done: {
    labelKey: "phaseComplete",
    icon: "check_circle",
    descriptionKey: "phaseCompleteDescription",
  },
  failed: {
    labelKey: "phaseFailed",
    icon: "error",
    descriptionKey: "phaseFailedDescription",
  },
};

// Ordered phases for the stepper
const PHASE_ORDER: AirUpdatePhase[] = [
  "backup",
  "updating",
  "installing",
  "rebuilding",
  "restarting",
  "done",
];

// ---------------------------------------------------------------------------
// Step indicator component
// ---------------------------------------------------------------------------

function StepIndicator({
  phaseKey,
  currentPhase,
  t,
}: {
  phaseKey: AirUpdatePhase;
  currentPhase: AirUpdatePhase;
  t: AirUpdateTranslator;
}) {
  const config = PHASE_CONFIG[phaseKey];
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  const stepIndex = PHASE_ORDER.indexOf(phaseKey);
  const isFailed = currentPhase === "failed";

  let status: "pending" | "active" | "done" | "failed" = "pending";
  if (isFailed && stepIndex === currentIndex) {
    status = "failed";
  } else if (stepIndex < currentIndex || currentPhase === "done") {
    status = "done";
  } else if (stepIndex === currentIndex) {
    status = "active";
  }

  return (
    <div className="flex items-center gap-3">
      {/* Icon circle */}
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
          status === "done"
            ? "bg-green-500/15 text-green-500"
            : status === "active"
              ? "bg-primary/15 text-primary"
              : status === "failed"
                ? "bg-red-500/15 text-red-500"
                : "bg-surface text-text-muted"
        }`}
      >
        {status === "done" ? (
          <span className="material-symbols-outlined text-[20px]">check</span>
        ) : status === "active" ? (
          <span className="material-symbols-outlined text-[20px] animate-spin">
            progress_activity
          </span>
        ) : status === "failed" ? (
          <span className="material-symbols-outlined text-[20px]">close</span>
        ) : (
          <span className="material-symbols-outlined text-[18px]">{config.icon}</span>
        )}
      </div>

      {/* Label */}
      <div className="flex flex-col min-w-0">
        <span
          className={`text-sm font-medium transition-colors ${
            status === "done"
              ? "text-green-500"
              : status === "active"
                ? "text-text-main"
                : status === "failed"
                  ? "text-red-500"
                  : "text-text-muted"
          }`}
        >
          {t(config.labelKey)}
        </span>
        {status === "active" && (
          <span className="text-xs text-text-muted">{t(config.descriptionKey)}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step log
// ---------------------------------------------------------------------------

function StepLog({ steps }: { steps: AirUpdateStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-border bg-black/5 dark:bg-white/5 p-3 font-mono text-xs custom-scrollbar">
      {steps.map((s, i) => (
        <div key={`${s.step}-${i}`} className="flex items-start gap-2 py-0.5">
          <span
            className={`shrink-0 ${
              s.status === "done"
                ? "text-green-500"
                : s.status === "failed"
                  ? "text-red-500"
                  : s.status === "skipped"
                    ? "text-amber-500"
                    : "text-primary"
            }`}
          >
            {s.status === "done"
              ? "✓"
              : s.status === "failed"
                ? "✗"
                : s.status === "skipped"
                  ? "−"
                  : "›"}
          </span>
          <span className="text-text-secondary break-all">{s.message}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Progress Overlay
// ---------------------------------------------------------------------------

export default function AirUpdateProgress() {
  const t = useTranslations("airUpdate");
  const { phase, steps, progressVisible, closeProgress, versionInfo } = useAirUpdate();

  if (!progressVisible) return null;

  const isDone = phase === "done";
  const isFailed = phase === "failed";
  const canClose = isDone || isFailed;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="rounded-2xl border border-border bg-bg p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className={`flex size-12 items-center justify-center rounded-xl ${
                isDone ? "bg-green-500/15" : isFailed ? "bg-red-500/15" : "bg-primary/15"
              }`}
            >
              <span
                className={`material-symbols-outlined text-2xl ${
                  isDone ? "text-green-500" : isFailed ? "text-red-500" : "text-primary"
                }`}
              >
                {isDone ? "check_circle" : isFailed ? "error" : "cloud_download"}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-main">
                {isDone ? t("completeTitle") : isFailed ? t("failedTitle") : t("updatingTitle")}
              </h2>
              <p className="text-sm text-text-muted">
                {isDone
                  ? t("updatedReloading", { version: versionInfo?.latest ?? "" })
                  : isFailed
                    ? t("failedDescription")
                    : t("updatingTo", { version: versionInfo?.latest ?? "" })}
              </p>
            </div>
          </div>

          {/* Phase stepper */}
          <div className="space-y-3">
            {PHASE_ORDER.map((p) => (
              <StepIndicator key={p} phaseKey={p} currentPhase={phase} t={t} />
            ))}
          </div>

          {/* Data safety badge */}
          {!isDone && !isFailed && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/5 px-3 py-2 border border-green-500/10">
              <span className="material-symbols-outlined text-[16px] text-green-500">shield</span>
              <span className="text-xs text-green-600 dark:text-green-400">
                {t("backupProtected")}
              </span>
            </div>
          )}

          {/* Step log */}
          <StepLog steps={steps} />

          {/* Close button (when done or failed) */}
          {canClose && (
            <div className="mt-4 flex justify-end">
              <Button
                variant={isDone ? "primary" : "secondary"}
                size="sm"
                onClick={isDone ? () => window.location.reload() : closeProgress}
                icon={isDone ? "refresh" : "close"}
              >
                {isDone ? t("reloadNow") : t("close")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
