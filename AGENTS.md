# OzRouter — Agent Guidelines

## Project

OzRouter is a unified AI proxy/router — route any LLM through one endpoint. Multi-provider support\
with **160+ providers** (OpenAI, Anthropic, Gemini, DeepSeek, Groq, xAI, Mistral, Fireworks,\
Cohere, NVIDIA, Cerebras, Pollinations, Puter, Cloudflare AI, HuggingFace, DeepInfra,\
SambaNova, Meta Llama API, Moonshot AI, AI21 Labs, Databricks, Snowflake, and many more)\
with **MCP Server** (29 tools), **A2A v0.3 Protocol**, and **Electron desktop app**.

## Stack

- **Runtime**: Next.js 16 (App Router), Node.js &gt;=18 &lt;24, ES Modules (`"type": "module"`)
- **Language**: TypeScript 5.9 (`src/`) + JavaScript (`open-sse/`, `electron/`)
- **Database**: better-sqlite3 (SQLite) — `DATA_DIR` configurable, default `~/.ozrouter/`
- **Streaming**: SSE via `open-sse` internal workspace package
- **Styling**: Tailwind CSS v4
- **i18n**: next-intl with 40+ languages
- **Desktop**: Electron (cross-platform: Windows, macOS, Linux)
- **Schemas**: Zod v4 for all API / MCP input validation

---

## Build, Lint, and Test Commands

| Command                             | Description                       |
| ----------------------------------- | --------------------------------- |
| `npm run dev`                       | Start Next.js dev server          |
| `npm run build`                     | Production build (isolated)       |
| `npm run start`                     | Run production build              |
| `npm run build:cli`                 | Build CLI package                 |
| `npm run lint`                      | ESLint on all source files        |
| `npm run typecheck:core`            | TypeScript core type checking     |
| `npm run typecheck:noimplicit:core` | Strict checking (no implicit any) |
| `npm run check`                     | Run lint + test                   |
| `npm run electron:dev`              | Run Electron app in dev mode      |
| `npm run electron:build`            | Build Electron app for current OS |

### Running Tests

```bash
# All tests (unit + vitest + ecosystem + e2e)
npm run test:all

# Single test file (Node.js native test runner — most tests use this)
node --import tsx/esm --test tests/unit/your-file.test.ts

# Vitest (MCP server, autoCombo)
npm run test:vitest

# E2E with Playwright
npm run test:e2e

# Coverage
npm run test:coverage
```

---

## Code Style Guidelines

### Formatting (Prettier — enforced via lint-staged)

2 spaces · semicolons required · double quotes (`"`) · 100 char width · es5 trailing commas.\
Always run `prettier --write` on changed files.

### TypeScript

- **Target**: ES2022 · **Module**: `esnext` · **Resolution**: `bundler`
- `strict: false` — prefer explicit types, don't rely on inference
- Path aliases: `@/*` -&gt; `src/`, `@ozrouter/open-sse` -&gt; `open-sse/`, `@ozrouter/open-sse/*` -&gt; `open-sse/*`

### ESLint Rules

- **Security (error, everywhere)**: `no-eval`, `no-implied-eval`, `no-new-func`
- **Relaxed in** `open-sse/` **and** `tests/`: `@typescript-eslint/no-explicit-any` = warn
- React hooks rules and `@next/next/no-assign-module-variable` disabled in `open-sse/` and `tests/`

### Naming

| Element             | Convention                       | Example                                        |
| ------------------- | -------------------------------- | ---------------------------------------------- |
| Files               | camelCase / kebab-case           | `file chatCore.ts`, `file tokenHealthCheck.ts` |
| React components    | PascalCase                       | `file Dashboard.tsx`, `file ProviderCard.tsx`  |
| Functions/variables | camelCase                        | `getHealth()`, `switchCombo()`                 |
| Constants           | UPPER_SNAKE                      | `MAX_RETRIES`, `DEFAULT_TIMEOUT`               |
| Interfaces          | PascalCase (`I` prefix optional) | `ProviderConfig`                               |
| Enums               | PascalCase (members too)         | `LogLevel.Error`                               |

### Imports

- **Order**: external -&gt; internal (`@/`, `@ozrouter/open-sse`) -&gt; relative (`./`, `../`)
- **No barrel imports** from `file localDb.ts` — import from the specific `db/` module instead

### Error Handling

- try/catch with specific error types; always log with context (pino logger)
- Never silently swallow errors in SSE streams — use abort signals for cleanup
- Return proper HTTP status codes (4xx client, 5xx server)

### Security

