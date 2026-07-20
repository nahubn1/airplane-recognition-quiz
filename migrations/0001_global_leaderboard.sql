CREATE TABLE IF NOT EXISTS profiles (
  device_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scores (
  device_id TEXT PRIMARY KEY REFERENCES profiles(device_id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 2900),
  best_streak INTEGER NOT NULL CHECK(best_streak >= 0 AND best_streak <= 10),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS scores_ranking_idx
  ON scores(score DESC, updated_at ASC);
