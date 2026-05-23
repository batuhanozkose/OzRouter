import { getDbInstance, rowToCamel } from "./core";
import { encrypt, decrypt } from "./encryption";

export interface RemoteInstanceRow {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  password: string | null;
  privateKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteInstancePublic {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  hasPassword: boolean;
  hasPrivateKey: boolean;
  createdAt: string;
  updatedAt: string;
}

function toPublic(row: RemoteInstanceRow): RemoteInstancePublic {
  return {
    id: row.id,
    label: row.label,
    host: row.host,
    port: row.port,
    username: row.username,
    authType: row.authType,
    hasPassword: !!row.password,
    hasPrivateKey: !!row.privateKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listInstances(): RemoteInstancePublic[] {
  const db = getDbInstance();
  const rows = db.prepare("SELECT * FROM remote_instances ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => toPublic(rowToCamel(r) as unknown as RemoteInstanceRow));
}

export function getInstance(id: string): RemoteInstanceRow | null {
  const db = getDbInstance();
  const row = db
    .prepare("SELECT * FROM remote_instances WHERE id = ?")
    .get(id) as any;
  if (!row) return null;
  const instance = rowToCamel(row) as unknown as RemoteInstanceRow;
  if (instance.password) instance.password = decrypt(instance.password) ?? instance.password;
  if (instance.privateKey) instance.privateKey = decrypt(instance.privateKey) ?? instance.privateKey;
  return instance;
}

export function createInstance(fields: {
  label: string;
  host: string;
  port?: number;
  username: string;
  authType: "password" | "privateKey";
  password?: string;
  privateKey?: string;
}): RemoteInstancePublic {
  const db = getDbInstance();
  const id = crypto.randomUUID();
  const port = fields.port ?? 22;
  const encPassword = fields.password ? encrypt(fields.password) : null;
  const encPrivateKey = fields.privateKey ? encrypt(fields.privateKey) : null;

  db.prepare(
    `INSERT INTO remote_instances (id, label, host, port, username, auth_type, password, private_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fields.label, fields.host, port, fields.username, fields.authType, encPassword, encPrivateKey);

  const row = db.prepare("SELECT * FROM remote_instances WHERE id = ?").get(id) as any;
  return toPublic(rowToCamel(row) as unknown as RemoteInstanceRow);
}

export function deleteInstance(id: string): boolean {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM remote_instances WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateInstance(
  id: string,
  fields: Partial<{
    label: string;
    host: string;
    port: number;
    username: string;
    authType: "password" | "privateKey";
    password: string | null;
    privateKey: string | null;
  }>
): RemoteInstancePublic | null {
  const db = getDbInstance();
  const existing = db
    .prepare("SELECT * FROM remote_instances WHERE id = ?")
    .get(id) as any;
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: any[] = [];

  if (fields.label !== undefined) {
    setClauses.push("label = ?");
    values.push(fields.label);
  }
  if (fields.host !== undefined) {
    setClauses.push("host = ?");
    values.push(fields.host);
  }
  if (fields.port !== undefined) {
    setClauses.push("port = ?");
    values.push(fields.port);
  }
  if (fields.username !== undefined) {
    setClauses.push("username = ?");
    values.push(fields.username);
  }
  if (fields.authType !== undefined) {
    setClauses.push("auth_type = ?");
    values.push(fields.authType);
  }
  if (fields.password !== undefined) {
    setClauses.push("password = ?");
    values.push(fields.password ? encrypt(fields.password) : null);
  }
  if (fields.privateKey !== undefined) {
    setClauses.push("private_key = ?");
    values.push(fields.privateKey ? encrypt(fields.privateKey) : null);
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE remote_instances SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

  const row = db.prepare("SELECT * FROM remote_instances WHERE id = ?").get(id) as any;
  return toPublic(rowToCamel(row) as unknown as RemoteInstanceRow);
}
