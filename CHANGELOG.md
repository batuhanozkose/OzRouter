# Changelog

## [Unreleased]

- Remaining OmniRoute v3.7.9 backports (Gemini CLI transport, combo stabilization, OAuth mutex, etc.)

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
