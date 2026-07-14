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
// Spotify killed its public Charts API, and — confirmed against Spotify's own docs, not just
// trial-and-error — /v1/playlists/{id}/tracks is restricted to playlists owned by or
// collaborated on by the authenticated user, for ANY auth type. That kills "read a curated
// editorial playlist via Client Credentials" as an approach entirely, not just for Spotify-owned
// playlists. Last.fm's chart.gettopartists (public, free API key, no OAuth) is the replacement
// trending source — a genuine global top-artists chart, not a workaround.
const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';
// Last.fm's chart is streaming-driven, not touring-driven — deceased legends still chart
// (Michael Jackson, Elvis Presley routinely place). Every real Ticketmaster result for them is
// necessarily an impersonator/tribute show, and the isTributeEvent() keyword heuristic can't
// catch every naming convention (seen live: French "hommage", "Club 90's: Michael Jackson
// Night", "ELVIS PRESLEY by Steve Ryckier & The Graceland Orchestra" — none contain
// "tribute"/"impersonat"). This is a small, stable fact (death doesn't reverse) rather than a
// heuristic, so it's cheaper and more exact to exclude these names from the pool entirely than
// to keep expanding a regex arms race against creative event titles.
const DECEASED_ARTISTS = new Set(['michael jackson', 'elvis presley']);
const GIG_POOL_MAX = 25;
const GIGS_CACHE_TTL_SECONDS = 3600;

async function exchangeSpotifyToken(env, params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
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
  authUrl.searchParams.set('scope', 'user-top-read');
  authUrl.searchParams.set('state', state);
  return Response.redirect(authUrl.toString(), 302);
}

// Step 2: Spotify redirects back here with a code (or an error, if consent was declined).
// Exchanges the code for a refresh token and persists it in KV — that refresh token is the only
// long-lived credential /api/gigs needs; access tokens are minted fresh from it on every call.
async function handleSpotifyCallback(request, env) {
  const url = new URL(request.url);
  const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  if (url.searchParams.get('error')) {
    return html(`<p>Spotify authorization failed: ${url.searchParams.get('error')}</p>`);
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
    return html(`<p>Token exchange failed: ${err.message}</p>`);
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

// Bandsintown's public REST API turned out to be dead (blanket 403, "explicit deny in an
// identity-based policy" — confirmed even against their own documented example app_id, so this
// isn't a config issue, they've locked it to partners). Ticketmaster's Discovery API replaced it:
// self-serve API key, instant approval, actively maintained. Returns the soonest upcoming show
// for one artist, or null if none found — most artists in a top-artists list aren't touring
// right now, that's normal, not an error.
// Keyword search matches tribute acts as readily as the real artist (seen live: "Michael
// Jackson" surfaced "MJ LIVE – Michael Jackson Tribute Concert", "Fleetwood Mac" surfaced
// "Rumours of Fleetwood Mac" with classification subType "Tribute Band"). Ticketmaster doesn't
// expose an "is this the real artist" flag, so this is a heuristic, not exact — but "tribute" /
// "impersonator" reliably shows up in the event name, attraction name, or subType across every
// case seen so far, and real headline events (checked against "Bruno Mars") never false-positive.
const TRIBUTE_PATTERN = /tribute|impersonat/i;
function isTributeEvent(ev) {
  if (TRIBUTE_PATTERN.test(ev.name || '')) return true;
  const cls = ev.classifications && ev.classifications[0];
  if (cls && TRIBUTE_PATTERN.test((cls.subType && cls.subType.name) || '')) return true;
  const attractions = (ev._embedded && ev._embedded.attractions) || [];
  return attractions.some(a => TRIBUTE_PATTERN.test(a.name || ''));
}

async function fetchTicketmasterSoonestShow(artistName, env) {
  try {
    const params = new URLSearchParams({
      keyword: artistName,
      classificationName: 'music',
      sort: 'date,asc',
      size: '5',
      // Without a lower bound, Ticketmaster's index can surface stale/past-dated listings
      // (seen live: a "Michael Jackson" event dated in the past) even sorted ascending —
      // explicitly exclude anything before right now.
      startDateTime: new Date().toISOString().split('.')[0] + 'Z',
      apikey: env.TICKETMASTER_API_KEY,
    });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const events = (data._embedded && data._embedded.events) || [];
    const ev = events.find(e => !isTributeEvent(e));
    if (!ev) return null;

    const localDate = ev.dates && ev.dates.start && ev.dates.start.localDate;
    const venueObj = ev._embedded && ev._embedded.venues && ev._embedded.venues[0];
    const venueLabel = venueObj && [venueObj.name, venueObj.city && venueObj.city.name].filter(Boolean).join(', ');
    if (!localDate || !venueLabel) return null;
    return { venue: venueLabel, date: localDate };
  } catch {
    return null;
  }
}

// Backs the Gig Finder rail. Mixes two artist sources into one pool (personal Spotify top
// artists via the user-auth flow above, plus Last.fm's global top-artists chart for the
// trending half), dedupes case-insensitively, caps at GIG_POOL_MAX to stay well under the
// Workers Free-plan 50-subrequest-per-invocation limit (pool + the handful of Spotify/Last.fm
// calls stays under 30), then looks up each artist's soonest show via Ticketmaster.
// Response is a bare array (not {results:...}/{headlines:...} like the other routes) — the
// client already consumes GIGS as a plain [{artist,venue,date}] array, this matches that shape
// exactly rather than making the frontend unwrap a wrapper key.
async function handleGigs(request, env, ctx) {
  if (!env.LASTFM_API_KEY || !env.TICKETMASTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Lookup is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const userToken = await refreshSpotifyUserAccessToken(env);
    const topRes = await fetch('https://api.spotify.com/v1/me/top/artists?limit=25&time_range=medium_term', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!topRes.ok) throw new Error(`Spotify top artists returned ${topRes.status}`);
    const topData = await topRes.json();
    const personalArtists = (topData.items || []).map(a => a.name).filter(Boolean);

    const lastfmRes = await fetch(
      `${LASTFM_API_BASE}?method=chart.gettopartists&api_key=${env.LASTFM_API_KEY}&format=json&limit=25`
    );
    if (!lastfmRes.ok) throw new Error(`Last.fm chart.gettopartists returned ${lastfmRes.status}`);
    const lastfmData = await lastfmRes.json();
    const trendingArtists = ((lastfmData.artists && lastfmData.artists.artist) || [])
      .map(a => a.name)
      .filter(Boolean);

    const seen = new Set();
    const pool = [];
    for (const name of [...personalArtists, ...trendingArtists]) {
      const key = name.toLowerCase();
      if (seen.has(key) || DECEASED_ARTISTS.has(key)) continue;
      seen.add(key);
      pool.push(name);
      if (pool.length >= GIG_POOL_MAX) break;
    }

    const withShows = await Promise.all(pool.map(async artist => {
      const show = await fetchTicketmasterSoonestShow(artist, env);
      return show ? { artist, venue: show.venue, date: show.date } : null;
    }));
    const gigs = withShows.filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const response = new Response(JSON.stringify(gigs), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${GIGS_CACHE_TTL_SECONDS}`,
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
    if (url.pathname === '/api/spotify/authorize') {
      return handleSpotifyAuthorize(request, env);
    }
    if (url.pathname === '/api/spotify/callback') {
      return handleSpotifyCallback(request, env);
    }
    if (url.pathname === '/api/gigs') {
      return handleGigs(request, env, ctx);
    }
    if (url.pathname.startsWith('/audio/')) {
      return handleAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
