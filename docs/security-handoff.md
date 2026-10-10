# PARWANI — Security Handoff

> **Living document.** Update this file as part of every push that changes the project — not just at a session's end. The next device to pull needs this current to pick up where you left off. (Unlike [`docs/agent-rulebook.md`](agent-rulebook.md), which is static.)

## 1. Scope and how to use

Covers the `portfolio` Worker on milindparwani.com, its static assets, the `GIG_KV` namespace, the `PLAYS_DB` D1 database, the 30-minute cron trigger, its nine secrets (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_AUTH_KEY`, `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `HEALTH_AUTH_KEY`, `FREESOUND_API_KEY`, `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`) and the Google Cloud OAuth app (project `golden-monolith-255513`). Section 2 was verified by reading the deployed Worker source on 23 Sep 2026 and updated with each change on 30 Sep 2026. Section 3 covers Cloudflare zone settings that the API connector cannot read — tick each one only after checking it in the dashboard. Section 4 lists real gaps found in the code, ordered by severity. Any agent touching the Worker must re-run sections 2 and 5 before marking work complete.

## 2. Verified in Worker code

- [x] All third-party keys live in Worker secrets (`env.*`); none shipped to the browser. The front end only calls same-origin `/api/*`.
- [x] Missing secrets fail closed with 503 "Lookup is not configured" instead of throwing.
- [x] Spotify owner OAuth start (`/api/spotify/authorize`) is gated by `SPOTIFY_AUTH_KEY`; returns 403 otherwise.
- [x] OAuth `state` is a random UUID stored in KV with a 10-minute TTL and deleted after one use (CSRF and replay protection).
- [x] OAuth scope is minimal and read-only: `user-top-read`, `user-read-currently-playing`, `user-read-recently-played` (last two added 2026-09-30 for live listening data; no playlist, library or playback-control scopes).
- [x] Listening routes (`/api/now-playing`, `/api/playlists`, `/api/listening`, live 2026-09-30) take no user input, use a fixed (versioned) cache key so query strings can't bypass the cache, log upstream errors with `console.error` and return a generic `{"error":"Upstream unavailable"}` 502. Spotify calls have an 8 s timeout.
- [x] `PLAYS_DB` (D1, `portfolio-plays`) holds only the owner's listening history (track/artist names and IDs, play timestamps) — low sensitivity, the site shows it publicly anyway. It's written only by the 30-minute cron; no route writes to it and every read uses bound parameters.
- [x] Refresh token stored server-side in KV, rotated when Spotify returns a new one.
- [x] S-01 fixed and deployed 2026-09-30: `/api/spotify/callback` returns fixed messages only; the `error` param and `err.message` go to `console.error`, never into the HTML.
- [x] `SPOTIFY_AUTH_KEY` rotated 2026-09-30 (40 random alphanumeric characters, generated and stored via `wrangler secret bulk` without being printed). `/api/playlists` now uses the owner token (read-only scopes above) to get track counts; the app token is only a fallback.
- [x] Google Health owner OAuth (`/api/health/authorize`, `/api/health/callback`, live 2026-09-30): gated by `HEALTH_AUTH_KEY` with a constant-time compare (S-07 fix applied to this route only), single-use `health_oauth_state:` KV state with 10-minute TTL, fixed-message callback, read-only scopes `googlehealth.health_metrics_and_measurements.readonly` and (since 2026-10-02, for steps) `googlehealth.activity_and_fitness.readonly`. `/api/heart-rate` and `/api/steps` take no input, 30 s versioned cache, generic 502. Google OAuth app is In production but unverified (100-user cap, single owner user), with only this one restricted scope on its consent screen (six unused health scopes removed 2026-09-30). Heart-rate and step data are personal health data shown publicly by design (Milind's choice). Only the latest single heart-rate reading and today's step total plus its sync time are exposed, never history. The consent screen must also list the activity scope.
- [x] PlayStation (2026-10-04): `/api/psn/authorize` serves a `no-store`, `noindex` form on GET; POST reads `key` and `npsso` from the form body (not the URL, so neither reaches logs or history), checks `PSN_AUTH_KEY` with `ownerKeyMatches`, accepts only a 64-character alphanumeric NPSSO (or the `{"npsso":"…"}` JSON it comes in), and returns fixed messages; other methods get 405. The NPSSO is used once and never stored. KV holds `psn_refresh_token` (10-day life, scope `psn:mobile.v2.core psn:clientapp`, which can read the account's profile, presence, friends and trophies) and a cached `psn_access_token` (TTL `expires_in` − 120 s). The PSN client id/secret in the code are the PlayStation mobile app's public values, not ours. `/api/game` (replaced `/api/playstation` the same day) takes no input, uses a fixed cache key, 60 s TTL, 8 s timeouts, generic 502 (per-source failures logged); it exposes only the current or last game's title, art, platform, hours and last-played time — never online status alone. PSN art URLs must start with `https://image.api.playstation.com/`; Steam art URLs are built server-side from the numeric appid. Steam: `STEAM_API_KEY` (read-only Web API key) and `STEAM_ID` are Worker secrets; the key is sent only to `api.steampowered.com` in the query string, as Steam requires. `STEAM_ID` must be 17 digits or Steam is treated as not configured. If the Steam key leaks, revoke it at https://steamcommunity.com/dev/apikey and store a new one. Reconnect reminder (2026-10-04): the cron POSTs to `https://ntfy.sh/<NTFY_TOPIC>`; the topic is a random 32-character name in a Worker secret, because anyone who knows it can read or send to it. The message carries no credentials, only the public `/api/psn/authorize` link. If the topic leaks, generate a new one, store it with `wrangler secret bulk`, and resubscribe the phone. Daily reminders (2026-10-05) go to a separate topic in `REMINDERS_TOPIC`, a short name Milind chose, so anyone who guesses it can read them; only non-sensitive reminder text belongs there. Their text comes only from the committed `worker/reminders.json`, takes no request input, and adds no route. Incident: if the token leaks, sign out of all devices in PlayStation account settings (ends the NPSSO session) and delete `psn_refresh_token` / `psn_access_token` from `GIG_KV`.
- [x] Empty queries rejected with 400; sample `mode` restricted to an allow-list (`vocals`, `melody`).
- [x] User input passed to upstream URLs via `encodeURIComponent` / `URLSearchParams`.
- [x] Upstream error text truncated to 200 characters.
- [x] Edge caching on every read endpoint (5 min to 1 hr) limits upstream quota burn.
- [x] Audio Range header parsed strictly by regex; invalid ranges return 416.
- [x] Ticketmaster queries bounded to future dates; tribute acts filtered.
- [x] Gig Finder (rebuilt 2026-10-02): one Ticketmaster UAE events query (≤ 3 pages) plus capped, KV-cached lookups — Last.fm artist tags (`gig_tags:v1:*`, ≤ 15 per run) and photos for curated events from the Ticketmaster attraction, then Deezer's public artist search with no key (`gig_image:v2:*`, ≤ 10 per run, at most 2 subrequests each). Since 2026-10-02 the photos can be hotlinked from Ticketmaster, Deezer, Wikimedia, Squarespace (Dubai Comedy Festival) and Fever, all over `https://`, 30-day TTL — so a cold run stays well under the 50-subrequest limit. MusicBrainz and the Spotify top-artists call are no longer used by this route. `/api/gigs` takes no input, uses a fixed versioned cache key (`gigs-v3`), and now returns a generic `{"error":"Gig lookup failed"}` (detail logged with `console.error`); a Ticketmaster outage still serves the curated list with a 5-minute cache. Curated events come from `worker/gig-picks.json`, bundled at deploy (not fetched at runtime). Image, ticket and photo-credit URLs (`imageCredits`, 2026-10-02) are accepted only if `https://`, and the frontend escapes them and re-checks the scheme before rendering. A weekly Claude cloud routine (`trig_01V5wXhtAzpJkHrW11is9yt2`) edits that JSON and pushes to `main`, which deploys production — review its commits like any other.
- [x] Media tracker (2026-10-02): `/api/media` takes no input and uses a fixed cache key (`media-v1`). It fetches only fixed URLs (Reel's public Google Cloud Storage JSON, Cinema Akil `/api/films` with server-computed dates, optionally TMDB search with the `TMDB_API_KEY` secret, KV-cached and capped at 12 a run) with 15 s timeouts. A failing source is skipped and logged, and other errors return a generic 502 `{"error":"Media lookup failed"}`. Image URLs are accepted only if `https://` or a local `/assets/media/` path, and the frontend escapes all fields. A second weekly routine (`trig_014ZDNi4Uf1ecndu8k5oJ6as`) edits `worker/media-picks.json` and pushes to `main`.
- [x] Privacy page at `/privacy` (required for the Google consent screen); its claims — no cookies, no analytics/trackers — were checked against `public/` and the Worker on 2026-09-30. Keep it accurate if either changes.

## 3. Cloudflare zone baseline (verify in dashboard)

**Account**
- [ ] Two-factor authentication on the Cloudflare account; API tokens scoped to least privilege (no Global API Key in use).

**SSL/TLS**
- [ ] Encryption mode: Full (strict).
- [ ] Always Use HTTPS: on. Automatic HTTPS Rewrites: on.
- [ ] Minimum TLS version 1.2; TLS 1.3 on.
- [ ] HSTS enabled (max-age ≥ 6 months, include subdomains) once HTTPS is confirmed everywhere.

**Caching**
- [x] Browser Cache TTL: "Respect Existing Headers" (changed from 4 hours on 2026-10-02 and verified in the dashboard), so the Worker's `Cache-Control` values reach browsers, e.g. `/api/now-playing` 20 s and `/api/gigs` 1 h.

**DNS**
- [ ] DNSSEC enabled.
- [ ] Records proxied (orange cloud); no stray records exposing an origin IP.
- [ ] CAA record limiting certificate issuers.

**Security / WAF**
- [ ] Cloudflare Managed Ruleset (free tier) active.
- [ ] Bot Fight Mode on.
- [ ] Rate limiting rule on `/api/*` (e.g. 30 requests / 10 s per IP → block for 1 min).
- [ ] `/api/spotify/*` and `/api/health/authorize|callback` restricted (WAF rule or Cloudflare Access) so only the owner can reach them.

**Workers Builds**
- [ ] Non-production branch command set to `npx wrangler versions upload` (as of 2026-09-30 it was `npx wrangler deploy`, so any pushed branch went live).

**Response headers (Transform Rule or in the Worker)**
- [ ] `Content-Security-Policy` limiting scripts, fonts and media to self + Google Fonts.
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Permissions-Policy` disabling camera, mic, geolocation.

**Workers**
- [ ] `workers.dev` subdomain route disabled so the Worker is only reachable on the real domain.
- [ ] Worker observability / logs enabled to spot abuse.

### Victory Road (2026-10-07, Claude)

Static assets only: no new Worker routes, secrets or third-party requests. The battle engine (`public/vr/vr-engine.js`, Pokémon Showdown sim, MIT) runs in a same-origin Web Worker with no network access or `eval`. Page text from game data goes through `textContent`. `localStorage` keys `pdosVictoryRoad`, `pdosVrMuted`, `pdosVrMusic`, `pdosVrVolume` are validated on read. Third-party rights are listed in `public/vr/NOTICE.md`. No finding opened.

### The Very Best (2026-10-10, Claude — deployed 2026-10-10)

Still static assets only: no Worker, route, secret, cookie, OAuth or external-service change. Game-specific posture (separate from the open whole-site findings below): the engine worker now accepts only `start` (once, with a validated battle id), `choose` (matching battle id, current request id, choice ≤ 40 chars matching an allowlist pattern) and `resume`; everything else is ignored. The team is validated inside the worker against the engine's data and `/vr/learnsets.json` (a fixed same-origin URL — the worker's only network request). No `eval`/`new Function`; all data-driven text (Pokémon, moves, items, the trainer name) goes through `textContent`; `innerHTML` only for fixed SVG/markup strings. Trainer names are 1–20 graphemes with control and bidi-override characters refused, and live only in memory. `localStorage`: `pdosTheVeryBest` (v3 draft: filter, party, modifiers; ≤ 20 KB parsed, every field validated, illegal values replaced), `pdosTvbMusic`/`pdosTvbSfx`/`pdosTvbCrowd`/`pdosTvbMotion`, plus the existing `pdosVrMuted`; legacy `pdosVictoryRoad`/`pdosChampionRun` are read once for migration; Settings → Reset saved party clears the draft and the legacy keys. No CSP exists site-wide (finding above); the game would run under `script-src 'self'`, `worker-src 'self'`, `connect-src 'self'`, `img-src 'self' data:`, `media-src 'self'`, but needs `style-src 'unsafe-inline'` (style attributes). Worker isolation is for responsiveness only: client-side results are not tamper-proof and no ranked/anti-cheat claim is made. No dependency added to the shipped site (puppeteer-core/axe-core were used only in a scratch test kit). Title redesign (same day): the game now requests two more Google Fonts families (Press Start 2P, Silkscreen) when it opens — the same third-party origin the site already uses for Pixelify Sans; a future CSP needs `fonts.googleapis.com` in `style-src` and `fonts.gstatic.com` in `font-src`. No finding opened. Refinements (second 2026-10-10 brief, local, not deployed): still static assets only. The worker's `start` config gains one boolean, `rules.randomTeam` (accepted only as `=== true`), which makes `validateTeam` also enforce the random-team composition from the engine's own data; no new message type, URL, storage key or third-party request. `self.VREngine` now also exposes `Battle` and `isFinal` (the bundle already contained them; the page never calls them). New `innerHTML` uses are fixed SVG strings only (arena backdrops built from numbers, the VS bolt); all Pokémon, move and type text still goes through `textContent`. No finding opened.

## 4. Open findings

| ID | Severity | Finding | Fix |
|---|---|---|---|
| S-02 | Medium | No security headers set by the Worker (CSP, nosniff, frame, referrer). | Add a `withSecurityHeaders()` wrapper on every response, or a Transform Rule (section 3). |
| S-03 | Medium | No rate limiting on `/api/*`. Cache keys include the full URL, so varying `q` bypasses cache and burns Spotify, Freesound and Ticketmaster quotas. (2026-09-30: `/api/gigs` and the listening/heart-rate routes now use fixed cache keys; `bpm-lookup`, `audio-features`, `sample-search` still don't, and there's still no rate limit.) | WAF rate-limit rule; also normalise cache keys (lowercase, trimmed `q`, drop unknown params). |
| S-04 | Medium | Raw upstream error messages returned to clients in 502 JSON (leaks provider names, status codes). (2026-09-30: the listening and heart-rate routes already return a generic error; `news`, `bpm-lookup`, `audio-features`, `sample-search` still return `err.message`; `gigs` fixed 2026-10-02.) | Log detail with `console.error`; return a generic `{"error":"Upstream unavailable"}`. |
| S-05 | Low | `bpm_min` / `bpm_max` concatenated into the Freesound filter unvalidated (filter injection). | Parse as integers, clamp 40–250, reject otherwise. |
| S-06 | Low | `q` has no length limit. | Reject over 100 characters with 400. |
| S-07 | Low | `SPOTIFY_AUTH_KEY` passed in the query string (can appear in logs and history); compared with `!==`. (2026-09-30: `/api/health/authorize` uses a constant-time compare via `ownerKeyMatches`; the Spotify route doesn't yet, and both keys still travel in the query string.) | Move behind Cloudflare Access, or send as a header and compare in constant time. |
| S-08 | Low | Range requests buffer the whole audio file in Worker memory (128 MB limit). | Move audio to R2 and use its native range support, or cap file size. |
| S-09 | Low | No explicit CORS policy on `/api/*`. | Add `Access-Control-Allow-Origin: https://milindparwani.com` only if cross-origin use is ever needed; otherwise leave closed and document it. |
| S-10 | Resolved 2026-09-23 | `.claude/settings.local.json` was tracked in git and contained a live TwelveData API key in plaintext (from ad-hoc, never-shipped Stock Compare testing). | Fixed in PR #2 (`dd02851`): key removed, file untracked, added to `.gitignore`. Milind regenerated the key at TwelveData the same day — old key confirmed unused/not found by anyone before rotation, now fully invalid regardless of who sees the git history. Not scrubbed from the initial commit's history (decided not worth the force-push + PR #1 rebase since the key itself is dead). |

When a finding is fixed: move it to section 2 as a ticked item, note the date and test used in the Handoff session log.

## 5. Rules for any new endpoint

- [ ] Keys go in Worker secrets (`wrangler secret bulk <file.json>` from a temp file, then delete it — piping into `wrangler secret put` from Windows PowerShell 5.1 stored a corrupted value), never in code, `wrangler.toml`/`wrangler.jsonc`, or any file committed to the repo (including `.claude/settings.local.json` — see S-10).
- [ ] Fail closed: missing secret → 503; bad input → 400; never a stack trace.
- [ ] Validate every param: type, length, range, allow-list.
- [ ] Escape anything written into HTML; prefer JSON responses.
- [ ] Cache GET responses at the edge with a normalised key.
- [ ] Generic error bodies to clients; details to logs only.
- [ ] Security headers applied.
- [ ] Covered by the rate-limit rule.
- [ ] Test the unhappy paths (empty, huge, malformed input; upstream down) before sign-off.

## Incident steps

1. Key leaked or abused: rotate at the provider, then `wrangler secret put` the new value and redeploy.
2. Spotify token compromised: revoke app access in Spotify settings, delete `spotify_refresh_token` from `GIG_KV`, re-run owner authorise.
3. Google Health token compromised: remove the app's access at myaccount.google.com → Security → Third-party apps, delete `health_refresh_token` from `GIG_KV`, rotate `GOOGLE_HEALTH_CLIENT_SECRET` in Google Cloud and `HEALTH_AUTH_KEY` (both via `wrangler secret bulk`), re-run `/api/health/authorize`.
4. Traffic spike: enable Under Attack mode, tighten the `/api/*` rate limit, check Worker logs.
5. Record what happened and the fix in the Handoff session log.
