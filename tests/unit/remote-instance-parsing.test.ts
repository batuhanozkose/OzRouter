import test from "node:test";
import assert from "node:assert/strict";

import { parseSshConnectionString } from "../../src/app/(dashboard)/dashboard/cli-tools/components/remoteInstanceParsing.ts";

test("parseSshConnectionString strips ssh command prefix before extracting username", () => {
  assert.deepEqual(
    parseSshConnectionString("ssh ZInzXbRKPoeFXOAxfLv4DrxkXy7TXIcM@ssh.app.daytona.io"),
    {
      username: "ZInzXbRKPoeFXOAxfLv4DrxkXy7TXIcM",
      host: "ssh.app.daytona.io",
      port: undefined,
    }
  );
});

test("parseSshConnectionString supports uri, host port, and ssh -p forms", () => {
  assert.deepEqual(parseSshConnectionString("ssh://alice:secret@example.com:2222"), {
    username: "alice",
    host: "example.com",
    port: 2222,
  });
  assert.deepEqual(parseSshConnectionString("bob@example.com:2022"), {
    username: "bob",
    host: "example.com",
    port: 2022,
  });
  assert.deepEqual(parseSshConnectionString("ssh -p 2200 carol@example.com"), {
    username: "carol",
    host: "example.com",
    port: 2200,
  });
});
