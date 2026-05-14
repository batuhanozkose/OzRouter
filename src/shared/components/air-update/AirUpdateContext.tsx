"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AirUpdateStep = {
  step: string;
  status: "running" | "done" | "failed" | "skipped";
  message: string;
};

export type AirUpdatePhase =
  | "idle"
  | "checking"
  | "backup"
  | "updating"
  | "installing"
  | "rebuilding"
  | "restarting"
  | "done"
  | "failed";

export type VersionInfo = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  channel: string;
  autoUpdateSupported: boolean;
  autoUpdateError?: string | null;
  releaseNotes?: string | null;
  releaseName?: string | null;
  releaseUrl?: string | null;
};

type AirUpdateContextValue = {
  /** Latest version info from server */
  versionInfo: VersionInfo | null;
  /** Whether the update popup is visible */
  popupOpen: boolean;
  /** Whether the user dismissed the popup (banner shows instead) */
  dismissed: boolean;
  /** Current update phase */
  phase: AirUpdatePhase;
  /** SSE step log */
  steps: AirUpdateStep[];
  /** Progress overlay visible */
  progressVisible: boolean;
  /** Open the popup */
  openPopup: () => void;
  /** Dismiss popup — shows banner instead */
  dismissPopup: () => void;
  /** Start the update */
  startUpdate: () => Promise<void>;
  /** Close progress overlay (after done/failed) */
  closeProgress: () => void;
  /** Manually trigger a version check */
  checkNow: () => Promise<void>;
  /** Whether currently checking for update */
  isChecking: boolean;
};

const AirUpdateContext = createContext<AirUpdateContextValue | null>(null);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_CHECK_DELAY_MS = 10 * 1000; // 10s after mount
const DISMISS_KEY_PREFIX = "air-update-dismissed-v";
const LAST_CHECK_KEY = "air-update-last-check";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AirUpdateProvider({ children }: { children: React.ReactNode }) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<AirUpdatePhase>("idle");
  const [steps, setSteps] = useState<AirUpdateStep[]>([]);
  const [progressVisible, setProgressVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const checkInFlightRef = useRef(false);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Version check
  // -------------------------------------------------------------------------

  const checkForUpdate = useCallback(async (opts?: { silent?: boolean }) => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setIsChecking(true);
    try {
      const res = await fetch("/api/system/version", {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      setVersionInfo(data);

      // Save check timestamp
      try {
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
      } catch {
        /* quota */
      }

      if (data.updateAvailable) {
        // Check if user already dismissed this specific version
        const dismissKey = DISMISS_KEY_PREFIX + data.latest;
        let wasDismissed = false;
        try {
          wasDismissed = localStorage.getItem(dismissKey) === "1";
        } catch {
          /* */
        }

        if (wasDismissed) {
          // Show banner but not popup
          setDismissed(true);
          setPopupOpen(false);
        } else if (!opts?.silent) {
          // Show popup
          setPopupOpen(true);
          setDismissed(false);
        }
      }
    } catch {
      // Network error — silently ignore
    } finally {
      checkInFlightRef.current = false;
      setIsChecking(false);
    }
  }, []);

  // Initial check + periodic interval
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      checkForUpdate();
    }, INITIAL_CHECK_DELAY_MS);

    checkTimerRef.current = setInterval(() => {
      checkForUpdate({ silent: true });
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
    };
  }, [checkForUpdate]);

  // -------------------------------------------------------------------------
  // Popup actions
  // -------------------------------------------------------------------------

  const openPopup = useCallback(() => {
    setPopupOpen(true);
  }, []);

  const dismissPopup = useCallback(() => {
    setPopupOpen(false);
    setDismissed(true);
    if (versionInfo?.latest) {
      try {
        localStorage.setItem(DISMISS_KEY_PREFIX + versionInfo.latest, "1");
      } catch {
        /* quota */
      }
    }
  }, [versionInfo]);

  // -------------------------------------------------------------------------
  // Update process (SSE)
  // -------------------------------------------------------------------------

  const startUpdate = useCallback(async () => {
    setPopupOpen(false);
    setProgressVisible(true);
    setPhase("backup");
    setSteps([]);

    // Abort any in-flight update
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/system/version", {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          (errorData as Record<string, string>).error || `Update failed (${res.status})`
        );
      }

      const contentType = res.headers.get("content-type") || "";

      // Non-SSE response (background mode)
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json();
        if (data.success) {
          setPhase("done");
          setSteps([
            {
              step: "update",
              status: "done",
              message: `Update to v${data.to} started in background.`,
            },
          ]);
        } else {
          throw new Error(data.error || "Update failed");
        }
        return;
      }

      // SSE streaming response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const newStep: AirUpdateStep = {
              step: data.step || "unknown",
              status: data.status || "running",
              message: data.message || "",
            };

            // Update phase based on step
            if (data.step === "backup") setPhase("backup");
            else if (data.step === "fetch" || data.step === "install") setPhase("updating");
            else if (data.step === "dependencies") setPhase("installing");
            else if (data.step === "build") setPhase("rebuilding");
            else if (data.step === "restart") setPhase("restarting");
            else if (data.step === "complete") setPhase("done");
            else if (data.step === "error") setPhase("failed");

            setSteps((prev) => {
              // Replace existing step with same name or append
              const idx = prev.findIndex((s) => s.step === data.step);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = newStep;
                return next;
              }
              return [...prev, newStep];
            });
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setPhase("failed");
      setSteps((prev) => [
        ...prev,
        {
          step: "error",
          status: "failed",
          message: (err as Error).message || "Update failed unexpectedly.",
        },
      ]);
    }
  }, []);

  // Auto-reload after successful update
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => {
      window.location.reload();
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  const closeProgress = useCallback(() => {
    if (phase === "done" || phase === "failed") {
      setProgressVisible(false);
      setPhase("idle");
      setSteps([]);
    }
  }, [phase]);

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------

  const value = useMemo<AirUpdateContextValue>(
    () => ({
      versionInfo,
      popupOpen,
      dismissed,
      phase,
      steps,
      progressVisible,
      openPopup,
      dismissPopup,
      startUpdate,
      closeProgress,
      checkNow: checkForUpdate,
      isChecking,
    }),
    [
      versionInfo,
      popupOpen,
      dismissed,
      phase,
      steps,
      progressVisible,
      openPopup,
      dismissPopup,
      startUpdate,
      closeProgress,
      checkForUpdate,
      isChecking,
    ]
  );

  return <AirUpdateContext.Provider value={value}>{children}</AirUpdateContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAirUpdate(): AirUpdateContextValue {
  const ctx = useContext(AirUpdateContext);
  if (!ctx) {
    throw new Error("useAirUpdate must be used within <AirUpdateProvider>");
  }
  return ctx;
}
