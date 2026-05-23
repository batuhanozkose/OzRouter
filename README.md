# OzRouter

> **Türkçe sürüm:** [README_TR.md](README_TR.md)

OzRouter is a local AI gateway for routing coding tools, chat clients, and OpenAI-compatible SDKs through one endpoint. It is a fork of [OmniRoute](https://github.com/diegosouzapw/OmniRoute).

It is built for local machines, home servers, and private development environments. You run OzRouter once, connect your tools to `http://localhost:20128/v1`, then manage provider accounts, fallback rules, quotas, usage logs, and model routing from the dashboard.

OzRouter is distributed only through GitHub:

```txt
https://github.com/batuhanozkose/OzRouter
```

There is no official npm package, container image, or hosted cloud service for this project.

## Features

- One OpenAI-compatible API endpoint: `http://localhost:20128/v1`.
- Multi-provider routing for OpenAI, Anthropic, Gemini, local endpoints, OAuth-backed coding tools, and other compatible providers.
- Multiple accounts per provider with automatic failover.
- Combo routing for cross-provider fallback chains.
- Quota and health tracking for provider connections.
- Dashboard for providers, models, combos, usage, logs, memory, settings, and CLI tool integration.
- Protocol translation between OpenAI-style chat, Responses API flows, Claude-style requests, and Gemini-style requests.
- MCP and A2A interfaces for agent integrations.
- Local SQLite storage under a configurable data directory.

## How It Works

```txt
Client / Tool
    |
    | OpenAI-compatible request
    | http://localhost:20128/v1
    v
OzRouter
    |
    +-- Provider account 1
    +-- Provider account 2
    +-- Local model endpoint
    +-- Cross-provider combo fallback
```

Typical clients:

- Codex
- Claude Code
- Cursor
- Cline
- OpenCode
- OpenWebUI
- Continue
- Any SDK or app that supports an OpenAI-compatible base URL

## Requirements

Use one of these Node.js versions:

- Node.js `>=20.20.2 <21`
- Node.js `>=22.22.2 <23`
- Node.js `>=24.0.0 <25`

Recommended:

- Node.js 24 LTS
- npm 10+
- Git
- SQLite support through `better-sqlite3`

Check your local versions:

```bash
node --version
npm --version
git --version
```

If your Node.js version is rejected by the runtime check, install a supported version before continuing. With `nvm`, for example:

```bash
nvm install 24
nvm use 24
```

## Installation

### Quick Install (Recommended)

One command — clones the repo, installs dependencies, sets up PM2, builds, and starts:

```bash
curl -fsSL https://raw.githubusercontent.com/batuhanozkose/OzRouter/main/scripts/install.sh | bash
```

The installer handles Node.js checks, git, npm dependencies, environment setup, PM2 process management with auto-start on boot, and the first build. After it finishes, open:

```txt
http://localhost:20128/dashboard
```

Default login uses the `INITIAL_PASSWORD` from your `.env`.

### Manual Install

Clone the repository:

```bash
git clone https://github.com/batuhanozkose/OzRouter.git
cd OzRouter
```

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Generate secrets:

```bash
openssl rand -base64 48
openssl rand -hex 32
openssl rand -hex 32
```

Open `.env` and set at least these values:

```env
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
DATA_DIR=~/.ozrouter
INITIAL_PASSWORD=change-this-password
JWT_SECRET=<base64-secret>
API_KEY_SECRET=<hex-secret>
STORAGE_ENCRYPTION_KEY=<hex-secret>
```

Notes:

- `INITIAL_PASSWORD` is the first dashboard login password.
- `JWT_SECRET` signs dashboard sessions.
- `API_KEY_SECRET` signs/generated local API keys.
- `STORAGE_ENCRYPTION_KEY` protects sensitive local connection fields.
- Keep `.env` private. Do not commit it.

## Run in Development Mode

Start the app:

```bash
npm run dev
```

Open the dashboard:

```txt
http://localhost:20128/dashboard
```

Use this API base URL in clients:

```txt
http://localhost:20128/v1
```

First login:

1. Open the dashboard.
2. Enter the `INITIAL_PASSWORD` from your `.env`.
3. Add provider connections from the dashboard.
4. Create or select models.
5. Point your tool to `http://localhost:20128/v1`.

## Run in Production Mode

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

The server uses the same values from `.env`.

For a local-only installation, keep it bound to localhost and use:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:20128
```

If you expose OzRouter to another device on your network, use a strong dashboard password, strong secrets, and API keys for clients.

## Configure a Client

Most OpenAI-compatible clients need two values:

```txt
Base URL: http://localhost:20128/v1
API key:  an OzRouter API key generated in the dashboard
```

Some tools call the key `OPENAI_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GEMINI_API_KEY`, or similar. Use the OzRouter key there when the tool is pointed at the OzRouter base URL.

Example environment:

```bash
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-ozrouter-key"
```

## Provider and Fallback Setup

For same-provider account fallback:

1. Add multiple accounts under the same provider.
2. Keep them enabled.
3. OzRouter will use the configured routing strategy and move to another account when the active account is unavailable, rate-limited, or out of quota.

For cross-provider fallback:

1. Create a combo.
2. Add models/providers in the desired priority order.
3. Use the combo model from your client.

Use same-provider fallback when you have multiple accounts for the same provider. Use combos when you want fallback across different providers, such as Codex to Gemini.

## Data Directory

By default, local data is stored under:

```txt
~/.ozrouter
```

You can change this with:

```env
DATA_DIR=/absolute/path/to/ozrouter-data
```

This directory may contain:

- SQLite databases
- provider connection metadata
- usage logs
- quota snapshots
- local settings

Back it up if the installation is important.

## Common Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck:core
npm run test:unit
```

Run one test file:

```bash
node --import tsx/esm --test tests/unit/example.test.ts
```

Check supported Node.js runtime:

```bash
npm run check:node-runtime
```

## Updating

Pull the latest code:

```bash
git pull
```

Install dependency changes:

```bash
npm install
```

Rebuild if you run production mode:

```bash
npm run build
npm run start
```

Before updating a production instance, back up your `DATA_DIR`.

## Troubleshooting

### Unsupported Node.js Runtime

Install a supported Node.js version. Node.js 24 LTS is recommended.

```bash
nvm install 24
nvm use 24
npm install
```

### Dashboard Does Not Open

Check that the server is running:

```bash
npm run dev
```

Check the port:

```env
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
```

Then open:

```txt
http://localhost:20128/dashboard
```

### Login Fails

Confirm `INITIAL_PASSWORD` in `.env`.

If you changed `.env`, restart the server.

### Client Cannot Connect

Confirm the client is using:

```txt
http://localhost:20128/v1
```

Also confirm the client is using an OzRouter API key generated in the dashboard.

### Provider Requests Fail

Check:

- Provider credentials are valid.
- The selected model exists for that provider.
- The provider account is enabled.
- Quota or rate-limit status is not blocking the connection.
- The request is using the intended model or combo.

## Repository Layout

- `src/app` — Next.js dashboard and API routes.
- `src/lib` — persistence, auth, settings, jobs, usage, and app services.
- `src/shared` — UI components, constants, types, and shared utilities.
- `open-sse` — provider execution, streaming, translation, MCP, and routing core.
- `docs` — operational documentation.
- `tests` — unit, integration, and compatibility tests.

## Development Notes

- Do not commit `.env`, local databases, logs, build output, or provider credentials.
- Run `npm run typecheck:core` after TypeScript changes.
- Run targeted tests after changing routing, provider, auth, or stream logic.
- Use `DATA_DIR` when running multiple OzRouter instances on the same machine.

## License

MIT.
