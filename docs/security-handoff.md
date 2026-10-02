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
- [x] Google Health owner OAuth (`/api/health/authorize`, `/api/health/callback`, live 2026-09-30): gated by `HEALTH_AUTH_KEY` with a constant-time compare (S-07 fix applied to this route only), single-use `health_oauth_state:` KV state with 10-minute TTL, fixed-message callback, read-only scope `googlehealth.health_metrics_and_measurements.readonly`. `/api/heart-rate` takes no input, 30 s versioned cache, generic 502. Google OAuth app is In production but unverified (100-user cap, single owner user), with only this one restricted scope on its consent screen (six unused health scopes removed 2026-09-30). Heart-rate readings are personal health data shown publicly by design (Milind's choice); only the latest single reading is exposed, never history.
- [x] Empty queries rejected with 400; sample `mode` restricted to an allow-list (`vocals`, `melody`).
- [x] User input passed to upstream URLs via `encodeURIComponent` / `URLSearchParams`.
- [x] Upstream error text truncated to 200 characters.
- [x] Edge caching on every read endpoint (5 min to 1 hr) limits upstream quota burn.
- [x] Audio Range header parsed strictly by regex; invalid ranges return 416.
- [x] Ticketmaster queries bounded to future dates; tribute acts filtered.
- [x] Gig Finder (rebuilt 2026-10-02): one Ticketmaster UAE events query (≤ 3 pages) plus capped, KV-cached lookups — Last.fm artist tags (`gig_tags:v1:*`, ≤ 15 per run) and Ticketmaster attraction photos for curated events (`gig_image:v1:*`, ≤ 10 per run), 30-day TTL — so a cold run stays well under the 50-subrequest limit. MusicBrainz and the Spotify top-artists call are no longer used by this route. `/api/gigs` takes no input, uses a fixed versioned cache key (`gigs-v3`), and now returns a generic `{"error":"Gig lookup failed"}` (detail logged with `console.error`); a Ticketmaster outage still serves the curated list with a 5-minute cache. Curated events come from `worker/gig-picks.json`, bundled at deploy (not fetched at runtime). Image and ticket URLs are accepted only if `https://`, and the frontend escapes them and re-checks the scheme before rendering. A weekly Claude cloud routine (`trig_01V5wXhtAzpJkHrW11is9yt2`) edits that JSON and pushes to `main`, which deploys production — review its commits like any other.
- [x] Privacy page at `/privacy` (required for the Google consent screen); its claims — no cookies, no analytics/trackers — were checked against `public/` and the Worker on 2026-09-30. Keep it accurate if either changes.

## 3. Cloudflare zone baseline (verify in dashboard)

**Account**
- [ ] Two-factor authentication on the Cloudflare account; API tokens scoped to least privilege (no Global API Key in use).

**SSL/TLS**
- [ ] Encryption mode: Full (strict).
- [ ] Always Use HTTPS: on. Automatic HTTPS Rewrites: on.
- [ ] Minimum TLS version 1.2; TLS 1.3 on.
- [ ] HSTS enabled (max-age ≥ 6 months, include subdomains) once HTTPS is confirmed everywhere.

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
