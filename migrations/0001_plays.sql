-- Play log for /api/listening. Filled every 30 minutes by the Worker's scheduled() handler from
-- Spotify's /me/player/recently-played. played_at (epoch ms) is unique per play for a single
-- account, so it's the primary key and INSERT OR IGNORE makes overlapping polls harmless.
CREATE TABLE IF NOT EXISTS plays (
  played_at   INTEGER PRIMARY KEY,
  track_id    TEXT NOT NULL,
  track_name  TEXT NOT NULL,
  artists     TEXT NOT NULL, -- JSON array of {id, name}
  album_image TEXT,
  duration_ms INTEGER
);
