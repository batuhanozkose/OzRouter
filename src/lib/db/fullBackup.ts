import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CALL_LOGS_DIR } from "@/lib/usage/callLogArtifacts";
import { resetAllDbModuleState } from "./stateReset";
import { DATA_DIR, DB_BACKUPS_DIR, getDbInstance, resetDbInstance, SQLITE_FILE } from "./core";
import { unlinkFileWithRetry } from "./backup";

const FULL_BACKUP_FORMAT = "ozrouter-full-backup-v1";
const REQUIRED_TABLES = ["provider_connections", "provider_nodes", "combos", "api_keys"];

type CountRow = { cnt?: number };

export type FullBackupRestoreResult = {
  imported: true;
  filename: string;
  preImportBackupFilename: string | null;
  connectionCount: number;
  nodeCount: number;
  comboCount: number;
  apiKeyCount: number;
  callLogsRestored: boolean;
};

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function createTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeIfExists(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function readCount(db: Database.Database, table: string) {
  return (
    (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as CountRow | undefined)?.cnt || 0
  );
}

function validateOzRouterDatabase(sqlitePath: string) {
  let testDb: Database.Database | null = null;
  try {
    testDb = new Database(sqlitePath, { readonly: true });
    const result = testDb.pragma("integrity_check") as Array<{ integrity_check?: string }>;
    if (result[0]?.integrity_check !== "ok") {
      throw new Error("Database integrity check failed. The file may be corrupted.");
    }

    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: { name: string }) => row.name);
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));
    if (missingTables.length > 0) {
      throw new Error(`Invalid OzRouter database. Missing tables: ${missingTables.join(", ")}`);
    }
  } finally {
    if (testDb) testDb.close();
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export async function createFullBackupArchiveFile(options?: {
  outputDir?: string;
  filenamePrefix?: string;
}) {
  if (!SQLITE_FILE) {
    throw new Error("Full export is only available in local (non-cloud) mode");
  }

  const timestamp = timestampForFilename();
  const tempDir = createTempDir("ozrouter-export-");
  const outputDir = options?.outputDir || os.tmpdir();
  const filename = `${options?.filenamePrefix || "ozrouter-full-backup"}-${timestamp}.tar.gz`;
  const archivePath = path.join(outputDir, filename);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const db = getDbInstance();

    await db.backup(path.join(tempDir, "storage.sqlite"));

    const settings: Record<string, string> = {};
    try {
      const rows = db.prepare("SELECT key, value FROM key_value").all() as {
        key: string;
        value: string;
      }[];
      for (const row of rows) settings[row.key] = row.value;
    } catch {
      /* optional summary */
    }
    writeJson(path.join(tempDir, "settings.json"), settings);

    try {
      writeJson(path.join(tempDir, "combos.json"), db.prepare("SELECT * FROM combos").all());
    } catch {
      writeJson(path.join(tempDir, "combos.json"), []);
    }

    try {
      writeJson(
        path.join(tempDir, "providers.json"),
        db
          .prepare(
            "SELECT id, provider, name, auth_type, is_active, email, created_at FROM provider_connections"
          )
          .all()
      );
    } catch {
      writeJson(path.join(tempDir, "providers.json"), []);
    }

    try {
      writeJson(
        path.join(tempDir, "api-keys.json"),
        db
          .prepare(
            "SELECT id, name, substr(key, 1, 8) as prefix, machine_id, created_at FROM api_keys"
          )
          .all()
      );
    } catch {
      writeJson(path.join(tempDir, "api-keys.json"), []);
    }

    if (CALL_LOGS_DIR && fs.existsSync(CALL_LOGS_DIR)) {
      fs.cpSync(CALL_LOGS_DIR, path.join(tempDir, "call_logs"), { recursive: true });
    }

    writeJson(path.join(tempDir, "metadata.json"), {
      exportedAt: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      format: FULL_BACKUP_FORMAT,
      contents: [
        "storage.sqlite - Full database",
        "settings.json - Key-value settings",
        "combos.json - Combo configurations",
        "providers.json - Provider connections (no credentials)",
        "api-keys.json - API key metadata (masked)",
        "call_logs/ - Detailed call log artifacts",
      ],
    });

    execFileSync(
      "tar",
      ["-czf", archivePath, "-C", path.dirname(tempDir), path.basename(tempDir)],
      {
        timeout: 30000,
      }
    );

    return {
      archivePath,
      filename,
      size: fs.statSync(archivePath).size,
    };
  } catch (error) {
    removeIfExists(archivePath);
    throw error;
  } finally {
    removeIfExists(tempDir);
  }
}

