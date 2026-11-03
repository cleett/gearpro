CREATE TABLE IF NOT EXISTS authors_auth (
  email TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  author_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,
  author_name TEXT NOT NULL,
  month TEXT NOT NULL,
  views INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (author, month)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('rate_view', '20'),
  ('rate_like', '50'),
  ('cap_monthly', '300000');
