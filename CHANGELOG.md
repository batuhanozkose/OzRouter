# Changelog

## [Unreleased]

- Remaining OmniRoute v3.7.9 backports (Gemini CLI transport, combo stabilization, OAuth mutex, etc.)

## [3.8.3] — 2026-05-13

### Added

- **P2C (Power of Two Choices) strategy**: Picks two random candidates and routes to the less-loaded one via semaphore stats.
- **Fill-First strategy**: Exhausts one provider's quota before moving to the next.
- **Combo description field**: Optional 200-char description on combos (schema, type, API, DB).
- **combo_strategy tracking**: `usage_history` now records the combo routing strategy per request (migration 041).
- **SelfHealing re-entrant guard**: Prevents concurrent `evaluate()` calls for the same provider from racing.
- **stripModelTags array content**: Cache tag cleanup now handles multimodal `Array<{text}>` message parts.
- New i18n keys: `fillFirst`, `fillFirstDesc`, `p2c`, `p2cDesc`, `configOnlyStatus`, `configOnlyHint`, `routingInputs`, `routingInputsHint`, `emailVisibilityHint`, `emailVisibilityTooltip`, `templatePaidPremium`, `templatePaidPremiumDesc`.

### Fixed

- `combo_strategy` column was never populated in `usage_history` INSERT — strategy distribution stats always showed "direct".
- `updateComboSchema` superRefine missing `description` check — sending only `description` in PATCH returned "No valid fields".
- `response.headers.get()` null safety in `validateResponseQuality` (`headers?.get`).
- `comboMetrics` connectionId normalization — `undefined` connectionId now coerced to `null` for consistent metric matching.
- Context-relay pinned model now resolves a full target object for proper metrics/logging.
- `CostStrategy.finalScore` normalized to 0–1 range instead of unbounded `1/cost`.
- `LatencyStrategy` error rate clamped to 0–1 (`Math.min(1, errorRate)`) preventing negative reliability scores.
- Removed unused `locks` Map from `SelfHealingManager`.
- `autoCombo` excluded list deduplicated with `[...new Set(excluded)]`.
- `comboResolver` weighted random handles zero-weight entries with uniform fallback.

### Changed

- All combo strategy descriptions rewritten (EN + TR) with detailed explanations and use-case guidance.
- Template descriptions expanded (High Availability, Cost Saver, Balanced, Free Stack, Paid Premium).
- `sortTargetsByCost`, `sortTargetsByUsage`, `sortTargetsByContextSize` refactored from model-then-map to direct target-level sorting.
- `comboResolver` round-robin key uses `combo.name` only (dropped `combo.id` prefix).
- `getCacheMetrics` now reads real `combo_strategy` column instead of hardcoded `'direct'`.
- Combo strategy tests rewritten as proper unit tests with mock `handleSingleModel`.
- TR: `"Steps" → "Adımlar"`, `"Auto Combo" → "Akıllı Otomatik"`, `"LKGP" desc` fully localized.

## [3.8.1] — 2026-05-12

### Fixed

- Corrected HTTP status codes for SSRF-blocked provider validation (503 → 400).
- Fixed A2A JSON-RPC auth rejection returning 503 instead of 400.
- Fixed `securityBlocked` flag not being set after SSRF status code change.
- Added missing `scripts/smoke-electron-packaged.mjs` for electron smoke tests.
- Added missing `scripts/run-next-playwright.mjs` for Playwright test runner.
- Fixed Codex executor session identity test with correct installation UUID.
- Fixed chat-cooldown-aware-retry abort test timing issue.
- Fixed `dev-origins-config` test to include `p1.proxy.zo.computer`.
- Fixed `providers-validate-route` SSRF audit log test expectations.
- Fixed memory schema test to use `unknownField` for strict-mode validation.
- Fixed `volumeDetector` test to use vitest imports and mock settings.
- Fixed CacheTrends, CachePerformance, and IdempotencyLayer UI test rendering assertions.
- Added `@testing-library/dom`, `@testing-library/react`, `@testing-library/jest-dom` dev dependencies.
- Added `vitest.setup.ts` with jest-dom matchers.

### Changed

- Complete Turkish (tr.json) translation rewrite — all 4897 keys translated with proper context.
- Updated AGENTS.md, db/AGENTS.md, and I18N.md with current counts (20 base tables, 39 migrations, 41 languages, 4900 keys).

## [3.7.8] — 2026-05-02

- Rebranded the project as OzRouter.
- Updated public documentation for GitHub-only installation.
- Removed npm and Docker Hub publishing workflows.
- Updated repository metadata for `batuhanozkose/OzRouter`.
- Simplified release guidance around source-based local installs.