- **NEVER** commit API keys, secrets, or credentials
- Validate all user inputs with Zod schemas
- Auth middleware required on all API routes
- Never log SQLite encryption keys
- Sanitize user content (dompurify for HTML)

---

## Architecture

### Data Layer (`src/lib/db/`)

All persistence uses SQLite through domain-specific modules:\
`file core.ts`, `file providers.ts`, `file models.ts`, `file combos.ts`, `file apiKeys.ts`, `file settings.ts`,\
`file backup.ts`, `file proxies.ts`, `file prompts.ts`, `file webhooks.ts`, `file detailedLogs.ts`,\
`file domainState.ts`, `file registeredKeys.ts`, `file quotaSnapshots.ts`, `file modelComboMappings.ts`,\
`file cliToolState.ts`, `file encryption.ts`, `file readCache.ts`, `file secrets.ts`, `file stateReset.ts`,\
`file contextHandoffs.ts`, `file compression.ts`.\
Schema migrations live in `db/migrations/` and run via `file migrationRunner.ts`.\
`file src/lib/localDb.ts` is a **re-export layer only** — never add logic there.

#### DB Internals

- **`file core.ts`**: `getDbInstance()` returns a singleton `better-sqlite3` instance with WAL\
  journaling. `SCHEMA_SQL` defines 15 base tables. Helpers: `rowToCamel`, `encryptConnectionFields`.
- **`file migrationRunner.ts`**: Applies versioned SQL files from `db/migrations/` inside transactions.\
  Tracks applied migrations in `_ozrouter_migrations` table.
- **Migrations**: 22 files (`file 001_initial_schema.sql` -&gt; `file 022_compression_settings.sql`).\
  Each migration is idempotent and runs in a transaction.
- **Domain modules** import `getDbInstance()` from `file core.ts` for all CRUD operations.\
  Each module owns a specific table/set of tables (e.g., `file providers.ts` -&gt; `provider_connections`,\
  `file combos.ts` -&gt; `combos`). Encryption helpers protect sensitive fields at rest.
- **`file localDb.ts`** re-exports all domain modules — consumers import from here for convenience.

### API Route Layer (`src/app/api/v1/`)

Next.js App Router routes — each follows a consistent pattern:

```markdown
Route -> CORS preflight -> Body validation (Zod) -> Optional auth (extractApiKey/isValidApiKey)
-> API key policy enforcement (enforceApiKeyPolicy) -> Handler delegation (open-sse)
```

| Route | Handler                   | Notes                                      |
| ----- | ------------------------- | ------------------------------------------ |
|       | `handleChat()`            | \+ prompt injection guard (clones request) |
|       | `handleChat()` (unified)  | Responses API format                       |
|       | `handleEmbedding()`       | Model listing + creation                   |
|       | `handleImageGeneration()` | Model listing + creation                   |
|       | audio handler             | Multipart form data                        |
|       | TTS handler               | Binary audio response                      |
|       | video handler             | ComfyUI/SD WebUI                           |
|       | music handler             | ComfyUI workflows                          |
|       | moderation handler        | Content safety                             |
|       | rerank handler            | Document relevance                         |
|       | search handler            | Web search (5 providers)                   |

**No global Next.js middleware file** — interception is route-specific. Auth is optional\
(controlled by `REQUIRE_API_KEY` env). Prompt injection guard is unique to chat completions.

### Request Pipeline (`open-sse/`)

The `open-sse/` workspace is the core streaming engine. Full request flow:

```markdown
Client Request
-> src/app/api/v1/.../route.ts (Next.js route)
-> open-sse/handlers/chatCore.ts::handleChatCore()
-> Semantic/signature cache check
-> Rate limit check (rateLimitManager)
-> Combo routing? -> open-sse/services/combo.ts::handleComboChat()
-> resolveComboTargets() -> ordered ResolvedComboTarget[]
-> For each target: handleSingleModel() (wraps chatCore)
-> translateRequest() (open-sse/translator/)
-> Convert source format (e.g., OpenAI) -> target format (e.g., Claude)
-> getExecutor() -> provider-specific executor instance
-> executor.execute() (BaseExecutor -> DefaultExecutor or provider-specific)
-> buildUrl() + buildHeaders() + transformRequest()
-> fetch() to upstream provider
-> Retry logic with exponential backoff
-> Response translation back to client format
-> If Responses API: responsesTransformer.ts TransformStream
-> SSE stream or JSON response to client
```

