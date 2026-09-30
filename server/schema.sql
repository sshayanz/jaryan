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

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  local_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_consents (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  consent_at TEXT NOT NULL,
  ip_address TEXT,
  country_code TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(member_id, consent_at)
);

CREATE TABLE IF NOT EXISTS member_devices (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_address TEXT,
  country_code TEXT,
  user_agent TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(member_id, device_key)
);

CREATE TABLE IF NOT EXISTS poem_views (
  poem_id TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_shares (
  share_key TEXT PRIMARY KEY,
  poem_id TEXT NOT NULL,
  couplet_index INTEGER,
  shares INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
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
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_members_last_seen ON members(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_member_devices_member ON member_devices(member_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_member_consents_member ON member_consents(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_devices_user ON user_devices(user_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_content_shares_rank ON content_shares(couplet_index, shares DESC, updated_at DESC);
