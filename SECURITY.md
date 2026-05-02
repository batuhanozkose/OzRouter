# Security Policy

OzRouter stores provider credentials, OAuth tokens, API keys, logs, and routing configuration. Treat every deployment as security-sensitive.

## Reporting

Do not disclose vulnerabilities publicly before a fix exists. Report privately to the maintainer with:

- Affected version or commit.
- Reproduction steps.
- Expected impact.
- Suggested mitigation, if known.

## Supported Version

Security fixes target the current maintained branch.

## Deployment Rules

- Set strong `JWT_SECRET`, `API_KEY_SECRET`, and `STORAGE_ENCRYPTION_KEY` values.
- Do not expose the dashboard without authentication.
- Use API keys for clients outside localhost.
- Prefer HTTPS when exposing OzRouter over a network.
- Store `.env` outside public backups.
- Never commit `.env`, database files, logs, tokens, or provider credentials.

## Sensitive Data

OzRouter may store:

- Provider API keys.
- OAuth access and refresh tokens.
- Local API keys.
- Request logs and metadata.
- Provider account identifiers.

Keep `DATA_DIR` private and backed up securely.

## Recommended Production Settings

```env
AUTH_COOKIE_SECURE=true
REQUIRE_API_KEY=true
STORAGE_ENCRYPTION_KEY=<32-byte-hex-secret>
JWT_SECRET=<strong-random-secret>
API_KEY_SECRET=<strong-random-secret>
```

## Local Use

For a private home-server setup, bind OzRouter to localhost or a trusted private network unless remote access is required.
