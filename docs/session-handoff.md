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

Front end: a framework-free HTML/CSS/JS site served as Worker static assets (`env.ASSETS`). The visible portfolio interface lives in `public/index.html`, `public/ui-v2.css`, and `public/ui-v2.js`; full-resolution editorial images live in `public/assets/ui/`. The earlier shell remains in the document but is hidden while its working toolbox modals are reused.

Back end: one Cloudflare Worker (`worker/index.js`) acting as an API proxy so no third-party key ever reaches the browser. Storage is one KV namespace, `GIG_KV`, holding OAuth state tokens (10-minute TTL) and the Spotify refresh token, plus one D1 database, `portfolio-plays` (binding `PLAYS_DB`, schema in `migrations/`), holding the Spotify play log. A Cron Trigger (`*/30 * * * *`) runs `scheduled()`, which copies the latest 50 plays from Spotify recently-played into `PLAYS_DB`. Deploy timestamp comes from the `CF_VERSION_METADATA` binding.

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
| `/api/now-playing` | Dashboard Spotify card: current track, else last played | Spotify (owner token) | 20 s |
| `/api/playlists` | The three playlist cards (pop, Camon, idk — IDs in `PLAYLIST_IDS`) | Spotify (app token) | 6 hr |
| `/api/listening` | Top 5 tracks + artists for the Dubai calendar month, with play counts from `PLAYS_DB`; falls back to Spotify `short_term` (no counts, `source: "short_term"`) while the month has < 5 distinct tracks | D1, Spotify (owner token) | 10 min |
| `/audio/*` | Legacy Range handler; no MP3 assets are tracked or exposed by the current UI | Static assets | default |

## Design system (locked — do not change unless Milind raises it)

- Aesthetic: retro terminal / command-prompt soul fused with Apple-grade minimalism.
- Palette: predominantly monochrome, with restrained colour reserved for editorial photography, playlist/gig artwork, the weather icon, and the Spotify label. Projects and Toolbox are text-only.
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

Home dashboard: fixed-size headline card with text fitted on each rotation from `/api/news`; Dubai clock and live Dubai weather from Open-Meteo; deploy timestamp from `/api/last-updated`; empty-state heart-rate and Spotify cards; dissertation and current-focus cards. The opening section uses the approved mockup's full-width alignment and includes a scroll-to-Journal cue. Every API-backed card retains its layout when data is unavailable.

Section paging: on desktop/tablet (≥721 px wide and ≥620 px tall) every section is exactly one viewport under a fixed nav bar, and one wheel gesture or key press (PageUp/PageDown/arrows/Space/Home/End) moves one whole section (`initSectionPager` in `public/ui-v2.js`, CSS scroll-snap for touch/scrollbar). Each section has a "↑ previous" cue top-right and a "SCROLL / X NEXT ↓" cue at the bottom; the nav underlines the current section and the URL hash follows it. Content scales with viewport height so nothing clips down to ~1100×620; a short-viewport tier (≤760 px tall) tightens spacing. Phones and smaller windows scroll normally.

Sections: Journal (REF. 01, one full-height Karoshi feature card with status/topic rows), Projects (REF. 02, text-only 3×2 cards plus one full-width card, each with a status row and action bar), Toolbox (REF. 03, 3×3 grid of all nine tools with inline-SVG thumbnails; Sample Finder, PDF Editor and Signature Creator show a disabled "Still being built" action), Playlists (REF. 04, three cards with "Open on Spotify" bars plus a Top Tracks table empty state), and Gig Finder (REF. 05, 10-second countdown bar, hover/focus pause, footer with Back to top). The local music player is no longer exposed. The modal code for the three unfinished tools remains in the hidden legacy shell.

Backend endpoints live: news, last-updated, BPM/key lookup, audio features, sample search, gigs, Spotify owner OAuth. Built on `feat/spotify-listening`, not deployed: now-playing, playlists, listening, plus the play-log cron.

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

