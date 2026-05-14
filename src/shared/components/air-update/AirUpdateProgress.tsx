"use client";

import { useAirUpdate, AirUpdatePhase, AirUpdateStep } from "./AirUpdateContext";
import Button from "../Button";

// ---------------------------------------------------------------------------
// Phase metadata for progress visualization
// ---------------------------------------------------------------------------

type PhaseConfig = {
  label: string;
  icon: string;
  description: string;
};

const PHASE_CONFIG: Record<AirUpdatePhase, PhaseConfig> = {
  idle: { label: "Ready", icon: "check_circle", description: "" },
  checking: { label: "Checking", icon: "search", description: "Checking for updates..." },
  backup: {
    label: "Backup",
    icon: "backup",
    description: "Creating a safe backup of your data...",
  },
  updating: {
    label: "Downloading",
    icon: "cloud_download",
    description: "Fetching the latest version...",
  },
  installing: {
    label: "Installing",
    icon: "package_2",
    description: "Installing dependencies...",
  },
  rebuilding: {
    label: "Building",
    icon: "build",
    description: "Rebuilding the application...",
  },
  restarting: {
    label: "Restarting",
    icon: "restart_alt",
    description: "Restarting OzRouter...",
  },
  done: {
    label: "Complete",
    icon: "check_circle",
    description: "Update complete! Reloading...",
  },
  failed: {
    label: "Failed",
    icon: "error",
    description: "Something went wrong during the update.",
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
}: {
  phaseKey: AirUpdatePhase;
  currentPhase: AirUpdatePhase;
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
          {config.label}
        </span>
        {status === "active" && (
          <span className="text-xs text-text-muted">{config.description}</span>
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
                {isDone ? "Update Complete!" : isFailed ? "Update Failed" : "Updating OzRouter"}
              </h2>
              <p className="text-sm text-text-muted">
                {isDone
                  ? `Successfully updated to v${versionInfo?.latest}. Reloading...`
                  : isFailed
                    ? "The update could not be completed. Your data is safe."
                    : `Updating to v${versionInfo?.latest}...`}
              </p>
            </div>
          </div>

          {/* Phase stepper */}
          <div className="space-y-3">
            {PHASE_ORDER.map((p) => (
              <StepIndicator key={p} phaseKey={p} currentPhase={phase} />
            ))}
          </div>

          {/* Data safety badge */}
          {!isDone && !isFailed && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/5 px-3 py-2 border border-green-500/10">
              <span className="material-symbols-outlined text-[16px] text-green-500">shield</span>
              <span className="text-xs text-green-600 dark:text-green-400">
                Database backed up — your data is protected
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
                {isDone ? "Reload Now" : "Close"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
