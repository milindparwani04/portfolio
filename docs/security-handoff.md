# PARWANI — Security Handoff

> **Living document.** Update this file as part of every push that changes the project — not just at a session's end. The next device to pull needs this current to pick up where you left off. (Unlike [`docs/agent-rulebook.md`](agent-rulebook.md), which is static.)

## 1. Scope and how to use

Covers the `portfolio` Worker on milindparwani.com, its static assets, the `GIG_KV` namespace and its six secrets. Section 2 was verified by reading the deployed Worker source on 23 Sep 2026. Section 3 covers Cloudflare zone settings that the API connector cannot read — tick each one only after checking it in the dashboard. Section 4 lists real gaps found in the code, ordered by severity. Any agent touching the Worker must re-run sections 2 and 5 before marking work complete.

## 2. Verified in Worker code

- [x] All third-party keys live in Worker secrets (`env.*`); none shipped to the browser. The front end only calls same-origin `/api/*`.
- [x] Missing secrets fail closed with 503 "Lookup is not configured" instead of throwing.
- [x] Spotify owner OAuth start (`/api/spotify/authorize`) is gated by `SPOTIFY_AUTH_KEY`; returns 403 otherwise.
- [x] OAuth `state` is a random UUID stored in KV with a 10-minute TTL and deleted after one use (CSRF and replay protection).
- [x] OAuth scope is minimal: `user-top-read` only.
- [x] Refresh token stored server-side in KV, rotated when Spotify returns a new one.
- [x] Empty queries rejected with 400; sample `mode` restricted to an allow-list (`vocals`, `melody`).
- [x] User input passed to upstream URLs via `encodeURIComponent` / `URLSearchParams`.
- [x] Upstream error text truncated to 200 characters.
- [x] Edge caching on every read endpoint (5 min to 1 hr) limits upstream quota burn.
- [x] Audio Range header parsed strictly by regex; invalid ranges return 416.
- [x] Ticketmaster queries bounded to future dates; tribute acts filtered.

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
- [ ] `/api/spotify/*` restricted (WAF rule or Cloudflare Access) so only the owner can reach it.

**Response headers (Transform Rule or in the Worker)**
- [ ] `Content-Security-Policy` limiting scripts, fonts and media to self + Google Fonts.
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Permissions-Policy` disabling camera, mic, geolocation.

**Workers**
- [ ] `workers.dev` subdomain route disabled so the Worker is only reachable on the real domain.
- [ ] Worker observability / logs enabled to spot abuse.

## 4. Open findings

| ID | Severity | Finding | Fix |
|---|---|---|---|
| S-01 | High | `/api/spotify/callback` writes the `error` query param and `err.message` straight into HTML — reflected XSS on your own domain. | HTML-escape all interpolated values, or return fixed plain-text messages. |
| S-02 | Medium | No security headers set by the Worker (CSP, nosniff, frame, referrer). | Add a `withSecurityHeaders()` wrapper on every response, or a Transform Rule (section 3). |
| S-03 | Medium | No rate limiting on `/api/*`. Cache keys include the full URL, so varying `q` bypasses cache and burns Spotify, Freesound and Ticketmaster quotas. | WAF rate-limit rule; also normalise cache keys (lowercase, trimmed `q`, drop unknown params). |
| S-04 | Medium | Raw upstream error messages returned to clients in 502 JSON (leaks provider names, status codes). | Log detail with `console.error`; return a generic `{"error":"Upstream unavailable"}`. |
| S-05 | Low | `bpm_min` / `bpm_max` concatenated into the Freesound filter unvalidated (filter injection). | Parse as integers, clamp 40–250, reject otherwise. |
| S-06 | Low | `q` has no length limit. | Reject over 100 characters with 400. |
| S-07 | Low | `SPOTIFY_AUTH_KEY` passed in the query string (can appear in logs and history); compared with `!==`. | Move behind Cloudflare Access, or send as a header and compare in constant time. |
| S-08 | Low | Range requests buffer the whole audio file in Worker memory (128 MB limit). | Move audio to R2 and use its native range support, or cap file size. |
| S-09 | Low | No explicit CORS policy on `/api/*`. | Add `Access-Control-Allow-Origin: https://milindparwani.com` only if cross-origin use is ever needed; otherwise leave closed and document it. |
| S-10 | Low (closed 2026-09-23) | `.claude/settings.local.json` was tracked in git and contained a live TwelveData API key in plaintext (from ad-hoc, never-shipped Stock Compare testing). | Fixed in PR #2 (`dd02851`): key removed, file untracked, added to `.gitignore`. Key still visible in the repo's initial-commit history on GitHub (public) — not yet rotated at TwelveData or scrubbed from history. |

When a finding is fixed: move it to section 2 as a ticked item, note the date and test used in the Handoff session log.

## 5. Rules for any new endpoint

- [ ] Keys go in `wrangler secret put`, never in code, `wrangler.toml`/`wrangler.jsonc`, or any file committed to the repo (including `.claude/settings.local.json` — see S-10).
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
3. Traffic spike: enable Under Attack mode, tighten the `/api/*` rate limit, check Worker logs.
4. Record what happened and the fix in the Handoff session log.
