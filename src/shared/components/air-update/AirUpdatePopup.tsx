"use client";

import { useAirUpdate } from "./AirUpdateContext";
import Modal from "../Modal";
import Button from "../Button";

/**
 * AirUpdatePopup — Global modal shown when a new version is available.
 *
 * Shows version info, release notes (if any), and two actions:
 *   - "Update Now"  → starts SSE update process
 *   - "Later"       → dismisses popup, shows persistent banner
 */
export default function AirUpdatePopup() {
  const { versionInfo, popupOpen, dismissPopup, startUpdate } = useAirUpdate();

  if (!popupOpen || !versionInfo?.updateAvailable) return null;

  return (
    <Modal isOpen={popupOpen} title="Air Update" onClose={dismissPopup} maxWidth="md">
      <div className="flex flex-col gap-5">
        {/* Header icon */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-4xl text-primary">cloud_download</span>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-text-main">New Version Available</h3>
            <p className="mt-1 text-sm text-text-muted">
              <span className="font-mono text-text-secondary">v{versionInfo.current}</span>
              <span className="mx-2 text-text-muted">→</span>
              <span className="font-mono font-semibold text-primary">v{versionInfo.latest}</span>
            </p>
          </div>
        </div>

        {/* Release notes */}
        {versionInfo.releaseName && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              What&apos;s New
            </p>
            <p className="text-sm font-semibold text-text-main">{versionInfo.releaseName}</p>
            {versionInfo.releaseNotes && (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-line">
                {versionInfo.releaseNotes}
              </p>
            )}
          </div>
        )}

        {/* Data safety notice */}
        <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <span className="material-symbols-outlined mt-0.5 text-[20px] text-green-500">
            verified_user
          </span>
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Your data is safe
            </p>
            <p className="mt-0.5 text-xs text-green-600/80 dark:text-green-400/70">
              A full database backup is created before updating. All your settings, API keys,
              combos, and logs will be preserved.
            </p>
          </div>
        </div>

        {/* Auto-update not supported warning */}
        {!versionInfo.autoUpdateSupported && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="material-symbols-outlined mt-0.5 text-[20px] text-amber-500">
              warning
            </span>
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Manual update required
              </p>
              <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/70">
                {versionInfo.autoUpdateError ||
                  "Auto-update is not available for this installation type. Please update manually via git pull."}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="primary"
            fullWidth
            onClick={startUpdate}
            disabled={!versionInfo.autoUpdateSupported}
            icon="cloud_download"
          >
            Update Now
          </Button>
          <Button variant="ghost" fullWidth onClick={dismissPopup}>
            Later
          </Button>
        </div>

        {/* GitHub link */}
        {versionInfo.releaseUrl && (
          <a
            href={versionInfo.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            View on GitHub
          </a>
        )}
      </div>
    </Modal>
  );
}
