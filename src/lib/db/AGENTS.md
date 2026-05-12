# src/lib/db/ — SQLite Persistence Layer

**Purpose**: Domain-driven SQLite persistence. Each module owns a specific table set. Schema migrations are versioned and idempotent. No raw SQL in routes — all ops go through `src/lib/db/` modules.

---

## Key Modules

### Core Infrastructure

- **`core.ts`** — `getDbInstance()` returns singleton `better-sqlite3` with WAL journaling. Exports `rowToCamel()` (snake_case → camelCase), `encryptConnectionFields()` for provider credentials at rest. `SCHEMA_SQL` defines 20 base tables.
- **`migrationRunner.ts`** — Applies versioned SQL files from `db/migrations/` inside transactions. Tracks applied migrations in `_ozrouter_migrations`. Runs at startup; each migration is idempotent.
- **`db/migrations/`** — 39 SQL files (`001_initial_schema.sql` → `040_oneproxy_proxy_fields.sql`). Each migration has single responsibility, runs in a transaction, never fails partially.
- **`localDb.ts`** — Re-export layer only. Never add logic here. Consumers import domain modules from this file for convenience.

### Domain Modules (38 total)

Each module owns specific tables + CRUD operations:

| Module                     | Tables                     | Responsibility                                          |
| -------------------------- | -------------------------- | ------------------------------------------------------- |
| `providers.ts`             | `provider_connections`     | OAuth/API key provider registration and credentials     |
| `models.ts`                | `models`                   | Model definitions, capabilities, pricing                |
| `combos.ts`                | `combos`, `combo_targets`  | Combo routing configs, target ordering                  |
| `apiKeys.ts`               | `api_keys`                 | API key lifecycle, scopes, quota tracking               |
| `settings.ts`              | `settings`                 | KV store for system configuration                       |
| `backup.ts`                | Backup export/import ops   | Serialize/deserialize entire DB state                   |
| `proxies.ts`               | `proxies`                  | MITM proxy configs and routing rules                    |
| `prompts.ts`               | `prompts`                  | Reusable prompt templates, versioning                   |
| `webhooks.ts`              | `webhooks`                 | Event-driven webhook subscriptions and logs             |
| `detailedLogs.ts`          | `detailed_logs`            | Per-request audit logging (optional, high volume)       |
| `domainState.ts`           | `domain_state`             | Transient runtime state (not persisted across restarts) |
| `registeredKeys.ts`        | `registered_keys`          | Whitelisted API keys for MCP/A2A access                 |
| `quotaSnapshots.ts`        | `quota_snapshots`          | Historical quota usage for analytics                    |
| `modelComboMappings.ts`    | `model_combo_mappings`     | Map models to combo defaults                            |
| `cliToolState.ts`          | `cli_tool_state`           | CLI-specific persistent state                           |
| `encryption.ts`            | —                          | Helpers for encrypting/decrypting sensitive fields      |
| `readCache.ts`             | —                          | In-memory cache for read-heavy ops (models, providers)  |
| `secrets.ts`               | `secrets`                  | Encrypted secret storage (API keys at rest)             |
| `stateReset.ts`            | —                          | Wipe/reset DB state for testing or recovery             |
| `contextHandoffs.ts`       | `context_handoffs`         | Store/retrieve session context for agent handoff        |
| `compression.ts`           | —                          | Compression settings, mode selection, config CRUD       |
| `compressionAnalytics.ts`  | —                          | Per-request compression stats tracking                  |
| `compressionCacheStats.ts` | —                          | Compression cache hit/miss statistics                   |
| `batches.ts`               | `batches`                  | Batch request management and lifecycle                  |
| `evals.ts`                 | `eval_runs`, `eval_suites` | Evaluation suite and run persistence                    |
| `files.ts`                 | `files`                    | Uploaded file metadata and content storage              |
| `healthCheck.ts`           | —                          | DB health verification and integrity checks             |
| `jsonMigration.ts`         | —                          | JSON-based data migration helpers                       |
| `oneproxy.ts`              | `oneproxy_*`               | OneProxy proxy integration and configuration            |
| `providerLimits.ts`        | `provider_limits`          | Per-provider rate limit and quota configuration         |
| `reasoningCache.ts`        | `reasoning_cache`          | Caching reasoning/thinking responses                    |
| `creditBalance.ts`         | `credit_balances`          | Provider credit balance tracking                        |
| `syncTokens.ts`            | `sync_tokens`              | Cloud sync authentication tokens                        |
| `upstreamProxy.ts`         | `upstream_proxies`         | Upstream HTTP proxy configuration per provider          |
| `versionManager.ts`        | `version_state`            | Application version tracking and migration state        |
| `migrationRunner.ts`       | `_ozrouter_migrations`     | Applies versioned SQL migrations at startup             |
| `migrations/`              | —                          | Versioned SQL schema evolution                          |
| `core.ts`                  | —                          | Singleton DB instance, helpers, schema definition       |

