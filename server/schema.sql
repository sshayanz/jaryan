PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consent_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_at TEXT NOT NULL,
  ip_address TEXT,
  country_code TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_address TEXT,
  country_code TEXT,
  user_agent TEXT,
  platform TEXT,
  language TEXT,
  languages_json TEXT,
  timezone TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  device_memory REAL,
  touch_points INTEGER,
  referrer TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,
  mobile TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  page TEXT,
  device_json TEXT,
  ip_address TEXT,
  country_code TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_user ON user_devices(user_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
