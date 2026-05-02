/**
 * Kiro IDE MITM Configuration (#336)
 *
 * Kiro IDE removed the Base URL / API Key configuration UI.
 * To route Kiro's traffic through OzRouter, we intercept it using MITM,
 * similar to the existing Antigravity/Claude Code implementation.
 *
 * Kiro IDE uses the Anthropic API at https://api.anthropic.com:
 * - Main endpoint: POST /v1/messages
 * - Auth header: x-api-key: <key>
 * - User-Agent contains: "kiro" or "Kiro"
 *
 * To use: Install OzRouter's MITM certificate, then run:
 *   ozrouter mitm start --targets kiro
 *
 * The MITM server intercepts requests to api.anthropic.com and forwards
 * them to the OzRouter proxy (localhost:20128) instead.
 */

export interface MitmTarget {
  id: string;
  name: string;
  description: string;
  targetHost: string;
  targetPort: number;
  localPort: number;
  userAgentPattern: string | null;
  apiEndpoints: string[];
  authHeader: string;
  instructions: string[];
  referenceIde?: string;
}

/** Kiro IDE MITM profile */
export const KIRO_MITM_PROFILE: MitmTarget = {
  id: "kiro",
  name: "Kiro IDE",
  description:
    "Intercepts Kiro IDE requests to api.anthropic.com and routes them through OzRouter.",
  targetHost: "api.anthropic.com",
  targetPort: 443,
  localPort: 20130,
  userAgentPattern: null, // Kiro does not expose a stable User-Agent
  apiEndpoints: ["/v1/messages"],
  authHeader: "x-api-key",
  instructions: [
    "1. Install OzRouter's root certificate: run `ozrouter cert install` or go to Settings → MITM Certificates",
    "2. Start the MITM proxy: `ozrouter mitm start --target kiro`",
    "3. Set your system HTTP proxy to 127.0.0.1:20130 (or use transparent MITM via DNS override)",
    "4. Open Kiro IDE — API calls will be automatically routed through OzRouter.",
    "5. Verify: check the Proxy Logs in OzRouter dashboard and look for provider=anthropic source=mitm",
  ],
  referenceIde: "antigravity", // Same MITM infrastructure as Antigravity
};
