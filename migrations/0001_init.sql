CREATE TABLE IF NOT EXISTS reviews (
  slug TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  author_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS views (
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, day)
);

CREATE TABLE IF NOT EXISTS view_dedup (
  ip_hash TEXT NOT NULL,
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (ip_hash, slug, day)
);

CREATE TABLE IF NOT EXISTS votes (
  ip_hash TEXT NOT NULL,
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (ip_hash, slug)
);

CREATE INDEX IF NOT EXISTS votes_slug_idx ON votes (slug);
CREATE INDEX IF NOT EXISTS votes_ip_day_idx ON votes (ip_hash, day);
