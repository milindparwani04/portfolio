# PARWANI — Session Handoff

> **Living document.** Update this file as part of every push that changes the project — not just at a session's end. The next device to pull needs this current to pick up where you left off. (Unlike [`docs/agent-rulebook.md`](agent-rulebook.md), which is static.)

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

Front end: a framework-free HTML/CSS/JS site served as Worker static assets (`env.ASSETS`). The approved portfolio interface lives in `public/index.html`, `public/ui-v2.css`, and `public/ui-v2.js`; cropped visual assets live in `public/assets/ui/`. The earlier shell remains in the document but is hidden while its working toolbox modals are reused.

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
- Palette: predominantly monochrome, with restrained colour reserved for editorial photos, project/tool thumbnails, playlist/gig artwork, the weather icon, and the Spotify label.
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

Shell: opens directly onto a clean `C:\PARWANI>` navigation bar and the `MY DIGITAL PORTFOLIO.` dashboard. The former ENTER/CRT boot gate, floating navigation and bottom status bar are no longer visible.

Home dashboard: rotating headlines from `/api/news`; Dubai clock and live Dubai weather from Open-Meteo; deploy timestamp from `/api/last-updated`; empty-state heart-rate and Spotify cards; dissertation and current-focus cards. Every API-backed card retains its layout when data is unavailable.

Sections: Journal (REF. 01, Karoshi article only), Projects (REF. 02), Toolbox (REF. 03), Playlists (REF. 04), and Gig Finder (REF. 05). The local music player is no longer exposed; playlists and a five-row listening-history placeholder replace it.

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

### 2026-09-30 — Approved portfolio UI implemented

Model: Codex (execute)
Phase: 2 of 2
Done:
- Rebuilt the visible site around the approved monochrome editorial/terminal mockups, with restrained colour in imagery, the Spotify label and weather icon.
- Added the dashboard cards, rotating headlines, Dubai clock/weather, deployment date, heart-rate and Spotify empty states, dissertation/current-focus cards, full-width Karoshi journal feature, expanded project/tool grids, playlists/listening-history section, and five-at-a-time rotating gig finder.
- Reused all nine working toolbox overlays from the previous interface, including the Audio Trimmer.
- Removed the visible boot gate, old floating navigation, old status bar and local music-player surface.

Tested (how, result):
- `node --check public/ui-v2.js` passed.
- Browser-tested desktop and 390×844 mobile layouts; Dubai weather resolved to live data, placeholders remained stable, gig/headline rotation rendered, and no console errors appeared.
- Opened and closed the Audio Trimmer from the redesigned Toolbox; overlay worked at the mobile breakpoint.

Known issues / not done:
- Heart-rate, Spotify now-playing and monthly listening-history data are intentional empty states until data sources are connected.
- The earlier hidden shell and local audio assets remain in the source for now; they are not reachable from the visible interface and should be removed in a focused cleanup after confirming no shared modal dependencies.
- Security finding S-01 remains open and no Worker routes were changed in this UI-only release.

Next session starts with: verify the live Cloudflare build after the GitHub push, then remove the hidden legacy shell/local audio code without disturbing the reused toolbox modal implementations.

### 2026-09-23 — Full secret scan, repo hygiene cleanup, TwelveData key rotated

Model: Sonnet (execute)
Phase: 1 of 1
Done:
- Ran a full scan for secrets/PII: current tracked files, entire git history on every branch, and the open `cloudflare/workers-autoconfig` PR (#1). Only the already-known S-10 TwelveData key turned up; no other credentials, `.env` files, private keys or personal contact info found.
- Found two repo-hygiene issues in the same pass: `.claude/tools/node_modules/` (~1,300 files, third-party dev-tool dependencies) and `.claude/launch.json` (embedded Milind's absolute Windows path) were both tracked. Untracked both, added both to `.gitignore`. Shipped as PR #4 (not yet merged).
- Milind regenerated the TwelveData key at the provider and confirmed via their dashboard that it was never used by anyone else before rotation. S-10 updated from "closed" (code-level fix only) to "resolved" (key itself is now dead).

Tested: `git log --all -p` and `git grep` across the full history and PR #1 diff for key/token/password/secret patterns, excluding node_modules noise; manually verified each hit.

Known issues / not done:
- PR #3 (docs into repo) and PR #4 (hygiene cleanup) awaiting Milind's merge confirmation — pushing to GitHub requires it explicitly, this session couldn't merge on its own. **If you're reading this via `git pull` on `main` and don't see `docs/` or `CLAUDE.md`, that means neither PR was merged yet — check github.com/milindparwani04/portfolio/pulls before assuming this file is current.**
- The old TwelveData key is still visible in the initial commit's history — harmless now that it's revoked, left as-is rather than force-pushing a history rewrite.
- §3 of the Security Handoff (Cloudflare dashboard checklist) still unverified.
- S-01 (reflected XSS in `/api/spotify/callback`) still open.

Next session starts with: once PR #3 and PR #4 are merged, verify Security Handoff §3, then fix S-01.

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
