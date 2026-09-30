# PARWANI — Requirements Tracker

> **Living document.** Update this file as part of every push that changes the project — not just at a session's end. The next device to pull needs this current to pick up where you left off. (Unlike [`docs/agent-rulebook.md`](agent-rulebook.md), which is static.)

## Status legend

`Live` shipped and tested in production · `Built` works in preview, not verified live · `UI only` placeholder, no function · `Planned` agreed, not started · `Parked` deliberately deferred · `Dropped` decided against.

An item only moves to `Live` after the Definition of Done in the [Rulebook](agent-rulebook.md) is met. Update this doc in the same session the status changes.

## Platform and non-functional requirements

| ID | Requirement | Target | Status |
|---|---|---|---|
| NF-01 | Performance | Lighthouse Performance ≥ 90 on mobile; LCP < 2.5 s; CLS < 0.1 | Planned |
| NF-02 | Accessibility | WCAG 2.1 AA: keyboard navigable, visible focus, alt text, `prefers-reduced-motion` respected (boot/CRT animations skippable) | Planned |
| NF-03 | Responsive | Works 360 px to 1920 px; dashboard, grids and tool overlays usable on touch | Built — desktop and 390×844 mobile browser-tested 2026-09-30 |
| NF-04 | Browser support | Latest Chrome, Safari, Firefox, Edge; iOS Safari | Planned |
| NF-05 | Security | All Security Handoff findings S-01 to S-04 closed | Planned |
| NF-06 | Resilience | Every API-driven widget shows a graceful fallback when its endpoint fails | Built (partial) |
| NF-07 | SEO / sharing | Title, meta description, Open Graph image, favicon, sitemap, robots.txt | Planned |
| NF-08 | Analytics | Cloudflare Web Analytics (cookie-free, no banner needed) | Planned |
| NF-09 | Source control | Code in a Git repo; deploys via `wrangler deploy` from main only; tagged releases | Built (partial) — repo live at github.com/milindparwani04/portfolio, feature-branch + PR workflow in active use (PRs #2–#4), Cloudflare auto-builds from `main`. No tagged releases yet. |
| NF-10 | Design fidelity | Predominantly monochrome; selective colour in editorial imagery/icons; IBM Plex Mono + Anton; REF. labelling | Built — approved mockup direction implemented 2026-09-30 |

## Site shell and sections

| ID | Item | Requirement | Status |
|---|---|---|---|
| SH-01 | Boot screen | Removed by design; the portfolio opens directly on the dashboard | Dropped |
| SH-02 | Hero + top bar | Clean `C:\PARWANI>` navigation and oversized one-line/flowing portfolio title; live Dubai clock in dashboard | Built |
| SH-03 | Headlines | Dedicated rotating headline card via `/api/news`, auto-advances every 10 seconds with fallback copy | Built |
| SH-04 | Status bar | Removed in favour of the clean sticky navigation | Dropped |
| SH-05 | Sections | Journal, Projects, Toolbox, Playlists and Gigs retain Anton titles + Ref. stamps in a continuous scroll | Built |
| SH-06 | Last updated | Deploy date from `/api/last-updated`, with local-preview fallback | Built |
| SH-07 | Personal metrics | Heart-rate and Spotify cards keep their approved layouts as explicit empty states until sources are connected | Built |
| SH-08 | Dubai weather | Current temperature/condition and daily high/low from Open-Meteo, with stable unavailable state | Built |
| SC-01 | Journal (REF. 01) | Writing on economics/finance; needs a content format (Markdown files or CMS) decided | Planned |
| SC-02 | Projects (REF. 02) | Card grid; each card links to a working project | Built |
| SC-03 | Toolbox (REF. 03) | Nine visible operational tools; future ideas remain tracked below | Built |
| SC-04 | Playlists (REF. 04) | Three playlist cards and five-row monthly listening-history empty state; no provider name exposed | Built (data placeholders) |
| SC-05 | Gig Finder (REF. 05) | Five event cards per batch, manual controls and 10-second auto-advance | Built |
| MP-01 | Local music player | Removed from the visible experience; Spotify empty state and playlists replace local MP3 playback | Dropped |
| MP-02 | Parametric EQ | Removed with the local music player | Dropped |
| MP-03 | Gigs | Upcoming shows via `/api/gigs`, displayed five at a time with fallback data | Built |

## Projects

Each project needs before `Live`: working happy path, error/empty states, mobile layout, and any new route added to the Security Handoff.

| ID | Project | What it must do | Dependencies | Priority | Status |
|---|---|---|---|---|---|
| PR-01 | Sounds Like | Enter a track, get its audio profile (energy, valence, danceability, tempo, key) and similar-feeling tracks | `/api/audio-features` (live); similarity source to choose | 1 | Built (partial) |
| PR-02 | Where Next | Suggest a place to go, with the Liveliness Index scoring how busy/lively it is now | Places API (Google Places or Foursquare) + new Worker route | 2 | Planned |
| PR-03 | Prompt Playlist | Text prompt → playlist | Spotify search; LLM or rules for mapping | 3 | Planned |
| PR-04 | Today Somewhere | A daily "what's happening somewhere in the world" card | News/time-zone data | 4 | Planned |
| PR-05 | Speed Round | Timed trivia game, local high score | None (client-side) | 5 | Planned |
| PR-06 | Untitled Terminal Adventure | Text adventure played in the terminal aesthetic | None (client-side) | 6 | Planned |

## Toolbox

The visible toolbox contains TB-01 through TB-08 plus TB-11. TB-09 and TB-10 remain future ideas and require a security review before any backend work.

| ID | Tool | Approach | Backend? | Status |
|---|---|---|---|---|
| TB-01 | Key/BPM Lookup | Spotify + ReccoBeats, Camelot keys | Yes — `/api/bpm-lookup` | Built |
| TB-02 | Sample Finder | Freesound search, vocals/melody, BPM range, licence label | Yes — `/api/sample-search` | Built |
| TB-03 | Tempo Tap | Tap to BPM, rolling average, reset | No | Built |
| TB-04 | Password Generator | `crypto.getRandomValues`, length + character options, strength meter | No | Built |
| TB-05 | QR Code Generator | Client-side library, PNG/SVG download | No | Built |
| TB-06 | Image Converter | Canvas API: PNG/JPG/WebP, resize, quality | No | Built |
| TB-07 | PDF Editor | Merge, split, rotate, reorder and annotate; files never uploaded | No | Built |
| TB-08 | Audio Trimmer | Web Audio API waveform, trim, export WAV | No | Built — overlay retested 2026-09-30 |
| TB-09 | Stock Compare | Two tickers, normalised price chart | Yes — market data API + new route | UI only |
| TB-10 | URL Shortener | KV-backed short links; owner-only creation to prevent abuse | Yes — new route + KV | UI only |
| TB-11 | Signature Creator | Draw/type a signature and export transparent PNG | No | Built |

> **Note (2026-09-23):** an early TB-09 test used a real TwelveData API key hardcoded in `.claude/settings.local.json`, which got committed. It's been removed (see Security Handoff and Session Handoff log) and TB-09 is still UI-only/not built — no live integration exists yet. When TB-09 is actually built, its key must go through `wrangler secret put`, never into a settings/permissions file.

## Parked and dropped

| Item | Status | Reason |
|---|---|---|
| Swipe-to-decide multiplayer (going out) | Parked | Needs WebSockets/Durable Objects or Supabase, places API, match detection. Revisit after Where Next ships. |
| YouTube → MP3/MP4/WAV converters | Dropped | Terms of service risk and backend complexity. Do not re-propose similar converters without flagging this. |
| Seamless Set | Dropped | Removed from Projects. |
| Standalone Liveliness Index | Dropped | Merged into Where Next. |
