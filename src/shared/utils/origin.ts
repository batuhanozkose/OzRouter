/**
 * Derive the display base URL from the current window origin.
 * Falls back to localhost:20128 for SSR or when window is unavailable.
 * Used in dashboard UI to avoid hardcoding localhost in curl examples,
 * CLI configuration snippets, and setup instructions.
 *
 * @param {string} [fallback="http://localhost:20128"] - Fallback URL for SSR
 * @returns {string} Base URL for display purposes
 */
export function getDisplayBaseUrl(fallback = "http://localhost:20128"): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return fallback;
}
