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

const BPM_API_BASE = 'https://api.getsong.co';
const BPM_CACHE_TTL_SECONDS = 3600;

// GetSongBPM returns Traktor "open key" notation (a number plus d/m). Camelot notation uses the
// same wheel position with different suffix letters — B for major ("d"), A for minor ("m") — so
// converting is a straight letter swap, not a lookup table.
function openKeyToCamelot(openKey) {
  if (!openKey) return null;
  const m = /^(\d{1,2})([dm])$/.exec(String(openKey).trim());
  if (!m) return null;
  return `${m[1]}${m[2] === 'd' ? 'B' : 'A'}`;
}

// The API key is tied to a 3000-req/hour quota and GetSongBPM's terms require it never be
// distributed publicly, so it stays server-side as a Worker secret (wrangler secret put
// GETSONGBPM_API_KEY) rather than being called directly from the browser.
async function handleBpmLookup(request, env, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.GETSONGBPM_API_KEY) {
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
    const apiUrl = `${BPM_API_BASE}/search/?type=song&limit=8&lookup=${encodeURIComponent(q)}&api_key=${encodeURIComponent(env.GETSONGBPM_API_KEY)}`;
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) throw new Error(`GetSongBPM returned ${apiRes.status}: ${(await apiRes.text()).slice(0, 200)}`);
    const data = await apiRes.json();

    const results = (data.search || []).map(song => ({
      title: song.title || null,
      artist: (song.artist && song.artist.name) || null,
      tempo: song.tempo ? Number(song.tempo) : null,
      key: openKeyToCamelot(song.open_key),
    }));

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
    if (url.pathname.startsWith('/audio/')) {
      return handleAsset(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
