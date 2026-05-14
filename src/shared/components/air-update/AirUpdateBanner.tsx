"use client";

import { useAirUpdate } from "./AirUpdateContext";

/**
 * AirUpdateBanner — Persistent banner shown when user dismissed the popup.
 *
 * Sits below the header. Click opens the popup again.
 * Disappears when update is in progress or not available.
 */
export default function AirUpdateBanner() {
  const { versionInfo, dismissed, phase, openPopup, progressVisible } = useAirUpdate();

  // Only show when: update available + popup dismissed + not currently updating
  const shouldShow =
    versionInfo?.updateAvailable && dismissed && phase === "idle" && !progressVisible;

  if (!shouldShow) return null;

  return (
    <button
      onClick={openPopup}
      className="group flex w-full items-center justify-center gap-2 bg-primary/10 px-4 py-2 text-sm transition-colors hover:bg-primary/15 border-b border-primary/10"
    >
      <span className="material-symbols-outlined text-[18px] text-primary animate-pulse">
        cloud_download
      </span>
      <span className="text-primary font-medium">
        Update available: <span className="font-semibold">v{versionInfo?.latest}</span>
      </span>
      <span className="ml-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary group-hover:bg-primary/30 transition-colors">
        Click to update
      </span>
    </button>
  );
}
