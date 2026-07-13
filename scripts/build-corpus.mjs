// Offline corpus builder for the "Sounds Like" project. Run manually — not deployed, not served
// (sibling of worker/, outside public/). Reads a fixed list of exact Spotify track IDs, resolves
// each straight through Spotify /v1/tracks (batch, no fuzzy search needed since IDs are exact),
// joins to ReccoBeats for the audio-features vector (reusing worker/index.js's own join code, not
// duplicating it), normalizes tempo/loudness to 0..1, and writes public/sounds-like-corpus.json.
//
// Usage: SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/build-corpus.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSpotifyToken, reccobeatsBatchLookup, reccobeatsAudioFeatures } from '../worker/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SONG_LIST_PATH = join(__dirname, 'corpus-songs.txt');
const OUTPUT_PATH = join(__dirname, '..', 'public', 'sounds-like-corpus.json');

const FEATURE_ORDER = [
  'danceability', 'energy', 'valence', 'acousticness',
  'instrumentalness', 'liveness', 'speechiness', 'loudness', 'tempo',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Spotify's batch /v1/tracks endpoint takes up to 50 comma-separated ids per call.
async function fetchSpotifyTracksBatch(ids, token) {
  const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${ids.join(',')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify /v1/tracks returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.tracks || [];
}

// ReccoBeats' batch limit isn't documented; adapt by halving on failure rather than guessing wrong
// and losing an entire chunk.
async function reccobeatsBatchLookupAdaptive(ids) {
  try {
    return await reccobeatsBatchLookup(ids);
  } catch (err) {
    if (ids.length <= 1) {
      console.warn(`  ReccoBeats lookup failed for ${ids[0]}: ${err.message}`);
      return new Map();
    }
    const mid = Math.ceil(ids.length / 2);
    const [a, b] = await Promise.all([
      reccobeatsBatchLookupAdaptive(ids.slice(0, mid)),
      reccobeatsBatchLookupAdaptive(ids.slice(mid)),
    ]);
    return new Map([...a, ...b]);
  }
}

async function main() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error('Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET in the environment.');
    process.exit(1);
  }
  const env = {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  };

  const ids = readFileSync(SONG_LIST_PATH, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  console.log(`Read ${ids.length} track ids from ${SONG_LIST_PATH}`);

  const token = await getSpotifyToken(env);

  // Step 1: resolve title/artist for every id via Spotify's batch endpoint (50/call).
  const spotifyTrackById = new Map();
  for (const idsChunk of chunk(ids, 50)) {
    const tracks = await fetchSpotifyTracksBatch(idsChunk, token);
    tracks.forEach((t, i) => {
      if (t) spotifyTrackById.set(t.id, t);
      else console.warn(`  Spotify has no track for id ${idsChunk[i]}`);
    });
    await sleep(200);
  }

  // Step 2: join to ReccoBeats in adaptive-size batches (reuses worker/index.js's join code).
  const rbBySpotifyId = new Map();
  for (const idsChunk of chunk([...spotifyTrackById.keys()], 40)) {
    const batchMap = await reccobeatsBatchLookupAdaptive(idsChunk);
    for (const [k, v] of batchMap) rbBySpotifyId.set(k, v);
    await sleep(200);
  }

  // Step 3: fetch audio-features one track at a time (no ReccoBeats batch endpoint for this).
  const rawSongs = [];
  let miss = 0;
  for (const [spotifyId, track] of spotifyTrackById) {
    const rb = rbBySpotifyId.get(spotifyId);
    if (!rb) {
      console.warn(`  No ReccoBeats match for ${track.name} — ${(track.artists || []).map(a => a.name).join(', ')} (${spotifyId})`);
      miss++;
      await sleep(200);
      continue;
    }
    const feat = await reccobeatsAudioFeatures(rb.id);
    if (!feat) {
      console.warn(`  No audio-features for ${track.name} — ${(track.artists || []).map(a => a.name).join(', ')} (${spotifyId})`);
      miss++;
      await sleep(200);
      continue;
    }
    rawSongs.push({
      title: track.name || null,
      artist: (track.artists || []).map(a => a.name).join(', ') || null,
      spotifyId,
      raw: feat,
    });
    await sleep(200);
  }
  console.log(`Resolved ${rawSongs.length} songs, ${miss} misses (of ${ids.length} input ids).`);

  // Step 4: normalization params for the two non-0..1 features.
  const tempos = rawSongs.map(s => s.raw.tempo).filter(v => typeof v === 'number');
  const loudnesses = rawSongs.map(s => s.raw.loudness).filter(v => typeof v === 'number');
  const norm = {
    tempo: { min: Math.min(...tempos), max: Math.max(...tempos) },
    loudness: { min: Math.min(...loudnesses), max: Math.max(...loudnesses) },
  };
  const normalize = (feature, value) => {
    if (typeof value !== 'number') return 0;
    if (feature === 'tempo' || feature === 'loudness') {
      const { min, max } = norm[feature];
      return max === min ? 0 : (value - min) / (max - min);
    }
    return value; // already 0..1
  };

  const songs = rawSongs.map(s => ({
    title: s.title,
    artist: s.artist,
    spotifyId: s.spotifyId,
    vec: FEATURE_ORDER.map(f => normalize(f, s.raw[f])),
  }));

  const corpus = { version: 1, norm, features: FEATURE_ORDER, songs };
  writeFileSync(OUTPUT_PATH, JSON.stringify(corpus, null, 2));
  console.log(`Wrote ${songs.length} songs to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