**Handlers** (`open-sse/handlers/`): `file chatCore.ts`, `file responsesHandler.ts`, `file embeddings.ts`,\
`file imageGeneration.ts`, `file videoGeneration.ts`, `file musicGeneration.ts`, `file audioSpeech.ts`,\
`file audioTranscription.ts`, `file moderations.ts`, `file rerank.ts`, `file search.ts`.

**Upstream headers**: merged after default auth; same header name replaces executor value.\
**T5 intra-family fallback** recomputes headers using only the fallback model id.\
Forbidden header names: `file src/shared/constants/upstreamHeaders.ts` — keep sanitize,\
Zod schemas, and unit tests aligned when editing.

### Provider Categories

- **Free** (4): Qoder AI, Qwen Code, Gemini CLI (deprecated), Kiro AI
- **OAuth** (8): Claude Code, Antigravity, Codex, GitHub Copilot, Cursor, Kimi Coding, Kilo Code, Cline
- **API Key** (120+): OpenAI, Anthropic, Gemini, DeepSeek, Groq, xAI, Mistral, Perplexity,\
  Together, Fireworks, Cerebras, Cohere, NVIDIA, Nebius, SiliconFlow, Hyperbolic,\
  HuggingFace, OpenRouter, Vertex AI, Cloudflare AI, Scaleway, AI/ML API, Pollinations,\
  Puter, Longcat, Alibaba, Kimi, Minimax, Blackbox, Synthetic, Kilo Gateway,\
  Z.AI, GLM, Deepgram, AssemblyAI, ElevenLabs, Cartesia, PlayHT, Inworld,\
  NanoBanana, SD WebUI, ComfyUI, Ollama Cloud, Perplexity Search, Serper, Brave, Exa,\
  Tavily, OpenCode Zen/Go, Bailian Coding Plan, DeepInfra, Vercel AI Gateway,\
  Lambda AI, SambaNova, nScale, OVHcloud AI, Baseten, PublicAI, Moonshot AI,\
  Meta Llama API, v0 (Vercel), Morph, Featherless AI, FriendliAI, LlamaGate,\
  Galadriel, Weights & Biases Inference, Volcengine, AI21 Labs, Venice.ai,\
  Codestral, Upstage, Maritalk, Xiaomi MiMo, Inference.net, NanoGPT, Predibase,\
  Bytez, Heroku AI, Databricks, Snowflake Cortex, GigaChat (Sber), CrofAI,\
  AgentRouter, ChatGPT Web, Baidu Qianfan, AWS Polly, RunwayML, GitLab Duo,\
  Amazon Q, Empower, Poe, and many more.
- **Self-Hosted** (8+): LM Studio, vLLM, Lemonade, Llamafile, Triton, Docker Model Runner, Xinference, Oobabooga
- **Custom**: OpenAI-compatible (`openai-compatible-*`) and Anthropic-compatible (`anthropic-compatible-*`) prefixes

Providers are registered in `file src/shared/constants/providers.ts` with Zod validation at module load.

### Executors (`open-sse/executors/`)

Provider-specific request executors: `file base.ts`, `file default.ts`, `file cursor.ts`, `file codex.ts`,\
`file antigravity.ts`, `file github.ts`, `file gemini-cli.ts`, `file kiro.ts`, `file qoder.ts`, `file vertex.ts`,\
`file cloudflare-ai.ts`, `file opencode.ts`, `file pollinations.ts`, `file puter.ts`.

#### Executor Internals

- **`file base.ts`** (`BaseExecutor`): Abstract base with `buildUrl()`, `buildHeaders()`,\
  `transformRequest()`, retry logic (exponential backoff), and `execute()`. Subclasses\
  override URL/header/transform methods for provider-specific behavior.
- **`file default.ts`** (`DefaultExecutor extends BaseExecutor`): Handles most OpenAI-compatible\
  providers. Reads provider config from `file providerRegistry.ts` to resolve base URL, auth\
  header format, and request transformations.
- `getExecutor()` (`file executors/index.ts`): Factory that returns the correct executor\
  instance based on provider ID. Provider-specific executors (Cursor, Codex, Vertex, etc.)\
  override only what differs from the default.

### Translator (`open-sse/translator/`)

Translates between API formats (OpenAI-format &lt;-&gt; Anthropic, Gemini, etc.).\
Includes request/response translators with helpers for image handling.

#### Translator Internals

- **`file translator/index.ts`**: Exports `translateRequest()` and format constants. Called by\
  `file chatCore.ts` before executor dispatch.
- **Flow**: `translateRequest(body, sourceFormat, targetFormat)` -&gt; detects source format\
  (OpenAI, Anthropic, Gemini) -&gt; applies the matching translator module -&gt; returns\
  transformed body ready for the target provider.
