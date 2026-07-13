const FEED_URL = 'https://feeds.bbci.co.uk/news/world/rss.xml';
const CACHE_TTL_SECONDS = 300;
const MAX_HEADLINES = 12;

function extractHeadlines(xml, max) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const headlines = [];
  for (const item of items) {
    const match = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    if (match && match[1]) headlines.push(match[1].trim());
    if (headlines.length >= max) break;
  }
  return headlines;
}

async function handleNewsRequest(request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const feedRes = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PARWANI-site/1.0)' },
    });
    if (!feedRes.ok) throw new Error(`BBC feed returned ${feedRes.status}`);
    const xml = await feedRes.text();
    const headlines = extractHeadlines(xml, MAX_HEADLINES);
    if (!headlines.length) throw new Error('No headlines parsed from feed');

    const response = new Response(JSON.stringify({ headlines, fetchedAt: new Date().toISOString() }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// version_metadata's timestamp is the actual deploy time of the running Worker version (set by
// Cloudflare Workers Builds when `git push` triggers the auto-deploy) — no external fetch needed.
function handleLastUpdatedRequest(env) {
  const lastUpdated = new Date(env.CF_VERSION_METADATA.timestamp).toISOString();
  return new Response(JSON.stringify({ lastUpdated }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
}

const RECCOBEATS_API_BASE = 'https://api.reccobeats.com/v1';
const BPM_CACHE_TTL_SECONDS = 3600;

// Camelot notation shares the same wheel position as standard pitch-class + mode, just
// relabelled — index by Spotify/ReccoBeats's pitch class (0=C .. 11=B), major vs minor picks
// the table. Relative major/minor pairs intentionally share a number (e.g. C major=8B, A minor=8A).
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

function pitchClassToCamelot(key, mode) {
  if (key == null || key < 0 || key > 11) return null;
  return mode === 1 ? CAMELOT_MAJOR[key] : CAMELOT_MINOR[key];
}

// Spotify's Client Credentials flow (app-only, no user login) — still fully open post the Nov
// 2024 API changes, unlike Recommendations/Audio Features/Related Artists which now require
// Extended Quota Mode. Only used for /v1/search, which was never restricted.
async function getSpotifyToken(env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify auth returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.access_token;
}

// Spotify deprecated Audio Features for new apps in Nov 2024, so tempo/key comes from ReccoBeats
// instead — it re-derives the same audio-analysis metrics and accepts Spotify track IDs directly,
// which keeps this tool on Spotify's live catalog rather than a stale crowd-sourced database.
// Chain: Spotify Search (title/artist -> Spotify track id) -> ReccoBeats /track (Spotify id ->
// ReccoBeats id) -> ReccoBeats /track/:id/audio-features (tempo + key + mode).
// Both Spotify credentials stay server-side: the client secret can't be exposed, and Client
// Credentials tokens are app-authenticated, not something to hand to the browser.
async function handleBpmLookup(request, env, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'Lookup is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const token = await getSpotifyToken(env);
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!searchRes.ok) {
      throw new Error(`Spotify search returned ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}`);
    }
    const searchData = await searchRes.json();
    const tracks = (searchData.tracks && searchData.tracks.items) || [];

    let results = [];
    if (tracks.length) {
      const idsParam = tracks.map(t => `ids=${encodeURIComponent(t.id)}`).join('&');
      const rbRes = await fetch(`${RECCOBEATS_API_BASE}/track?${idsParam}`, {
        headers: { Accept: 'application/json' },
      });
      if (!rbRes.ok) throw new Error(`ReccoBeats track lookup returned ${rbRes.status}`);
      const rbData = await rbRes.json();
      const rbTracks = (rbData && rbData.content) || [];

      // ReccoBeats' own id is opaque; it echoes back the source Spotify URL in `href`, which is
      // how we map its rows back to the Spotify track each one came from.
      const rbBySpotifyId = new Map();
      for (const rb of rbTracks) {
        const m = /\/track\/([A-Za-z0-9]+)/.exec(rb.href || '');
        if (m) rbBySpotifyId.set(m[1], rb);
      }

      results = await Promise.all(tracks.map(async track => {
        const base = {
          title: track.name || null,
          artist: (track.artists || []).map(a => a.name).join(', ') || null,
          tempo: null,
          key: null,
        };
        const rb = rbBySpotifyId.get(track.id);
        if (!rb) return base;
        try {
          const featRes = await fetch(`${RECCOBEATS_API_BASE}/track/${rb.id}/audio-features`, {
            headers: { Accept: 'application/json' },
          });
          if (!featRes.ok) return base;
          const feat = await featRes.json();
          return {
            ...base,
            tempo: typeof feat.tempo === 'number' ? Math.round(feat.tempo) : null,
            key: pitchClassToCamelot(feat.key, feat.mode),
          };
        } catch {
          return base;
        }
      }));
    }

    const response = new Response(JSON.stringify({ results }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${BPM_CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Same Spotify->ReccoBeats chain as handleBpmLookup, but returns the full audio-features vector
// (all 9 primitives) for the best-match track instead of just tempo/key across 8 candidates —
// feeds both the Sounds Like seed lookup and the offline corpus builder (scripts/build-corpus.mjs).
// Raw ReccoBeats values, no normalization here — norm params live in the corpus JSON so seed and
// corpus normalize identically at runtime.
async function handleAudioFeatures(request, env, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'Lookup is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const token = await getSpotifyToken(env);
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!searchRes.ok) {
      throw new Error(`Spotify search returned ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}`);
    }
    const searchData = await searchRes.json();
    const tracks = (searchData.tracks && searchData.tracks.items) || [];
    const top = tracks[0];

    if (!top) {
      const response = new Response(JSON.stringify({ match: null, features: null }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${BPM_CACHE_TTL_SECONDS}` },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    const rbRes = await fetch(`${RECCOBEATS_API_BASE}/track?ids=${encodeURIComponent(top.id)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!rbRes.ok) throw new Error(`ReccoBeats track lookup returned ${rbRes.status}`);
    const rbData = await rbRes.json();
    const rbTracks = (rbData && rbData.content) || [];

    const match = {
      title: top.name || null,
      artist: (top.artists || []).map(a => a.name).join(', ') || null,
      spotifyId: top.id,
    };

    const rb = rbTracks.find(t => {
      const m = /\/track\/([A-Za-z0-9]+)/.exec(t.href || '');
      return m && m[1] === top.id;
    });

    let features = null;
    if (rb) {
      const featRes = await fetch(`${RECCOBEATS_API_BASE}/track/${rb.id}/audio-features`, {
        headers: { Accept: 'application/json' },
      });
      if (featRes.ok) {
        const feat = await featRes.json();
        features = {
          danceability: feat.danceability ?? null,
          energy: feat.energy ?? null,
          valence: feat.valence ?? null,
          acousticness: feat.acousticness ?? null,
          instrumentalness: feat.instrumentalness ?? null,
          liveness: feat.liveness ?? null,
          speechiness: feat.speechiness ?? null,
          loudness: feat.loudness ?? null,
          tempo: feat.tempo ?? null,
          key: feat.key ?? null,
          mode: feat.mode ?? null,
        };
      }
    }

    const response = new Response(JSON.stringify({ match, features }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${BPM_CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

const FREESOUND_API_BASE = 'https://freesound.org/apiv2';
const SAMPLE_CACHE_TTL_SECONDS = 3600;

// Freesound has no dedicated "vocal"/"melody" facet, so each mode is a curated OR-group of
// established community tags — a heuristic, not a guarantee, same as everywhere else in this
// tool we favor an honest best-effort over a false sense of precision.
const SAMPLE_MODE_TAGS = {
  vocals: '(vocals OR vocal OR acapella OR acappella OR singing OR choir OR "vocal-chop")',
  melody: '(melody OR melodic OR lead OR tune OR arpeggio OR "melody-loop")',
};

function freesoundLicenseLabel(licenseUrl) {
  if (!licenseUrl) return null;
  const url = licenseUrl.toLowerCase();
  if (url.includes('publicdomain/zero') || url.includes('cc0')) return 'CC0';
  if (url.includes('sampling+')) return 'Sampling+';
  if (url.includes('by-nc-sa')) return 'CC BY-NC-SA';
  if (url.includes('by-nc')) return 'CC BY-NC';
  if (url.includes('by-sa')) return 'CC BY-SA';
  if (url.includes('/by/')) return 'CC BY';
  return 'CC';
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Freesound's API key is a single query-param token (no OAuth needed for search/previews) but
// still has to stay server-side: it's rate-limited per key (60/min, 2000/day) and a client-side
// key would let anyone burn that quota or scrape it out of the page source.
async function handleSampleSearch(request, env, ctx) {
  const url = new URL(request.url);
  const mode = SAMPLE_MODE_TAGS[url.searchParams.get('mode')] ? url.searchParams.get('mode') : 'vocals';
  const q = (url.searchParams.get('q') || '').trim();
  const bpmMin = url.searchParams.get('bpm_min');
  const bpmMax = url.searchParams.get('bpm_max');

  if (!env.FREESOUND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Lookup is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    let filter = `category:Music tag:${SAMPLE_MODE_TAGS[mode]}`;
    if (bpmMin || bpmMax) filter += ` bpm:[${bpmMin || '*'} TO ${bpmMax || '*'}]`;

    const params = new URLSearchParams({
      query: q,
      filter,
      fields: 'id,name,username,tags,license,duration,previews,url,bpm',
      page_size: '12',
      token: env.FREESOUND_API_KEY,
    });
    const apiRes = await fetch(`${FREESOUND_API_BASE}/search/?${params.toString()}`);
    if (!apiRes.ok) throw new Error(`Freesound returned ${apiRes.status}: ${(await apiRes.text()).slice(0, 200)}`);
    const data = await apiRes.json();

    const results = (data.results || []).map(s => ({
      name: s.name || null,
      username: s.username || null,
      tags: (s.tags || []).slice(0, 5),
      duration: formatDuration(s.duration),
      bpm: typeof s.bpm === 'number' && s.bpm > 0 ? Math.round(s.bpm) : null,
      license: freesoundLicenseLabel(s.license),
      previewUrl: (s.previews && (s.previews['preview-hq-mp3'] || s.previews['preview-lq-mp3'])) || null,
      pageUrl: s.url || null,
    }));

    const response = new Response(JSON.stringify({ results }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${SAMPLE_CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Cloudflare's static-asset serving answers HTTP Range requests with a full 200 instead of a
// 206, and omits Accept-Ranges. Browsers therefore can't seek into audio that isn't fully
// buffered yet — clicking the seek bar restarts the track. We route /audio/ through the Worker
// and implement range handling ourselves so seeking works reliably.
async function handleAsset(request, env) {
  const range = request.headers.get('Range');
  const assetRes = await env.ASSETS.fetch(request);

  // Already partial, or not a plain 200 we can slice (404/304/etc) — pass straight through.
  if (assetRes.status === 206 || assetRes.status !== 200) return assetRes;

  // No range (or an open-ended/unparseable one) — return the full file but advertise that
  // range requests are supported, so the browser knows it's allowed to seek.
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    const headers = new Headers(assetRes.headers);
    headers.set('Accept-Ranges', 'bytes');
    return new Response(assetRes.body, { status: 200, statusText: assetRes.statusText, headers });
  }

  const buf = await assetRes.arrayBuffer();
  const size = buf.byteLength;

  let start, end;
  if (m[1] === '') {
    // suffix range: bytes=-N → last N bytes
    start = Math.max(size - parseInt(m[2], 10), 0);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  }

  if (isNaN(start) || isNaN(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    });
  }
  end = Math.min(end, size - 1);

  const headers = new Headers(assetRes.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.delete('Content-Encoding'); // body is raw bytes; drop any stale encoding header

  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/news') {
      return handleNewsRequest(request, ctx);
    }
    if (url.pathname === '/api/last-updated') {
      return handleLastUpdatedRequest(env);
    }
    if (url.pathname === '/api/bpm-lookup') {
      return handleBpmLookup(request, env, ctx);
    }
    if (url.pathname === '/api/audio-features') {
      return handleAudioFeatures(request, env, ctx);
    }
    if (url.pathname === '/api/sample-search') {
      return handleSampleSearch(request, env, ctx);
    }
    if (url.pathname.startsWith('/audio/')) {
      return handleAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
