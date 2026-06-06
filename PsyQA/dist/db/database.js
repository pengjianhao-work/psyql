"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = getDbPath;
exports.getDb = getDb;
exports.getMeta = getMeta;
exports.setMeta = setMeta;
exports.closeDb = closeDb;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const paths_1 = require("../config/paths");
let db = null;
function getDbPath() {
    const custom = process.env.PSYQA_DB_PATH;
    if (custom === ':memory:')
        return ':memory:';
    if (custom)
        return path_1.default.resolve(custom);
    return (0, paths_1.serverDataPath)('psyqa.db');
}
function getDb() {
    if (db)
        return db;
    const dbPath = getDbPath();
    if (dbPath !== ':memory:') {
        fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
    }
    db = new better_sqlite3_1.default(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    return db;
}
function initSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);

    CREATE TABLE IF NOT EXISTS dialogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      dialog_time TEXT NOT NULL,
      user_text TEXT NOT NULL,
      bot_text TEXT NOT NULL,
      summary TEXT NOT NULL,
      report TEXT,
      psych_json TEXT,
      portrait_json TEXT,
      UNIQUE(user_id, dialog_time)
    );
    CREATE INDEX IF NOT EXISTS idx_dialogs_user ON dialogs(user_id, dialog_time);

    CREATE TABLE IF NOT EXISTS dialog_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      summary_time TEXT NOT NULL,
      summary TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_user ON dialog_summaries(user_id);

    CREATE TABLE IF NOT EXISTS school_alerts (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      org_id TEXT,
      status TEXT,
      student_id TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_org_status ON school_alerts(org_id, status);

    CREATE TABLE IF NOT EXISTS vector_documents (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT
    );

    CREATE TABLE IF NOT EXISTS session_feedback (
      user_id TEXT NOT NULL,
      dialog_time TEXT NOT NULL,
      rating INTEGER,
      helpful INTEGER,
      comment TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, dialog_time)
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      user_id TEXT PRIMARY KEY,
      session_count INTEGER NOT NULL DEFAULT 0,
      feedback_count INTEGER NOT NULL DEFAULT 0,
      avg_rating REAL,
      helpful_rate REAL,
      profile_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_agent_profile (
      user_id TEXT PRIMARY KEY,
      basic_json TEXT,
      emotion_timeline_json TEXT NOT NULL DEFAULT '[]',
      intervention_json TEXT,
      agent_system_prompt TEXT,
      agent_phase TEXT NOT NULL DEFAULT 'collect',
      first_dialog_at TEXT,
      monthly_summaries_json TEXT NOT NULL DEFAULT '[]',
      annual_reports_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_dialog_vectors (
      user_id TEXT NOT NULL,
      dialog_time TEXT NOT NULL,
      chroma_id TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      month TEXT,
      emotion TEXT,
      trigger_tag TEXT,
      content_preview TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, dialog_time)
    );
  `);
}
function getMeta(key) {
    var _a;
    const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return (_a = row === null || row === void 0 ? void 0 : row.value) !== null && _a !== void 0 ? _a : null;
}
function setMeta(key, value) {
    getDb().prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
