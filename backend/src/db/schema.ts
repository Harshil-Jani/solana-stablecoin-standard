import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "sss.sqlite");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      stablecoin TEXT NOT NULL,
      data TEXT NOT NULL,
      signature TEXT NOT NULL UNIQUE,
      slot INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_stablecoin ON events(stablecoin);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      mint TEXT NOT NULL,
      actor TEXT NOT NULL,
      amount TEXT,
      target TEXT,
      signature TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ops_mint ON operations(mint);
    CREATE INDEX IF NOT EXISTS idx_ops_actor ON operations(actor);

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      secret TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function insertEvent(
  eventType: string,
  stablecoin: string,
  data: object,
  signature: string,
  slot: number,
  timestamp: number
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO events (event_type, stablecoin, data, signature, slot, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(eventType, stablecoin, JSON.stringify(data), signature, slot, timestamp);
}

export function insertOperation(
  operation: string,
  mint: string,
  actor: string,
  signature: string,
  amount?: string,
  target?: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO operations (operation, mint, actor, amount, target, signature) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(operation, mint, actor, amount ?? null, target ?? null, signature);
}

export function getEvents(stablecoin?: string, limit = 50, offset = 0) {
  const db = getDb();
  if (stablecoin) {
    return db.prepare(`SELECT * FROM events WHERE stablecoin = ? ORDER BY id DESC LIMIT ? OFFSET ?`).all(stablecoin, limit, offset);
  }
  return db.prepare(`SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
}

export function getOperations(mint?: string, limit = 50, offset = 0) {
  const db = getDb();
  if (mint) {
    return db.prepare(`SELECT * FROM operations WHERE mint = ? ORDER BY id DESC LIMIT ? OFFSET ?`).all(mint, limit, offset);
  }
  return db.prepare(`SELECT * FROM operations ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
}
