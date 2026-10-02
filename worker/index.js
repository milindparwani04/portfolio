import GIG_PICKS from './gig-picks.json';

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
// Exported so scripts/build-corpus.mjs (offline, Node) can reuse it verbatim against a locally
// supplied SPOTIFY_CLIENT_ID/SECRET instead of duplicating the token exchange.
export async function getSpotifyToken(env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Spotify auth returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.access_token;
}

// Shared ReccoBeats join, used by handleBpmLookup, handleAudioFeatures, and (via import)
// scripts/build-corpus.mjs. ReccoBeats' own id is opaque; it echoes back the source Spotify URL
// in `href`, which is how we map its rows back to the Spotify track each one came from.
// Exported for reuse — do not duplicate this mapping elsewhere.
export async function reccobeatsBatchLookup(spotifyIds) {
  if (!spotifyIds.length) return new Map();
  const idsParam = spotifyIds.map(id => `ids=${encodeURIComponent(id)}`).join('&');
  const rbRes = await fetch(`${RECCOBEATS_API_BASE}/track?${idsParam}`, {
    headers: { Accept: 'application/json' },
  });
  if (!rbRes.ok) throw new Error(`ReccoBeats track lookup returned ${rbRes.status}`);
  const rbData = await rbRes.json();
  const rbTracks = (rbData && rbData.content) || [];
  const rbBySpotifyId = new Map();
  for (const rb of rbTracks) {
    const m = /\/track\/([A-Za-z0-9]+)/.exec(rb.href || '');
    if (m) rbBySpotifyId.set(m[1], rb);
  }
  return rbBySpotifyId;
}