- **Response translation** runs in reverse after upstream response, converting back to\
  the client's expected format.

### Transformer (`open-sse/transformer/`)

`file responsesTransformer.ts` — transforms Responses API format to/from Chat Completions format.

#### Transformer Internals

- `createResponsesApiTransformStream()`: Returns a `TransformStream` that converts\
  Chat Completions SSE chunks (`data: {"choices":[...]}`) into Responses API SSE events\
  (`response.output_item.added`, `response.output_text.delta`, etc.).
- Used when the client sends a Responses API request: the request is internally converted\
  to Chat Completions format, dispatched normally, and the response is piped through this\
  transform stream before reaching the client.

### Services (`open-sse/services/`)

36+ service modules including: `file combo.ts` (routing engine), `file usage.ts`, `file tokenRefresh.ts`,\
`file rateLimitManager.ts`, `file accountFallback.ts`, `file sessionManager.ts`, `file wildcardRouter.ts`,\
`autoCombo/`, `file intentClassifier.ts`, `file taskAwareRouter.ts`, `file thinkingBudget.ts`,\
`file contextManager.ts`, `file modelDeprecation.ts`, `file modelFamilyFallback.ts`,\
`file emergencyFallback.ts`, `file workflowFSM.ts`, `file backgroundTaskDetector.ts`, `file ipFilter.ts`,\
`file signatureCache.ts`, `file volumeDetector.ts`, `file contextHandoff.ts`, `compression/` (prompt\
compression pipeline), and more.

#### Prompt Compression Pipeline (`compression/`)

Modular prompt compression that runs proactively before the existing reactive context manager.

- **`file strategySelector.ts`**: Selects compression mode based on config, combo overrides, auto-trigger\
  thresholds. Priority: combo override &gt; auto-trigger &gt; default mode &gt; off.
- **`file lite.ts`**: 5 lite-mode techniques: `collapseWhitespace`, `dedupSystemPrompt`,\
  `compressToolResults`, `removeRedundantContent`, `replaceImageUrls`. Target: 10-15% savings at\
  &lt;1ms latency.
- **`file stats.ts`**: Per-request compression stats tracking (original tokens, compressed tokens,\
  savings %, techniques used).
- **`file types.ts`**: `CompressionMode` (off/lite/standard/aggressive/ultra), `CompressionConfig`,\
  `CompressionStats`, `CompressionResult`.
- DB settings in `file src/lib/db/compression.ts`, API route at `src/app/api/settings/compression/`.
- Phase 1 implements lite mode only; standard/aggressive/ultra are placeholders for Phase 2.

#### Combo Routing Engine (`file combo.ts`)

- `handleComboChat()`: Entry point for combo-routed requests. Receives the combo config\
  and iterates through targets in order until one succeeds or all fail.
- `resolveComboTargets()`: Expands a combo configuration into an ordered array of\
  `ResolvedComboTarget[]`, each specifying provider + model + account + credentials.
- **Strategies** (13): priority, weighted, fill-first, round-robin, P2C, random, least-used,\
  cost-optimized, strict-random, auto, lkgp, context-optimized, context-relay.
- Each target calls `handleSingleModel()` which wraps `handleChatCore()` with\
  per-target error handling and circuit breaker checks.

### Domain Layer (`src/domain/`)

Policy engine modules: `file policyEngine.ts`, `file comboResolver.ts`, `file costRules.ts`,\
`file degradation.ts`, `file fallbackPolicy.ts`, `file lockoutPolicy.ts`, `file modelAvailability.ts`,\
`file providerExpiration.ts`, `file quotaCache.ts`, `file responses.ts`, `file configAudit.ts`.

### MCP Server (`open-sse/mcp-server/`)

29 tools, 3 transports (stdio / SSE / Streamable HTTP). Scoped auth (10 scopes), Zod schemas.

**Core tools** (20): get_health, list_combos, get_combo_metrics, switch_combo, check_quota,\
route_request, cost_report, list_models_catalog, web_search, simulate_route, set_budget_guard,\
set_routing_strategy, set_resilience_profile, test_combo, get_provider_metrics,\
best_combo_for_task, explain_route, get_session_snapshot, db_health_check, sync_pricing.

**Cache tools** (2): cache_stats, cache_flush.

**Memory tools** (3): memory_search, memory_add, memory_clear.

**Skill tools** (4): skills_list, skills_enable, skills_execute, skills_executions.

#### MCP Internals