### 2026-09-30 — Spotify listening data: Worker routes + play log (Phase 1)
Model: Opus
Phase: 1 of 4
Done:
- Created D1 `portfolio-plays` (id `b4977ab6-4861-41d9-82f3-503677a7bb3d`, EEUR) via the Cloudflare connector — wrangler isn't logged in on this laptop — and applied `migrations/0001_plays.sql` to it directly (so D1's migrations table doesn't list it; the SQL is `IF NOT EXISTS`, safe to re-apply).
- `wrangler.jsonc`: `PLAYS_DB` binding and `*/30 * * * *` cron.
- `worker/index.js`: OAuth scopes widened; `/api/now-playing`, `/api/playlists`, `/api/listening`; `scheduled()` → `recordRecentPlays`; 8 s timeouts added to both Spotify token calls. Playlist order from Milind: pop, Camon, idk (idk was private, Milind made it public).
Tested (how, result):
- `wrangler dev --local` with seeded local D1: month boundary correct (a play at 00:30 1 Sep Dubai counted, 20:59 31 Aug excluded); track and artist play counts correct including a two-artist track (first run caught a bug — `json_each`'s own `id` column hijacked `GROUP BY id`; fixed by aliasing). A request with a junk query string was a cache HIT. Log thinned to 3 distinct tracks → switches to `short_term`.
- No secrets → all three routes 503. Dummy creds / no refresh token → generic 502, detail only in the log; cron logs and exits cleanly.
- Not testable locally (needs real secrets + the production OAuth redirect): real Spotify responses, the cron insert, playlist field shapes. Verify after deploy.
Known issues / not done:
- Not deployed. Milind must re-authorize at `/api/spotify/authorize?key=…` after deploy; until then now-playing/listening return 502 and the cron logs "not connected" / 403.
- Top artists from the log have no image (recently-played returns simplified artists); `short_term` fallback artists do.
Next session starts with:
- Phase 2: wire the dashboard Spotify card, playlist cards and Top Tracks/Artists into `public/ui-v2.js`, keeping every empty state.

### 2026-09-30 — Spotify listening data: plan agreed, S-01 fixed
Model: Opus
Phase: 0 of 4 (security prerequisite)
Done:
- Agreed plan with Milind for live listening data, Spotify only (Last.fm, stats.fm and statsforspotify.com considered and rejected — stats.fm has no official API, statsforspotify.com is only a front end over Spotify's own API, and Spotify never exposes play counts). Phases: 0 fix S-01 → 1 Worker (`/api/now-playing`, `/api/playlists`, `/api/listening` backed by a D1 play log filled by a 30-min Cron Trigger polling `/me/player/recently-played`, so top 5 tracks/artists are an exact calendar month with play counts; `short_term` fallback until the log has data) → 2 frontend wiring → 3 docs.
- Fixed S-01 in `handleSpotifyCallback`: fixed plain messages only, details logged with `console.error`.
Tested (how, result):
- `wrangler dev --local`: `?error=<script>…` → "Spotify authorization failed." (payload appears only in the log); no params → "Missing code or state."; bad state → expired message; seeded valid state + bad code → "Token exchange failed."; `/api/spotify/authorize` without key → 403.
Known issues / not done:
- Not deployed. Branch `feat/spotify-listening` (off `feat/section-paging`).
- Milind must re-run `/api/spotify/authorize` after Phase 1 adds scopes `user-read-currently-playing user-read-recently-played`, and supply the 3 playlist URLs.
Next session starts with:
- Phase 1 (Worker + D1 play log).

### 2026-09-30 — Full-viewport section paging, layouts matched to mockups

Model: Opus (plan + execute)
Phase: 3 of 3 (1 section engine, 2 layout fidelity, 3 docs + PR)
Done:
- Section engine: each section is one viewport under a fixed nav; wheel/trackpad (with momentum lock and 400 ms landing cooldown), keyboard and scroll-snap move exactly one section; active nav link + URL hash sync; reduced-motion jumps instantly; paging disabled while a tool modal is open or a field has focus.
- Layouts rebuilt against Milind's four mockups (home, toolbox, playlists, gigs); Journal and Projects designed in the same language (no mockups supplied). Home title fit now capped by viewport height; headline fit ceiling raised so it fills its box.
- Toolbox restored to all nine tools per Milind; the three unfinished ones show a disabled "Still being built" action.
- Gig Finder: live countdown/progress bar, hover/focus pause, footer moved into the section. Neutralised the legacy global `footer{}` rule on `.v2-footer`.
Tested (how, result):
- Iframe fit checks at 1920×1080, 1536×864, 1440×900, 1366×768, 1366×657, 1280×720, 1280×640, 1100×620, 1024×768: every section's content and scroll cue fit within the viewport, no clipped panels.
- Real wheel scrolling in Chrome: a 5-tick spin moves exactly one section; PageDown/ArrowDown move one section each; nav click lands on the section top; Back to top returns home.
- Audio Trimmer opens and closes with Escape; the three disabled tools open nothing; gig countdown holds on hover and resumes on leave; Next advances the batch and resets the countdown.
- 390×844: normal scroll, no horizontal overflow. No console errors.
Known issues / not done:
- Toolbox thumbnails are inline SVG illustrations, not photos (only ~180 px mockup crops were available). Swap in HD images if supplied.
- "Open on Spotify" buttons link to the Spotify profile; individual playlist URLs needed. Track counts/durations omitted (no real data).
- Below 760 px viewport height the weather humidity/wind line and heart-rate flatline are hidden to keep cards within their section.
- S-01 still open; no Worker changes this session.
Next session starts with: review production after merge on real laptop/desktop screens; supply playlist URLs and any HD toolbox images; then remove hidden legacy shell code and fix S-01.

### 2026-09-30 — Visual fidelity correction after live review

Model: Codex (execute)
Phase: 2 of 2
Done:
- Matched the approved opening-page grid more closely: aligned full-width title and card edges, fixed dashboard rows, a smaller photo area, and stable headline text fitting across 10-second rotations.
- Removed every Project and Toolbox thumbnail, aligned Projects as two rows of three plus a full-width seventh card, and restyled six Toolbox actions as outlined terminal buttons.
- Removed Sample Finder, PDF Editor, and Signature Creator from the visible Toolbox as requested. Existing modal implementations were left intact outside the new UI.
- Added the missing section-to-section scroll cues and adjusted spacing in the Journal card so its article button sits clear of the description and lower border.
- Replaced ten low-resolution crops with generated full-resolution editorial, playlist, and generic gig imagery; deleted the obsolete crops.
- Added live humidity/wind values and condition-appropriate weather icons to make the Dubai card more useful.

Tested (how, result):
- Compared the local page visually to the supplied 1672×941 home mockup and inspected Journal, Projects, and Toolbox at desktop width.
- At 390×844, checked that the document has no horizontal overflow, the fixed news card remains stable, and the Journal button stays separated from text and border.
- Opened and closed Audio Trimmer from the new text-only Toolbox; no browser console errors.

Known issues / not done:
- Heart-rate, Spotify now-playing, and monthly listening-history data remain intentional empty states until connected.
- The hidden legacy shell and three removed tools' modal code remain in `index.html`; no new Worker routes were added. Security finding S-01 remains open.

Next session starts with: inspect production after Cloudflare auto-deploy, then remove hidden legacy shell/player code in a separate focused cleanup.

### 2026-09-30 — Approved portfolio UI implemented

Model: Codex (execute)
Phase: 2 of 2
Done:
- Rebuilt the visible site around the approved monochrome editorial/terminal mockups, with restrained colour in imagery, the Spotify label and weather icon.
- Added the dashboard cards, rotating headlines, Dubai clock/weather, deployment date, heart-rate and Spotify empty states, dissertation/current-focus cards, full-width Karoshi journal feature, expanded project/tool grids, playlists/listening-history section, and five-at-a-time rotating gig finder.
- Reused all nine working toolbox overlays from the previous interface, including the Audio Trimmer.
- Removed the visible boot gate, old floating navigation, old status bar and local music-player surface; deleted all ten tracked local MP3 files.

Tested (how, result):
- `node --check public/ui-v2.js` passed.
- Browser-tested desktop and 390×844 mobile layouts; Dubai weather resolved to live data, placeholders remained stable, gig/headline rotation rendered, and no console errors appeared.
- Opened and closed the Audio Trimmer from the redesigned Toolbox; overlay worked at the mobile breakpoint.

Known issues / not done:
- Heart-rate, Spotify now-playing and monthly listening-history data are intentional empty states until data sources are connected.
- The earlier hidden shell/player code remains in the HTML for now, but the interface is unreachable and all local MP3 assets have been deleted. Remove the dead player code in a focused cleanup after confirming no shared modal dependencies.
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
