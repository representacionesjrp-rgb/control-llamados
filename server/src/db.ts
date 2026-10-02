import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type CallType = "outgoing" | "incoming" | "missed" | "rejected" | "blocked" | "voicemail" | "other";

export interface Executive {
  id: number;
  name: string;
  pair_code: string | null;
  device_model: string | null;
  last_sync_at: number | null;
  created_at: number;
}

export interface CallInput {
  deviceCallId: string;
  number: string;
  contactName?: string | null;
  type: CallType;
  startedAt: number;
  durationSec: number;
}

export function openDatabase(dataDir: string): DatabaseSync {
  const file = dataDir === ":memory:" ? ":memory:" : path.join(dataDir, "llamados.db");
  if (file !== ":memory:") fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS executives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pair_code TEXT UNIQUE,
      device_token_hash TEXT UNIQUE,
      device_model TEXT,
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      executive_id INTEGER NOT NULL REFERENCES executives(id) ON DELETE CASCADE,
      device_call_id TEXT NOT NULL,
      number TEXT NOT NULL,
      contact_name TEXT,
      type TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      duration_sec INTEGER NOT NULL,
      received_at INTEGER NOT NULL,
      UNIQUE (executive_id, device_call_id)
    );
    CREATE INDEX IF NOT EXISTS calls_by_exec_time ON calls (executive_id, started_at);
  `);
  return db;
}