### Encryption & Security

- **Sensitive fields** (API keys, OAuth tokens, connection strings) encrypted at rest using `src/lib/encryption/` utilities
- **`encryptConnectionFields()`** in `core.ts` — Automatic encryption when storing provider credentials
- **`secrets.ts`** — Dedicated encrypted store for long-term secret handling
- **Never log** SQLite encryption keys or raw secrets; always use redacted values in logs

### Testing Strategy

For authoritative coverage requirements and test execution guidelines, see [`CONTRIBUTING.md#running-tests`](../../CONTRIBUTING.md#running-tests) (lines 136–162).

- **Unit tests** mock `getDbInstance()` to return isolated sqlite in-memory instance
- **Integration tests** use real SQLite with migrations applied, data cleaned up after each test
- **No fixture interdependencies** — each test runs migrations fresh
- Test files: `tests/unit/db/*.test.mjs`, `tests/integration/db/*.test.mjs`

### Anti-Patterns

- ❌ Raw SQL in routes — always use domain module functions
- ❌ Direct `prepare()` statements outside `db/` modules — breaks modularity
- ❌ Mixing encryption logic in domain modules — use `encryption.ts` helpers only
- ❌ Accessing `provider_connections` table from `combos.ts` — each module owns its tables
- ❌ Skipping migrations for schema changes — all changes go through `db/migrations/`

### Adding a New Domain Module

1. Create `src/lib/db/[module].ts` with CRUD functions (create, read, update, delete, list)
2. Export from `src/lib/db/localDb.ts` (add re-export)
3. If new tables required: create migration in `db/migrations/NNN_[description].sql`
4. Run migration via `migrationRunner.ts` at startup (automatic)
5. Add unit tests in `tests/unit/db/[module].test.mjs`
6. Ensure tests meet the coverage requirements in [`CONTRIBUTING.md#running-tests`](../../CONTRIBUTING.md#running-tests)

### Performance Notes

- **Read cache** (`readCache.ts`) — Pre-loads frequently accessed data (models, providers) at startup; invalidated on write
- **WAL journaling** (`core.ts`) — Enables concurrent reads during writes
- **Batch operations** — Use prepared statements with parameter binding to avoid SQL injection
- **Connection pooling** — Singleton pattern prevents per-request connection overhead

---

## Key Decisions

- **SQLite over PostgreSQL**: Simpler deployment, no separate database server, encryption at application layer
- **Versioned migrations**: Each schema change is tracked, reproducible, reversible with effort
- **Domain modules**: Enforces single responsibility, prevents cross-module table access
- **Re-export layer**: Convenience for consumers; `localDb.ts` is re-export-only to prevent circular dependencies

---

## Review Focus

- DB module changes must preserve domain boundaries (one module = one table set)
- New migrations must be idempotent and run inside transactions
- Encryption helpers used for all sensitive fields
- Test coverage and PR requirements: see [`CONTRIBUTING.md#running-tests`](../../CONTRIBUTING.md#running-tests) (lines 136–162)
- No raw SQL in routes or non-db modules