- **Tool registration**: Each tool is an object with `{ name, description, inputSchema: ZodSchema, handler: async (args) => {...} }`. Zod validates inputs before the handler fires.
- `createMcpServer()` and `startMcpStdio()` exported from `file mcp-server/index.ts`.\
  `createMcpServer()` wires all tool sets; `startMcpStdio()` launches the stdio transport.
- **Transports**: stdio (CLI `ozrouter --mcp`), SSE (`/api/mcp/sse`), Streamable HTTP\
  (`/api/mcp/stream`). All share the same tool/scope engine.
- **Scopes** (10): Control which tool categories an API key can access. Enforcement happens\
  before handler dispatch.
- **Audit**: Every tool invocation is logged to SQLite (`mcp_audit` table) with tool name,\
  args, success/failure, API key attribution, and timestamp.

### A2A Server (`src/lib/a2a/`)

JSON-RPC 2.0, SSE streaming, Task Manager with TTL cleanup.\
Agent Card at `/.well-known/agent.json`.\
Skills: `file quotaManagement.ts`, `file smartRouting.ts`.

#### A2A Internals

- **`file taskManager.ts`**: State machine lifecycle for tasks: `submitted -> working -> completed | failed | canceled`. Tasks have TTL and are cleaned up automatically.
- **JSON-RPC methods**: `message/send` (sync), `message/stream` (SSE), `tasks/get`,\
  `tasks/cancel`. Dispatched via `POST /a2a`.
- **Skills**: Registered in a DB-backed registry. Each skill receives task context\
  (messages, metadata) and returns structured results. `file quotaManagement.ts` summarizes\
  quota; `file smartRouting.ts` recommends routing decisions.
- **Agent Card**: `/.well-known/agent.json` exposes capabilities, skills, and metadata\
  for client auto-discovery.

### ACP Module (`src/lib/acp/`)

Agent Communication Protocol registry and manager.

### Memory System (`src/lib/memory/`)

Extraction, injection, retrieval, summarization, and store modules for persistent\
conversational memory across sessions.

### Skills System (`src/lib/skills/`)

Extensible skill framework: registry, executor, sandbox, built-in skills,\
custom skill support, interception, and injection.

#### Skills Internals

- **`file registry.ts`**: DB-backed skill registration and discovery. Skills have metadata\
  (name, description, version, enabled status) stored in SQLite.
- **`file executor.ts`**: Execution engine with configurable timeout and retry logic.\
  Receives skill name + input, looks up the skill, runs it in the sandbox.
- **`file sandbox.ts`**: Isolation layer for custom (user-provided) skills. Limits resource\
  access and execution time.
- **Built-in skills**: Ship with OzRouter (e.g., quota management, routing). Located\
  alongside the registry.
- **Interception/Injection**: Skills can intercept requests in the pipeline (pre/post\
  processing) or inject context into prompts.

### Compliance (`src/lib/compliance/`)

Policy index for compliance enforcement.

### MITM Proxy (`src/mitm/`)

MITM proxy capability with certificate management, DNS handling, and target routing.

### Middleware (`src/middleware/`)

Request middleware including `file promptInjectionGuard.ts`.

### Adding a New Provider

1. Register in `file src/shared/constants/providers.ts`
2. Add executor in `open-sse/executors/` (if custom logic needed)
3. Add translator in `open-sse/translator/` (if non-OpenAI format)
4. Add OAuth config in `file src/lib/oauth/constants/oauth.ts` (if OAuth-based)
5. Add models in `file open-sse/config/providerRegistry.ts`

---

## Subdirectory AGENTS.md Files

- [**`file open-sse/AGENTS.md`**](open-sse/AGENTS.md) — Streaming engine, request pipeline, handlers, and executors
- **`file src/lib/db/AGENTS.md`** — SQLite persistence, domain modules, migrations
- [**`file open-sse/services/AGENTS.md`**](open-sse/services/AGENTS.md) — Routing engine, combo resolution, strategy selection

---

## Review Focus

- **DB ops** go through `src/lib/db/` modules, never raw SQL in routes
- **Provider requests** flow through `open-sse/handlers/`
- **MCP/A2A pages** are tabs inside `/dashboard/endpoint`, not standalone routes
- **No memory leaks** in SSE streams (abort signals, cleanup)
- **Rate limit headers** must be parsed correctly
- All API inputs validated with **Zod schemas**
- **Provider constants** validated at module load via Zod (`file src/shared/validation/providerSchema.ts`)
- **Pricing data** syncs from LiteLLM via `file src/lib/pricingSync.ts`
- **Memory/Skills** are cross-cutting: affect MCP tools, request pipeline, and A2A skills
