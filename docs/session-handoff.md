# PARWANI — Session Handoff

## How to use this doc

This is the opening document for every new agent session. Read it top to bottom before touching code, then read the [Rulebook](agent-rulebook.md), [Security Handoff](security-handoff.md) and [Requirements Tracker](requirements-tracker.md). At the end of each session, add a new entry to the Session Log (newest on top) and update Current Build State and Priorities if they changed. Keep entries factual: what was done, what was tested, what is broken, what is next.

## Project snapshot

| Field | Value |
|---|---|
| Project | PARWANI — personal website / digital playground |
| Owner | Milind Parwani |
| Live URL | https://milindparwani.com |
| Purpose | Showcase interests across economics/finance, music (DJing, production), travel and games through working tools and projects |
| Hosting | Cloudflare Workers with static assets (Worker name: `portfolio`) |
| Preview surface | Claude artifact for iteration; local file as backup; deployed Worker is production |
| Repo | https://github.com/milindparwani04/portfolio |

## Stack and architecture

Front end: a single HTML/CSS/JS site served as Worker static assets (`env.ASSETS`). No framework. Audio files served from `/audio/` with custom HTTP Range support so the music player can seek.

Back end: one Cloudflare Worker (`worker/index.js`) acting as an API proxy so no third-party key ever reaches the browser. Storage is one KV namespace, `GIG_KV`, holding OAuth state tokens (10-minute TTL) and the Spotify refresh token. Deploy timestamp comes from the `CF_VERSION_METADATA` binding.

Secrets (set with `wrangler secret put`, never in code): `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_AUTH_KEY`, `FREESOUND_API_KEY`, `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`. If a secret is missing the route returns 503 "Lookup is not configured" rather than crashing.

| Route | Purpose | Upstream | Edge cache |
|---|---|---|---|
| `/api/news` | Headline ticker | BBC World RSS | 5 min |
| `/api/last-updated` | "Last deployed" stamp | Version metadata | 5 min |
| `/api/bpm-lookup` | Key/BPM Lookup tool (Camelot keys) | Spotify search + ReccoBeats | 1 hr |
| `/api/audio-features` | Sounds Like project | Spotify + ReccoBeats | 1 hr |
| `/api/sample-search` | Sample Finder tool | Freesound | 1 hr |
| `/api/spotify/authorize` | Owner-only OAuth start (key-gated) | Spotify | none |
| `/api/spotify/callback` | OAuth callback, stores refresh token | Spotify | none |
| `/api/gigs` | Upcoming gigs from top + trending artists | Spotify, Last.fm, Ticketmaster | 1 hr |
| `/audio/*` | Music player files with Range support | Static assets | default |

## Design system (locked — do not change unless Milind raises it)

- Aesthetic: retro terminal / command-prompt soul fused with Apple-grade minimalism.
- Palette: grayscale only. No accent colours, ever.
- Type: IBM Plex Mono for system UI, IBM Plex Sans for body, Anton for display headlines.
- Structure: rock-poster / cold-war redacted document language with "REF. 0X" numbered section labels.
- Navigation: every main section gets an equal, full-viewport chapter divider. No section looks subordinate.

## Goals and current priorities

Long-term goal: a portfolio that feels like an enterprise-quality product — fast, secure, accessible and fully working — while showing personality through music, finance and games.

Priorities, in order:

1. Close the open security findings (see [Security Handoff](security-handoff.md) §4) before shipping new public endpoints.
2. Finish API-integrated projects: Sounds Like, then Where Next (with Liveliness Index).
3. Activate remaining Toolbox placeholders, client-side tools first (no new backend risk).
4. Parked: real-time multiplayer "swipe to decide where to go out" — needs WebSockets/Durable Objects or Supabase, a places API and match logic. Do not start until 1–3 are done.

## Current build state

Shell: boot screen (`C:\PARWANI>_`, blinking cursor, "press ENTER") with CRT power-off transition; sticky hero with scroll-fade; top bar with live clock; scrolling ticker (live BBC headlines via `/api/news`); fixed bottom status bar tracking the current section.

Sections: Journal (REF. 01), Projects (REF. 02), Toolbox (REF. 03), Listen (REF. 04).

Music player: persistent pinned bar with parametric EQ (Pro-Q-style draggable nodes, scroll-wheel Q, presets). Audio served from `/audio/` with Range support.

Backend endpoints live: news, last-updated, BPM/key lookup, audio features, sample search, gigs, Spotify owner OAuth.

Settled removals (do not re-propose without flagging): YouTube to MP3/MP4/WAV converters (ToS and backend complexity), Seamless Set project, standalone Liveliness Index (merged into Where Next).

## Session log (newest first)

Copy this template for each session:

```
### YYYY-MM-DD — <session goal>
Model: <Opus plan / Sonnet execute>
Phase: <n of N>
Done:
- ...
Tested (how, result):
- ...
Known issues / not done:
- ...
Next session starts with:
- ...
```

### 2026-09-23 — Cross-device setup, leaked key removed, docs moved into repo

Model: Sonnet (execute)
Phase: 1 of 1
Done:
- Authenticated `gh` and Cloudflare `wrangler` on the second device (laptop) so both machines work against the same GitHub and Cloudflare accounts.
- Found `.claude/settings.local.json` was tracked in git and contained a live, unused TwelveData API key in plaintext. Removed it, untracked the file, added it to `.gitignore`. Shipped as PR #2, merged to `main` (commit `dd02851`).
- Moved the four project docs (this Handoff, Rulebook, Requirements Tracker, Security Handoff) from local-only PDFs into `docs/*.md` in this repo, and added a root `CLAUDE.md`, so any Claude session on either device reads the same rulebook and project state automatically via `git pull`.

Tested: `gh auth status` and `wrangler whoami` both confirmed on the laptop; PR #2 merge confirmed via `git log` on `main`.

Known issues / not done:
- The leaked TwelveData key is still visible in the *history* of the repo's initial commit (public). Not scrubbed — would need a force-push and rebase of the open `cloudflare/workers-autoconfig` PR. Recommend rotating the key at TwelveData regardless.
- §3 of the Security Handoff (Cloudflare dashboard checklist) still unverified.
- S-01 (reflected XSS in `/api/spotify/callback`) still open.

Next session starts with: verify the Security Handoff §3 dashboard checklist, then fix S-01.

### 2026-09-23 — Documentation baseline

Done: created the four project documents (this Handoff, Security Handoff, Requirements Tracker, Agent Rulebook) from a review of the deployed portfolio Worker and project notes.

Tested: Worker source and KV namespace confirmed via the Cloudflare connector. Zone-level dashboard settings (SSL, WAF, headers) could not be read and are marked "verify" in the Security Handoff.

Next session starts with: verify the dashboard checklist in Security Handoff section 3, then fix finding S-01 (reflected HTML in the Spotify callback).