function listArchiveEntries(archivePath: string) {
  const listing = execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    timeout: 30000,
  });
  return listing
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertSafeArchiveEntries(entries: string[]) {
  if (entries.length === 0) {
    throw new Error("Full backup archive is empty.");
  }

  for (const entry of entries) {
    if (entry.startsWith("/") || entry.includes("\\") || entry.includes("\0")) {
      throw new Error("Full backup archive contains unsafe paths.");
    }
    const segments = entry.split("/").filter(Boolean);
    if (segments.length === 0 || segments.includes("..")) {
      throw new Error("Full backup archive contains unsafe paths.");
    }
  }

  const root = entries[0].split("/").filter(Boolean)[0];
  if (!root || entries.some((entry) => entry !== `${root}/` && !entry.startsWith(`${root}/`))) {
    throw new Error("Full backup archive must contain a single top-level directory.");
  }

  const requiredEntries = new Set([`${root}/metadata.json`, `${root}/storage.sqlite`]);
  for (const requiredEntry of requiredEntries) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Full backup archive is missing ${path.posix.basename(requiredEntry)}.`);
    }
  }

  return root;
}

function validateMetadata(extractRoot: string) {
  const metadataPath = path.join(extractRoot, "metadata.json");
  if (!fs.lstatSync(metadataPath).isFile()) {
    throw new Error("Full backup metadata is invalid.");
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { format?: string };
  if (metadata.format !== FULL_BACKUP_FORMAT) {
    throw new Error("Unsupported full backup format.");
  }
}

function assertRegularFile(filePath: string, description: string) {
  if (!fs.lstatSync(filePath).isFile()) {
    throw new Error(`${description} must be a regular file.`);
  }
}

function assertNoSymlinks(baseDir: string) {
  if (!fs.existsSync(baseDir)) return;

  const pending = [baseDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error("Full backup archive contains unsupported symbolic links.");
    }
    if (!stat.isDirectory()) continue;

    for (const entry of fs.readdirSync(current)) {
      pending.push(path.join(current, entry));
    }
  }
}

async function replaceCurrentSqlite(sqliteSourcePath: string) {
  if (!SQLITE_FILE) {
    throw new Error("Database import is only available in local (non-cloud) mode");
  }

  resetDbInstance();
  resetAllDbModuleState();

  const sqliteFilesToReplace = [
    SQLITE_FILE,
    `${SQLITE_FILE}-wal`,
    `${SQLITE_FILE}-shm`,
    `${SQLITE_FILE}-journal`,
  ];

  for (const filePath of sqliteFilesToReplace) {
    await unlinkFileWithRetry(filePath);
  }

  fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  fs.copyFileSync(sqliteSourcePath, SQLITE_FILE);
}

function replaceCallLogArtifacts(extractRoot: string) {
  if (!CALL_LOGS_DIR) return false;

  const sourcePath = path.join(extractRoot, "call_logs");
  if (!fs.existsSync(sourcePath)) {
    removeIfExists(CALL_LOGS_DIR);
    return false;
  }

  assertNoSymlinks(sourcePath);
  removeIfExists(CALL_LOGS_DIR);
  fs.mkdirSync(path.dirname(CALL_LOGS_DIR), { recursive: true });
  fs.cpSync(sourcePath, CALL_LOGS_DIR, { recursive: true });
  return true;
}

function preservePreImportBackup(archivePath: string | null, filename: string | null) {
  if (!archivePath || !filename) return null;

  const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const destination = path.join(backupDir, filename);
  fs.copyFileSync(archivePath, destination);
  return filename;
}

export async function restoreFullBackupArchiveFile(archivePath: string, originalFilename: string) {
  const entries = listArchiveEntries(archivePath);
  const archiveRootName = assertSafeArchiveEntries(entries);
  const extractParent = createTempDir("ozrouter-full-import-");
  let preImportArchivePath: string | null = null;
  let preImportArchiveFilename: string | null = null;

  try {
    execFileSync("tar", ["-xzf", archivePath, "-C", extractParent], { timeout: 30000 });
    const extractRoot = path.join(extractParent, archiveRootName);
    validateMetadata(extractRoot);

    const sqliteSourcePath = path.join(extractRoot, "storage.sqlite");
    assertRegularFile(sqliteSourcePath, "Full backup database");
    validateOzRouterDatabase(sqliteSourcePath);

    const preImportBackup = await createFullBackupArchiveFile({
      filenamePrefix: "ozrouter-full-pre-import",
    });
    preImportArchivePath = preImportBackup.archivePath;
    preImportArchiveFilename = preImportBackup.filename;

    await replaceCurrentSqlite(sqliteSourcePath);
    const callLogsRestored = replaceCallLogArtifacts(extractRoot);
    const preservedBackupFilename = preservePreImportBackup(
      preImportArchivePath,
      preImportArchiveFilename
    );

    const db = getDbInstance();
    const connectionCount = readCount(db, "provider_connections");
    const nodeCount = readCount(db, "provider_nodes");
    const comboCount = readCount(db, "combos");
    const apiKeyCount = readCount(db, "api_keys");

    return {
      imported: true,
      filename: originalFilename,
      preImportBackupFilename: preservedBackupFilename,
      connectionCount,
      nodeCount,
      comboCount,
      apiKeyCount,
      callLogsRestored,
    } satisfies FullBackupRestoreResult;
  } finally {
    removeIfExists(extractParent);
    removeIfExists(preImportArchivePath || "");
  }
}
