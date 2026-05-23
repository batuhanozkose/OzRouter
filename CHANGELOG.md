# Changelog

## [3.8.8.5] — 2026-05-23

### Added

- Added a one-command installer (`scripts/install.sh`) that clones OzRouter, installs dependencies, prepares environment settings, builds the app, and starts it under PM2 with boot persistence.
- Added remote CLI instance management for SSH-connected machines, including saved remote instances, connection testing, status scanning, remote install/apply routes, and remote-aware CLI tool cards.
- Added remote instance persistence with migration `045_remote_instances.sql`, DB helpers, SSH connection management, and unit coverage for remote runtime/parsing behavior.
- Added batch creation UI and a batch template API to make batch setup available directly from the dashboard.
- Added a dedicated Studio dashboard section with chat and search playgrounds, replacing the heavier embedded playground surface.
- Expanded `/status` into a richer operational status page with memory, uptime, provider summaries, circuit breaker details, local provider health, quota monitor state, sessions, rate limits, lockouts, and cryptography status.
- Added local changelog loading for the dashboard changelog page so release notes can be previewed before GitHub publication.

### Changed

- Simplified the dashboard changelog page to a changelog-only view by removing the News tab and tab switcher.
- Reworked the CLI Tools dashboard around Local and Remote tabs and removed the older category segmented-control workflow.
- Simplified MCP deployment to in-process HTTP transports only (SSE and Streamable HTTP), with dashboard-controlled startup/status and connection audit events.
- Updated MCP documentation and examples from stdio-based startup to HTTP/SSE client usage.
- Refined endpoint, cost, combo, resilience, storage, skills, cache media, batch, docs, login, and memory dashboard pages for the current navigation and settings model.
- Updated README and README_TR with OmniRoute fork attribution and the new quick-install path.
- Reduced bundled locale files to the actively maintained English and Turkish message catalogs and updated tests/sidebar expectations accordingly.
- Updated project dependencies for remote SSH support (`ssh2`, `@types/ssh2`) and pinned TypeScript/PostCSS toolchain versions.

### Fixed

- Improved usage analytics cost resolution so provider/model/account cost rows include pricing source metadata, estimated-cost flags, and better model-name matching.
- Hardened pricing sync and cost calculation behavior for LiteLLM-style pricing data and provider/model aliases.
- Improved memory extraction parsing and tests for more reliable extraction from varied model output shapes.
- Fixed Codex settings reset behavior and added regression coverage.
- Fixed file upload handling and batch API behavior around new dashboard flows.
- Fixed MCP status reporting so enabled transports can report online state and uptime more accurately.

### Removed

- Removed the standalone MCP server binary/runtime heartbeat path; MCP now runs inside the Next.js process through HTTP transports.
- Removed the inflight tracker service, inflight settings/API routes, and related tests from the request surface.
- Removed the legacy ACP registry/manager modules and ACP agents route.
- Removed the old dashboard Agents page and its sidebar entry.
- Removed the older monolithic playground page in favor of the new Studio section.
