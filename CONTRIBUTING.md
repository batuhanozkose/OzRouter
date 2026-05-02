# Contributing to OzRouter

OzRouter is maintained as a practical local AI gateway. Contributions should keep the project reliable, easy to run, and simple to operate on a personal server.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Dashboard:

```txt
http://localhost:20128/dashboard
```

API:

```txt
http://localhost:20128/v1
```

## Checks

Run the smallest useful check first:

```bash
npm run typecheck:core
npm run lint
node --import tsx/esm --test tests/unit/specific.test.ts
```

Before larger changes:

```bash
npm run test:unit
```

## Code Style

- Use TypeScript for new source code.
- Keep provider-specific behavior isolated.
- Validate external input with Zod or existing validation helpers.
- Do not log secrets, tokens, API keys, or encryption keys.
- Prefer targeted tests near the changed behavior.
- Keep user-facing copy short and operational.

## Git Workflow

- Work on feature branches.
- Keep commits focused.
- Do not mix formatting-only changes with behavior changes unless required.
- Include validation notes in pull requests.

## Pull Request Checklist

- The change has a clear reason.
- Typecheck passes.
- Relevant tests pass.
- New configuration is documented in `.env.example`.
- Security-sensitive behavior has tests or explicit review notes.

## Security

Do not open public issues for vulnerabilities. Report privately to the maintainer.