// Single-track ReccoBeats audio-features fetch (no batch endpoint exists for this one). Returns
// the raw ReccoBeats JSON, or null on any non-2xx/parse failure — caller decides how to degrade.
export async function reccobeatsAudioFeatures(rbId) {
  const featRes = await fetch(`${RECCOBEATS_API_BASE}/track/${rbId}/audio-features`, {
    headers: { Accept: 'application/json' },
  });
  if (!featRes.ok) return null;
  return featRes.json();
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
      const rbBySpotifyId = await reccobeatsBatchLookup(tracks.map(t => t.id));

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
          const feat = await reccobeatsAudioFeatures(rb.id);
          if (!feat) return base;
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

    const rbBySpotifyId = await reccobeatsBatchLookup([top.id]);

    const match = {
      title: top.name || null,
      artist: (top.artists || []).map(a => a.name).join(', ') || null,
      spotifyId: top.id,
    };

    const rb = rbBySpotifyId.get(top.id);

    let features = null;
    if (rb) {
      const feat = await reccobeatsAudioFeatures(rb.id);
      if (feat) {
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

const SPOTIFY_REDIRECT_URI = 'https://milindparwani.com/api/spotify/callback';
// Last.fm (public, free API key, no OAuth): the Gig Finder reads artists' top tags to judge
// whether a concert is English-language.
const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';
const GIGS_CACHE_TTL_SECONDS = 3600;

async function exchangeSpotifyToken(env, params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Spotify token endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Step 1 of the one-time Spotify user-auth flow (Authorization Code, scope user-top-read) that
// lets /api/gigs read the site owner's actual top artists — the existing Client Credentials flow
// (getSpotifyToken) is app-only and can never see personal data, no matter what scope is asked
// for. Gated by a random secret query param: this route sends whoever loads it to Spotify's real
// consent screen and whatever account approves becomes "the" stored top-artists source, so an
// unauthenticated public URL would let any bot/scanner that stumbles onto it silently hijack the
// gig rail's data. `state` is stored in KV (10 min TTL) and re-checked in the callback as CSRF
// protection, standard for this OAuth flow regardless of the extra key gate.
async function handleSpotifyAuthorize(request, env) {
  const url = new URL(request.url);
  if (!env.SPOTIFY_AUTH_KEY || url.searchParams.get('key') !== env.SPOTIFY_AUTH_KEY) {
    return new Response('Forbidden', { status: 403 });
  }
  const state = crypto.randomUUID();
  await env.GIG_KV.put(`oauth_state:${state}`, '1', { expirationTtl: 600 });

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', env.SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
  // user-read-currently-playing: /api/now-playing. user-read-recently-played: the play log cron
  // and now-playing's "last played" fallback. Adding a scope means re-running this flow once.
  authUrl.searchParams.set('scope', 'user-top-read user-read-currently-playing user-read-recently-played');
  authUrl.searchParams.set('state', state);
  return Response.redirect(authUrl.toString(), 302);
}

// Step 2: Spotify redirects back here with a code (or an error, if consent was declined).
// Exchanges the code for a refresh token and persists it in KV — that refresh token is the only
// long-lived credential /api/gigs needs; access tokens are minted fresh from it on every call.
async function handleSpotifyCallback(request, env) {
  const url = new URL(request.url);
  const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  // Fixed messages only — never echo query params or error text into this HTML (finding S-01).
  if (url.searchParams.get('error')) {
    console.error('Spotify authorization declined', { error: url.searchParams.get('error') });
    return html('<p>Spotify authorization failed.</p>');
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return html('<p>Missing code or state.</p>');

  const stateKey = `oauth_state:${state}`;
  const stateOk = await env.GIG_KV.get(stateKey);
  if (!stateOk) return html('<p>Invalid or expired authorization attempt — start again at /api/spotify/authorize.</p>');
  await env.GIG_KV.delete(stateKey);

  try {
    const data = await exchangeSpotifyToken(env, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }));
    if (!data.refresh_token) throw new Error('Spotify did not return a refresh token');
    await env.GIG_KV.put('spotify_refresh_token', data.refresh_token);
    return html('<p>Connected. You can close this tab.</p>');
  } catch (err) {
    console.error('Spotify token exchange failed', { message: err.message });
    return html('<p>Token exchange failed.</p>');
  }
}

// Mints a fresh user access token from the stored refresh token. Spotify occasionally rotates
// the refresh token itself on a refresh grant — if it sends a new one, persist it, or the next
// call would refresh against a now-invalid token.
async function refreshSpotifyUserAccessToken(env) {
  const refreshToken = await env.GIG_KV.get('spotify_refresh_token');
  if (!refreshToken) throw new Error('Spotify account not connected — visit /api/spotify/authorize first');
  const data = await exchangeSpotifyToken(env, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
  if (data.refresh_token) await env.GIG_KV.put('spotify_refresh_token', data.refresh_token);
  return data.access_token;
}

// Heart rate: the dashboard Health card reads the owner's latest Fitbit reading from the Google
// Health API (the Fitbit Web API's replacement). Same owner-only OAuth shape as Spotify above:
// a key-gated authorize route, a state-checked callback that stores a refresh token in KV, and a
// read route that mints access tokens from it. The scope is read-only and limited to health
// metrics; googlehealth.* scopes are "restricted", so the OAuth app runs unverified in production
// (single user, under Google's 100-user cap) — Testing mode would expire the token every 7 days.
const GOOGLE_HEALTH_API_BASE = 'https://health.googleapis.com/v4';
const GOOGLE_HEALTH_REDIRECT_URI = 'https://milindparwani.com/api/health/callback';
const GOOGLE_HEALTH_SCOPE = 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly';
const HEART_RATE_CACHE_TTL_SECONDS = 30;
// The Air only uploads when it syncs with the phone app; anything older than this is shown as
// "no recent reading" rather than a stale number.
const HEART_RATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// Constant-time comparison for owner keys (see S-07); length leak is acceptable for a random key.
function ownerKeyMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

function googleHealthConfigured(env) {
  return Boolean(env.GOOGLE_HEALTH_CLIENT_ID && env.GOOGLE_HEALTH_CLIENT_SECRET);
}

async function exchangeGoogleToken(env, params) {
  params.set('client_id', env.GOOGLE_HEALTH_CLIENT_ID);
  params.set('client_secret', env.GOOGLE_HEALTH_CLIENT_SECRET);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google token endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// access_type=offline + prompt=consent make Google return a refresh token every time.
// include_granted_scopes is deliberately not set: mixing in legacy fitness.* grants breaks consent.
async function handleHealthAuthorize(request, env) {
  const url = new URL(request.url);
  if (!googleHealthConfigured(env) || !ownerKeyMatches(url.searchParams.get('key'), env.HEALTH_AUTH_KEY)) {
    return new Response('Forbidden', { status: 403 });
  }
  const state = crypto.randomUUID();
  await env.GIG_KV.put(`health_oauth_state:${state}`, '1', { expirationTtl: 600 });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_HEALTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_HEALTH_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_HEALTH_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  return Response.redirect(authUrl.toString(), 302);
}

// Fixed messages only — never echo query params or error text into this HTML (see S-01).
async function handleHealthCallback(request, env) {
  const url = new URL(request.url);
  const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  if (url.searchParams.get('error')) {
    console.error('Google Health authorization declined', { error: url.searchParams.get('error') });
    return html('<p>Google Health authorization failed.</p>');
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return html('<p>Missing code or state.</p>');

  const stateKey = `health_oauth_state:${state}`;
  if (!(await env.GIG_KV.get(stateKey))) {
    return html('<p>Invalid or expired authorization attempt — start again at /api/health/authorize.</p>');
  }
  await env.GIG_KV.delete(stateKey);

  try {
    const data = await exchangeGoogleToken(env, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: GOOGLE_HEALTH_REDIRECT_URI,
    }));
    if (!data.refresh_token) throw new Error('Google did not return a refresh token');
    await env.GIG_KV.put('health_refresh_token', data.refresh_token);
    return html('<p>Connected. You can close this tab.</p>');
  } catch (err) {
    console.error('Google Health token exchange failed', { message: err.message });
    return html('<p>Token exchange failed.</p>');
  }
}

async function refreshGoogleHealthAccessToken(env) {
  const refreshToken = await env.GIG_KV.get('health_refresh_token');
  if (!refreshToken) throw new Error('Google Health not connected — visit /api/health/authorize first');
  const data = await exchangeGoogleToken(env, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
  if (data.refresh_token) await env.GIG_KV.put('health_refresh_token', data.refresh_token);
  return data.access_token;
}

// Results are ordered newest first, so pageSize=1 over the lookback window is the latest reading.
// Response: { bpm, sampledAt, motion } — all null when there's no reading in the window.
async function handleHeartRate(env, ctx) {
  if (!googleHealthConfigured(env)) return jsonResponse({ error: 'Lookup is not configured' }, 503);
  return serveCached('heart-rate', HEART_RATE_CACHE_TTL_SECONDS, ctx, async () => {
    const token = await refreshGoogleHealthAccessToken(env);
    const since = new Date(Date.now() - HEART_RATE_LOOKBACK_MS).toISOString();
    const params = new URLSearchParams({
      pageSize: '1',
      filter: `heart_rate.sample_time.physical_time >= "${since}"`,
    });
    const res = await fetch(`${GOOGLE_HEALTH_API_BASE}/users/me/dataTypes/heart-rate/dataPoints?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Google Health heart-rate returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const reading = data.dataPoints && data.dataPoints[0] && data.dataPoints[0].heartRate;
    const bpm = reading ? Number(reading.beatsPerMinute) : NaN;
    if (!reading || !Number.isFinite(bpm)) return { bpm: null, sampledAt: null, motion: null };
    return {
      bpm: Math.round(bpm),
      sampledAt: (reading.sampleTime && reading.sampleTime.physicalTime) || null,
      motion: reading.motionContext || null,
    };
  });
}

// Gig Finder: Dubai and Abu Dhabi only, limited to what Milind asked for (2026-10-02) — comedians
// in either city, musicals at Dubai Opera and Coca-Cola Arena, English-language concerts at Coca-Cola Arena, Ushuaïa
// and the big Abu Dhabi venues, DJs at Dubai clubs within the next 90 days, film/TV composer
// concerts, and the F1 weekend. Two sources are merged:
//   1. Ticketmaster's Discovery API for the UAE (countryCode=AE), classified by the rules below.
//      It carries Etihad Arena, the comedy weeks, Pacha ICONS / Bohemia / The Penthouse and a few
//      Coca-Cola Arena shows, but not Dubai Opera, Ushuaïa, Soho Garden or Live Nation ME.
//   2. worker/gig-picks.json — real, checked events from those other sellers. Platinumlist, the
//      venues' sites and Live Nation ME have no public API (Queue-it / bot challenges / partner
//      keys), so the list is curated and refreshed weekly.
// No source tags a concert's language, so "English-language only" is judged from the artist's
// Last.fm tags: an artist with a non-English scene tag (k-pop, opm, arabic, bollywood…) is
// dropped, and one with no tags at all is dropped too, since it can't be checked.
// gig-picks.json can force an artist in (includeArtists) or out (excludeArtists).

const TICKETMASTER_API_BASE = 'https://app.ticketmaster.com/discovery/v2';
const GIG_CITIES = new Set(['dubai', 'abu dhabi']);
const GIG_DJ_WINDOW_DAYS = 90;
// Concert venues Milind follows. Ushuaïa isn't on Ticketmaster today but is listed in case it moves.
const GIG_DUBAI_CONCERT_VENUES = /coca[- ]cola arena|ushua/i;
const GIG_ABU_DHABI_BIG_VENUES = /etihad arena|etihad park|etihad live|yas gateway|yas marina|space ?42/i;
const GIG_MUSICAL_VENUES = /dubai opera|coca[- ]cola arena/i;
// Composers who write for film and TV. Concerts of their music count, including Candlelight-style
// tribute nights (Milind asked for those specifically).
const GIG_COMPOSERS = ['hans zimmer', 'ramin djawadi', 'ludwig goransson', 'john williams', 'howard shore',
  'michael giacchino', 'danny elfman', 'joe hisaishi', 'alan silvestri', 'james newton howard',
  'thomas newman', 'alexandre desplat', 'hildur gudnadottir', 'lorne balfe', 'harry gregson williams',
  'junkie xl', 'bear mccreary', 'nicholas britell', 'justin hurwitz', 'ennio morricone',
  'john powell', 'james horner', 'max richter', 'daniel pemberton', 'kris bowers', 'jeremy soule',
  'yoko kanno', 'hiroyuki sawano', 'gustavo santaolalla', 'brian tyler', 'rachel portman',
  'patrick doyle', 'clint mansell', 'trent reznor', 'atticus ross', 'cliff martinez'];
// Ticket add-ons and ticket tiers rather than shows (F1 grandstands, Golden Circle upgrades, tables).
const GIG_NOT_A_SHOW = /upgrade|vip table|after party|grandstand|terrace|lounge|\bpass\b|parking|hospitality|paddock/i;
const GIG_NOT_COMEDY = /\bmusical\b|\bpfl\b|\bufc\b|\bvs\.?\b|\bfight|\bslap\b/i;
// Ticketmaster attractions that are series, festivals or venues rather than the performer.
const GIG_CONTAINER_ATTRACTION = /festival|comedy (week|season)|pacha|bohemia|penthouse|grand prix|after race|icons|yasalam|series|national orchestra|\bdopa\b/i;
const GIG_NON_ENGLISH_TAGS = /k-?pop|korean|j-?pop|japanese|c-?pop|mandopop|cantopop|chinese|\bopm\b|filipino|pinoy|tagalog|\bp-?pop\b|arab|khaleeji|egyptian|lebanese|levant|turkish|bollywood|hindi|punjabi|bhangra|\bdesi\b|indian|urdu|pakistani|filmi|tamil|telugu|malayalam|kannada|russian|persian|iranian|latin|reggaeton|spanish|italian|^french$|french pop|chanson|opera|classical|tenor|greek|kurdish/i;
// Club-music tags only: "electronic" alone also covers synth-pop and dream-pop bands (Ghostly Kisses).
const GIG_ELECTRONIC_TAGS = /house|techno|\bedm\b|trance|dubstep|drum and bass/i;
const GIG_TAGS_CACHE_PREFIX = 'gig_tags:v1:';
// v2: v1 cached the 305×225 thumbnails.
const GIG_IMAGE_CACHE_PREFIX = 'gig_image:v2:';
const GIG_LOOKUP_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
// Each uncached Last.fm / Ticketmaster lookup is one subrequest; caps keep a cold run well under
// the Workers Free plan's 50-subrequest limit. Anything skipped resolves on a later run, and the
// response is cached for only 5 minutes while lookups are pending.
const GIG_MAX_TAG_LOOKUPS = 15;
const GIG_MAX_IMAGE_LOOKUPS = 10;
const GIGS_PENDING_CACHE_TTL_SECONDS = 300;

function normalizeArtistName(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Ticketmaster images carry width/height and a `fallback` flag for generic placeholders. The gig
// card crops to roughly square, so height is what matters: take the smallest image at least
// GIG_IMAGE_MIN_HEIGHT tall (1136×639 for most acts), else the tallest. Ratio is ignored — the only
// 4:3 variant is a 305×225 thumbnail, which looked soft on the cards. `_SOURCE` originals are
// skipped: they're full-size uploads with no size cap.
const GIG_IMAGE_MIN_HEIGHT = 600;
function pickTicketmasterImage(images) {
  const real = (images || [])
    .filter(img => img && img.url && !img.fallback && img.url.startsWith('https://') && !/_SOURCE$/.test(img.url))
    .sort((a, b) => (a.height || 0) - (b.height || 0));
  const pick = real.find(img => (img.height || 0) >= GIG_IMAGE_MIN_HEIGHT) || real[real.length - 1];
  return pick ? pick.url : null;
}

// Fallback photo for a curated act with no Ticketmaster image: Deezer's 1000×1000 artist picture
// (public API, no key), exact name match only, most-followed first.
async function deezerArtistImage(name) {
  const res = await fetch(`https://api.deezer.com/search/artist?${new URLSearchParams({ q: name, limit: '10' })}`, { signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Deezer search returned ${res.status}`);
  const data = await res.json();
  const target = normalizeArtistName(name);
  const match = (data.data || [])
    .filter(a => normalizeArtistName(a.name) === target && a.picture_xl && !/\/artist\/\/|images\/artist\/d41d8cd98f00b204e9800998ecf8427e/.test(a.picture_xl))
    .sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0];
  return match && match.picture_xl.startsWith('https://') ? match.picture_xl : null;
}

function dubaiToday(now) {
  return new Date(now + DUBAI_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchComposer(text) {
  const normalized = ` ${normalizeArtistName(text)} `;
  return GIG_COMPOSERS.find(name => normalized.includes(` ${name} `)) || null;
}

// "Bryson Tiller & Central Cee" → both names, so each can be checked on Last.fm.
function splitArtists(name) {
  return String(name).split(/\s*(?:&|,|\bx\b|\band\b|\bb2b\b)\s*/i).map(s => s.trim()).filter(Boolean);
}

async function fetchTicketmasterUaeEvents(env) {
  const events = [];
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({
      countryCode: 'AE',
      sort: 'date,asc',
      size: '200',
      page: String(page),
      startDateTime: new Date().toISOString().split('.')[0] + 'Z',
      apikey: env.TICKETMASTER_API_KEY,
    });
    const res = await fetch(`${TICKETMASTER_API_BASE}/events.json?${params}`, { signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Ticketmaster events returned ${res.status}`);
    const data = await res.json();
    events.push(...((data._embedded && data._embedded.events) || []));
    if (!data.page || page + 1 >= data.page.totalPages) break;
  }
  return events;
}

// Turns one Ticketmaster event into a candidate gig, or null if it's outside Milind's categories.
// Concerts come back with `needsTags`: their language/genre check happens after Last.fm lookups.
function classifyTicketmasterEvent(ev) {
  const venue = ev._embedded && ev._embedded.venues && ev._embedded.venues[0];
  const city = venue && venue.city && venue.city.name;
  const date = ev.dates && ev.dates.start && ev.dates.start.localDate;
  if (!venue || !city || !date || !GIG_CITIES.has(city.toLowerCase())) return null;
  const title = String(ev.name || '');
  if (GIG_NOT_A_SHOW.test(title)) return null;

  const attractions = (ev._embedded && ev._embedded.attractions) || [];
  // The performer is listed first; series, festivals and the F1 race are tagged as extra attractions.
  const performer = attractions.find(a => {
    const c = (a.classifications && a.classifications[0]) || {};
    const aSegment = (c.segment && c.segment.name) || '';
    const aGenre = (c.genre && c.genre.name) || '';
    return a.name && !GIG_CONTAINER_ATTRACTION.test(a.name) && aSegment !== 'Sports'
      && aGenre !== 'Fairs & Festivals' && aGenre !== 'Undefined';
  });
  const artist = (performer && performer.name) || title;
  const cls = (ev.classifications && ev.classifications[0]) || {};
  const segment = (cls.segment && cls.segment.name) || '';
  const genre = (cls.genre && cls.genre.name) || '';
  const isDubai = city.toLowerCase() === 'dubai';

  let category = null;
  let needsTags = false;
  const composer = matchComposer(title) || attractions.map(a => matchComposer(a.name)).find(Boolean);
  if (composer) category = 'film-score';
  else if (/\bmusical\b/i.test(title)) category = GIG_MUSICAL_VENUES.test(venue.name) ? 'musical' : null;
  else if (genre === 'Comedy' && !GIG_NOT_COMEDY.test(title)) category = 'comedy';
  else if (segment === 'Music' && isDubai && genre === 'Dance/Electronic') category = 'dj';
  else if (segment === 'Music' && (isDubai ? GIG_DUBAI_CONCERT_VENUES : GIG_ABU_DHABI_BIG_VENUES).test(venue.name)) {
    category = 'concert';
    needsTags = true;
  }
  if (!category) return null;

  return {
    artist,
    category,
    needsTags,
    // Some venues are entered in capitals ("YAS GATEWAY PARK NORTH").
    venue: `${venue.name === venue.name.toUpperCase() ? venue.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : venue.name}, ${city}`,
    date,
    image: pickTicketmasterImage((performer && performer.images) || []) || pickTicketmasterImage(ev.images),
    url: typeof ev.url === 'string' && ev.url.startsWith('https://') ? ev.url : null,
  };
}

// Cached KV lookup with a per-run budget. Returns undefined when the budget is spent.
async function cachedGigLookup(env, ctx, key, budget, produce) {
  const hit = await env.GIG_KV.get(key, 'json');
  if (hit) return hit;
  if (budget.left <= 0) return undefined;
  budget.left -= 1;
  try {
    const value = await produce();
    ctx.waitUntil(env.GIG_KV.put(key, JSON.stringify(value), { expirationTtl: GIG_LOOKUP_CACHE_TTL_SECONDS }));
    return value;
  } catch (err) {
    console.error('gig lookup failed', { key, message: err.message });
    return undefined;
  }
}

function lastfmArtistTags(name, env) {
  return async () => {
    const params = new URLSearchParams({ method: 'artist.gettoptags', artist: name, autocorrect: '1', api_key: env.LASTFM_API_KEY, format: 'json' });
    const res = await fetch(`${LASTFM_API_BASE}?${params}`, { signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Last.fm artist.gettoptags returned ${res.status}`);
    const data = await res.json();
    const tags = ((data.toptags && data.toptags.tag) || []).filter(t => Number(t.count) >= 10).slice(0, 10).map(t => String(t.name).toLowerCase());
    return { tags };
  };
}

// Artist photo for a curated event without its own `image`: the exact-name Ticketmaster
// attraction's image, else Deezer's. Two subrequests at most, cached together.
function curatedArtistImage(name, env) {
  return async () => {
    const params = new URLSearchParams({ keyword: name, size: '10', apikey: env.TICKETMASTER_API_KEY });
    const res = await fetch(`${TICKETMASTER_API_BASE}/attractions.json?${params}`, { signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Ticketmaster attractions returned ${res.status}`);
    const data = await res.json();
    const target = normalizeArtistName(name);
    const match = ((data._embedded && data._embedded.attractions) || []).find(a => normalizeArtistName(a.name) === target);
    const image = match ? pickTicketmasterImage(match.images) : null;
    return { image: image || await deezerArtistImage(name) };
  };
}

// Merges listings for the same artist: identical dates collapse to one, and consecutive or
// repeated nights at the same venue (Trevor Noah, Chicago) become one card with a date range.
function mergeGigs(gigs) {
  const groups = new Map();
  for (const gig of gigs) {
    const key = `${normalizeArtistName(gig.artist)}|${normalizeArtistName(gig.venue).split(' ').slice(0, 2).join(' ')}`;
    const prev = groups.get(key);
    const end = gig.endDate || gig.date;
    // A gap of more than a week means a separate run (e.g. Candlelight in October and January).
    if (prev && gig.date <= addDays(prev.endDate || prev.date, 7)) {
      if (end > (prev.endDate || prev.date)) prev.endDate = end;
      prev.image = prev.image || gig.image;
      prev.url = prev.url || gig.url;
      continue;
    }
    if (prev) groups.set(`${key}|${gig.date}`, prev);
    groups.set(key, { ...gig, endDate: gig.endDate && gig.endDate !== gig.date ? gig.endDate : undefined });
  }
  return [...groups.values()].map(g => (g.endDate && g.endDate !== g.date ? g : { ...g, endDate: undefined }));
}

// Backs the Gig Finder section. Response is a bare array of
// { artist, category, venue, date, endDate?, image, url }, sorted by date.
async function handleGigs(request, env, ctx) {
  if (!env.LASTFM_API_KEY || !env.TICKETMASTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Lookup is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fixed, versioned key: query strings can't bypass the cache (S-03), and bumping the version
  // retires a cached response when the gig logic changes (v5: Coca-Cola Arena musicals).
  const cache = caches.default;
  const cacheKey = new Request('https://milindparwani.com/__cache/gigs-v5');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const today = dubaiToday(Date.now());
    const djCutoff = addDays(today, GIG_DJ_WINDOW_DAYS);
    const exclude = new Set((GIG_PICKS.excludeArtists || []).map(normalizeArtistName));
    const include = new Set((GIG_PICKS.includeArtists || []).map(normalizeArtistName));
    // Hand-picked photos that replace a weak listing image (a logo, or a poster whose text gets cropped).
    const imageOverrides = new Map(Object.entries(GIG_PICKS.imageOverrides || {})
      .filter(([, url]) => typeof url === 'string' && url.startsWith('https://'))
      .map(([artist, url]) => [normalizeArtistName(artist), url]));
    // Attribution for photos whose licence asks for it (Wikimedia CC BY / BY-SA), keyed by image URL
    // so the credit only appears while that exact photo is shown.
    const imageCredits = new Map(Object.entries(GIG_PICKS.imageCredits || {})
      .filter(([, c]) => c && typeof c.text === 'string' && typeof c.url === 'string' && c.url.startsWith('https://')));
    const tagBudget = { left: GIG_MAX_TAG_LOOKUPS };
    const imageBudget = { left: GIG_MAX_IMAGE_LOOKUPS };
    let pending = false;

    // A Ticketmaster outage still leaves the curated events, cached briefly so it recovers soon.
    const candidates = [];
    let ticketmasterEvents = [];
    try {
      ticketmasterEvents = await fetchTicketmasterUaeEvents(env);
    } catch (err) {
      console.error('gigs: Ticketmaster failed', { message: err.message });
      pending = true;
    }
    for (const ev of ticketmasterEvents) {
      const gig = classifyTicketmasterEvent(ev);
      if (gig) candidates.push(gig);
    }
    for (const pick of GIG_PICKS.events || []) {
      if (!pick || !pick.artist || !pick.venue || !/^\d{4}-\d{2}-\d{2}$/.test(pick.date || '')) continue;
      candidates.push({ ...pick, needsTags: false, fromPicks: true });
    }

    // Curated picks go first so they win over a Ticketmaster duplicate of the same night (the
    // same DJ is often listed at two FIVE Palm venues for one show).
    candidates.sort((a, b) => Number(Boolean(b.fromPicks)) - Number(Boolean(a.fromPicks)));
    const seenNights = new Set();
    const kept = [];
    for (const gig of candidates) {
      const name = normalizeArtistName(gig.artist);
      const end = gig.endDate || gig.date;
      if (exclude.has(name) || end < today || seenNights.has(`${name}|${gig.date}`)) continue;
      seenNights.add(`${name}|${gig.date}`);
      if (gig.category === 'dj' && gig.date > djCutoff) continue;

      if (gig.needsTags && !include.has(name)) {
        const parts = splitArtists(gig.artist);
        const results = [];
        for (const part of parts) {
          results.push(await cachedGigLookup(env, ctx, GIG_TAGS_CACHE_PREFIX + normalizeArtistName(part), tagBudget, lastfmArtistTags(part, env)));
        }
        if (results.some(r => r === undefined)) { pending = true; continue; }
        const allTags = results.flatMap(r => r.tags);
        if (!results.some(r => r.tags.length) || allTags.some(t => GIG_NON_ENGLISH_TAGS.test(t))) continue;
        // Big electronic acts at the Abu Dhabi venues (Anyma) read as DJ nights, not concerts.
        const electronic = allTags.slice(0, 3).some(t => GIG_ELECTRONIC_TAGS.test(t));
        if (electronic) {
          if (gig.date > djCutoff) continue;
          gig.category = 'dj';
        }
      }

      if (imageOverrides.has(name)) gig.image = imageOverrides.get(name);
      if (!gig.image && gig.fromPicks) {
        const lookupName = gig.imageArtist || gig.artist;
        const found = await cachedGigLookup(env, ctx, GIG_IMAGE_CACHE_PREFIX + normalizeArtistName(lookupName), imageBudget, curatedArtistImage(lookupName, env));
        if (found === undefined) pending = true;
        else gig.image = found.image;
      }

      const image = typeof gig.image === 'string' && gig.image.startsWith('https://') ? gig.image : null;
      const credit = image && imageCredits.get(image);
      kept.push({
        artist: gig.artist,
        category: gig.category,
        venue: gig.venue,
        date: gig.date,
        endDate: gig.endDate,
        image,
        credit: credit ? { text: credit.text.slice(0, 80), url: credit.url } : undefined,
        url: typeof gig.url === 'string' && gig.url.startsWith('https://') ? gig.url : null,
      });
    }

    kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const gigs = mergeGigs(kept).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const response = new Response(JSON.stringify(gigs), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${pending ? GIGS_PENDING_CACHE_TTL_SECONDS : GIGS_CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('gigs failed', { message: err.message });
    return new Response(JSON.stringify({ error: 'Gig lookup failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Live listening data: the dashboard Spotify card (/api/now-playing), the three playlist cards
// (/api/playlists) and the Top Tracks / Top Artists lists (/api/listening). Spotify only — it
// never exposes play counts, so /api/listening counts plays from our own log in PLAYS_DB, which
// scheduled() fills every 30 minutes from /me/player/recently-played. None of these routes read
// query params, and each uses a fixed cache key so varied URLs can't bypass the cache (S-03).
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TIMEOUT_MS = 8000;
// Left-to-right order of the playlist cards: pop, Camon, idk.
const PLAYLIST_IDS = ['0xCGn0RL5DNNS7dlbjg5tv', '1MhSnhyBju5i36bBWvHbff', '7I6Yh3MjLYFaUtnDrpsL4q'];
const NOW_PLAYING_CACHE_TTL_SECONDS = 20;
const PLAYLISTS_CACHE_TTL_SECONDS = 21600;
const LISTENING_CACHE_TTL_SECONDS = 600;
const LISTENING_TOP_N = 5;
// Bump when a response shape or upstream call changes: deploys don't clear the edge cache, so
// without this a stale response (e.g. playlists, 6 hr) would outlive the fix.
const LISTENING_CACHE_VERSION = 3;
// Until the month's log has this many distinct tracks (first day of a month, or before the log
// has filled at all), /api/listening falls back to Spotify's own ~4-week short_term top lists.
const LISTENING_MIN_DISTINCT_TRACKS = 5;
// "This month" is the Dubai calendar month, matching the dashboard clock. Dubai has no DST.
const DUBAI_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

function jsonResponse(body, status = 200, maxAge = 0) {
  const headers = { 'Content-Type': 'application/json' };
  if (maxAge) headers['Cache-Control'] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(body), { status, headers });
}

function spotifyConfigured(env) {
  return Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);
}

async function spotifyGet(path, token) {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Spotify ${path.split('?')[0]} returned ${res.status}`);
  return res.json();
}

// Serves `name` from the edge cache, or runs `produce` and caches its result for `ttl` seconds.
// Upstream failures are logged with context and returned as a generic 502 (never raw errors).
async function serveCached(name, ttl, ctx, produce) {
  const cache = caches.default;
  const cacheKey = new Request(`https://milindparwani.com/__cache/v${LISTENING_CACHE_VERSION}/${name}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const response = jsonResponse(await produce(), 200, ttl);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error(`/api/${name} failed`, { message: err.message });
    return jsonResponse({ error: 'Upstream unavailable' }, 502);
  }
}

// Spotify lists images largest first; take the smallest that's still >= 300px wide.
function pickImage(images) {
  if (!images || !images.length) return null;
  const bigEnough = images.filter(img => !img.width || img.width >= 300);
  return (bigEnough[bigEnough.length - 1] || images[0]).url;
}

function toTrack(t) {
  return {
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map(a => a.name),
    album: t.album ? t.album.name : null,
    image: pickImage(t.album && t.album.images),
    url: t.external_urls ? t.external_urls.spotify : null,
    durationMs: t.duration_ms,
  };
}

async function handleNowPlaying(env, ctx) {
  if (!spotifyConfigured(env)) return jsonResponse({ error: 'Lookup is not configured' }, 503);
  return serveCached('now-playing', NOW_PLAYING_CACHE_TTL_SECONDS, ctx, async () => {
    const token = await refreshSpotifyUserAccessToken(env);
    const current = await spotifyGet('/me/player/currently-playing', token);
    // Podcasts and ads come back with currently_playing_type other than 'track' — treat as idle.
    if (current && current.item && current.currently_playing_type === 'track') {
      return { isPlaying: current.is_playing, progressMs: current.progress_ms, track: toTrack(current.item) };
    }
    const recent = await spotifyGet('/me/player/recently-played?limit=1', token);
    const last = recent && recent.items && recent.items[0];
    return { isPlaying: false, playedAt: last ? last.played_at : null, track: last ? toTrack(last.track) : null };
  });
}

// Since Spotify's Feb 2026 dev-mode changes, a playlist's `items` (and so `items.total`) is only
// returned to its owner or a collaborator — an app-only token gets metadata without a track count.
// The owner token is used first; the app token is the fallback so names/covers still load if the
// owner token is unavailable. No `fields` filter, so a renamed field degrades to a missing value.
async function handlePlaylists(env, ctx) {
  if (!spotifyConfigured(env)) return jsonResponse({ error: 'Lookup is not configured' }, 503);
  return serveCached('playlists', PLAYLISTS_CACHE_TTL_SECONDS, ctx, async () => {
    let token;
    try {
      token = await refreshSpotifyUserAccessToken(env);
    } catch (err) {
      console.error('owner token unavailable for playlists, using app token', { message: err.message });
      token = await getSpotifyToken(env);
    }
    const playlists = await Promise.all(PLAYLIST_IDS.map(id => spotifyGet(`/playlists/${id}?market=AE`, token)));
    return playlists.map((p, i) => ({
      id: PLAYLIST_IDS[i],
      name: p.name,
      description: p.description || '',
      image: pickImage(p.images),
      url: p.external_urls ? p.external_urls.spotify : `https://open.spotify.com/playlist/${PLAYLIST_IDS[i]}`,
      trackCount: (p.tracks || p.items || {}).total ?? null,
    }));
  });
}

function dubaiMonth(now) {
  const local = new Date(now + DUBAI_UTC_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - DUBAI_UTC_OFFSET_MS;
  const label = local.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, label };
}

// Returns null when the log is missing or too thin for this month, so the caller falls back.
async function listeningFromLog(env, since) {
  if (!env.PLAYS_DB) return null;
  const [distinct, tracks, artists] = await env.PLAYS_DB.batch([
    env.PLAYS_DB.prepare('SELECT COUNT(DISTINCT track_id) AS n FROM plays WHERE played_at >= ?1').bind(since),
    env.PLAYS_DB.prepare(
      `SELECT track_id, track_name, artists, album_image, COUNT(*) AS plays
       FROM plays WHERE played_at >= ?1
       GROUP BY track_id ORDER BY plays DESC, MAX(played_at) DESC LIMIT ?2`
    ).bind(since, LISTENING_TOP_N),
    // Aliases avoid `id`: json_each() has its own `id` column, which GROUP BY would pick instead.
    // Recently-played only carries simplified artists (no images), so each artist shows the album
    // cover from their latest play: with exactly one MAX() in the query, SQLite takes the bare
    // album_image column from the row that produced the max.
    env.PLAYS_DB.prepare(
      `SELECT json_extract(a.value, '$.id') AS artist_id, json_extract(a.value, '$.name') AS artist_name,
              COUNT(*) AS plays, plays.album_image AS album_image, MAX(plays.played_at) AS last_played
       FROM plays, json_each(plays.artists) AS a WHERE plays.played_at >= ?1
       GROUP BY artist_id ORDER BY plays DESC, last_played DESC LIMIT ?2`
    ).bind(since, LISTENING_TOP_N),
  ]);
  if (distinct.results[0].n < LISTENING_MIN_DISTINCT_TRACKS) return null;
  return {
    source: 'log',
    tracks: tracks.results.map(r => ({
      id: r.track_id,
      name: r.track_name,
      artists: JSON.parse(r.artists).map(a => a.name),
      image: r.album_image,
      url: `https://open.spotify.com/track/${r.track_id}`,
      plays: r.plays,
    })),
    artists: artists.results.map(r => ({
      id: r.artist_id,
      name: r.artist_name,
      image: r.album_image,
      url: `https://open.spotify.com/artist/${r.artist_id}`,
      plays: r.plays,
    })),
  };
}

async function listeningFromShortTerm(env) {
  const token = await refreshSpotifyUserAccessToken(env);
  const [tracks, artists] = await Promise.all([
    spotifyGet(`/me/top/tracks?time_range=short_term&limit=${LISTENING_TOP_N}`, token),
    spotifyGet(`/me/top/artists?time_range=short_term&limit=${LISTENING_TOP_N}`, token),
  ]);
  return {
    source: 'short_term',
    tracks: (tracks.items || []).map(t => ({ ...toTrack(t), plays: null })),
    artists: (artists.items || []).map(a => ({
      id: a.id,
      name: a.name,
      image: pickImage(a.images),
      url: a.external_urls ? a.external_urls.spotify : null,
      plays: null,
    })),
  };
}

async function handleListening(env, ctx) {
  if (!spotifyConfigured(env)) return jsonResponse({ error: 'Lookup is not configured' }, 503);
  return serveCached('listening', LISTENING_CACHE_TTL_SECONDS, ctx, async () => {
    const month = dubaiMonth(Date.now());
    let data = null;
    try {
      data = await listeningFromLog(env, month.start);
    } catch (err) {
      console.error('play log query failed, using short_term', { message: err.message });
    }
    if (!data) data = await listeningFromShortTerm(env);
    return { ...data, month: month.label, since: new Date(month.start).toISOString() };
  });
}

// Cron (every 30 min, see wrangler.jsonc): copies the latest 50 plays into PLAYS_DB. played_at
// is the primary key, so re-reading plays already stored is a no-op via INSERT OR IGNORE.
// Local files and anything without a track id are skipped.
async function recordRecentPlays(env) {
  if (!spotifyConfigured(env) || !env.PLAYS_DB) return;
  const token = await refreshSpotifyUserAccessToken(env);
  const data = await spotifyGet('/me/player/recently-played?limit=50', token);
  const items = ((data && data.items) || []).filter(i => i.track && i.track.id && i.played_at);
  if (!items.length) return;
  const insert = env.PLAYS_DB.prepare(
    'INSERT OR IGNORE INTO plays (played_at, track_id, track_name, artists, album_image, duration_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  );
  await env.PLAYS_DB.batch(items.map(i => insert.bind(
    Date.parse(i.played_at),
    i.track.id,
    i.track.name,
    JSON.stringify((i.track.artists || []).map(a => ({ id: a.id, name: a.name }))),
    pickImage(i.track.album && i.track.album.images),
    i.track.duration_ms ?? null,
  )));
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
    if (url.pathname === '/api/spotify/authorize') {
      return handleSpotifyAuthorize(request, env);
    }
    if (url.pathname === '/api/spotify/callback') {
      return handleSpotifyCallback(request, env);
    }
    if (url.pathname === '/api/gigs') {
      return handleGigs(request, env, ctx);
    }
    if (url.pathname === '/api/now-playing') {
      return handleNowPlaying(env, ctx);
    }
    if (url.pathname === '/api/playlists') {
      return handlePlaylists(env, ctx);
    }
    if (url.pathname === '/api/listening') {
      return handleListening(env, ctx);
    }
    if (url.pathname === '/api/health/authorize') {
      return handleHealthAuthorize(request, env);
    }
    if (url.pathname === '/api/health/callback') {
      return handleHealthCallback(request, env);
    }
    if (url.pathname === '/api/heart-rate') {
      return handleHeartRate(env, ctx);
    }
    if (url.pathname.startsWith('/audio/')) {
      return handleAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(recordRecentPlays(env).catch(err => {
      console.error('play log cron failed', { message: err.message });
    }));
  },
};
