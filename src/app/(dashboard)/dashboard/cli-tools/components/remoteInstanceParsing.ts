export interface ParsedSshConnection {
  username?: string;
  host?: string;
  port?: number;
}

export function parseSshConnectionString(input: string): ParsedSshConnection {
  const trimmed = input.trim();
  if (!trimmed) return {};

  let work = trimmed;
  let port: number | undefined;

  if (/^ssh\s+/i.test(work)) {
    work = work.replace(/^ssh\s+/i, "").trim();

    const portFlagMatch = work.match(/(?:^|\s)-p\s+(\d+)(?=\s|$)/i);
    if (portFlagMatch) {
      port = Number(portFlagMatch[1]);
      work = work.replace(/(?:^|\s)-p\s+\d+(?=\s|$)/i, " ").trim();
    }
  }

  const uriMatch = work.match(
    /^(?:ssh:\/\/)?(?:([^:@\s]+)(?::[^@\s]+)?@)?([^:/\s]+)(?::(\d+))?(?:\/)?$/
  );
  if (uriMatch) {
    return {
      username: uriMatch[1] || undefined,
      host: uriMatch[2] || undefined,
      port: port ?? (uriMatch[3] ? Number(uriMatch[3]) : undefined),
    };
  }

  return {};
}
