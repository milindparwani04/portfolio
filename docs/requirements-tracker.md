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
| NF-03 | Responsive | Works 360 px to 1920 px; dashboard, grids and tool overlays usable on touch | Built — grey-box layout fit-tested 2026-10-01 (no overlap, no clipping, no in-section scroll) at 2560×1300, 1920×969, 1440×789, 1366×657, 1280×720, 1100×620, 1024×700, 768×1024; continuous scroll at 390×844 and 360×740 |
| NF-04 | Browser support | Latest Chrome, Safari, Firefox, Edge; iOS Safari | Planned |
| NF-05 | Security | All Security Handoff findings S-01 to S-04 closed | Planned |
| NF-06 | Resilience | Every API-driven widget shows a graceful fallback when its endpoint fails | Built (partial) — all live-data cards (Spotify, playlists, listening history, heart rate, gigs) keep their static/empty state on failure, tested 2026-09-30 |
| NF-07 | SEO / sharing | Title, meta description, Open Graph image, favicon, sitemap, robots.txt | Planned |
| NF-08 | Analytics | Cloudflare Web Analytics (cookie-free, no banner needed) | Planned |
| NF-09 | Source control | Code in a Git repo; deploys via `wrangler deploy` from main only; tagged releases | Built (partial) — repo live at github.com/milindparwani04/portfolio, feature-branch + PR workflow in active use (PRs #2–#7), Cloudflare auto-builds from `main`. No tagged releases yet. Non-production branch builds currently also deploy to production — command must be changed to `npx wrangler versions upload`. |
| NF-10 | Design fidelity | Predominantly monochrome grey-box panels; colour only in real Spotify covers, gig artist photos, weather icon and Spotify label; IBM Plex Mono + Anton; REF. labelling | Live 2026-10-01 — all six sections matched to the Soft Monolith mockups; verified in production |

## Site shell and sections

| ID | Item | Requirement | Status |
|---|---|---|---|
| SH-01 | Boot screen | Removed by design; the portfolio opens directly on the dashboard | Dropped |
| SH-02 | Hero + top bar | Clean `C:\PARWANI>` navigation and oversized one-line/flowing portfolio title; live Dubai clock in dashboard | Superseded 2026-10-07 by the Parwani-DOS top bar (R-DOS-1) and two-line title (R-DOS-3); the top bar's own clock shows the viewer's local time, not Dubai's — the Dubai *date* (not a clock) still lives in the about.txt widget, same as the old About card |
| SH-03 | Headlines | Fixed-size card via `/api/news`; title text fits within its area, rotates every 10 seconds; preview copy and description follow each other | Built |
| SH-04 | Status bar | Removed in favour of the clean sticky navigation | Dropped |
| SH-05 | Sections | Superseded 2026-10-07 by the Parwani-DOS windows (R-DOS-4 to R-DOS-8): every section is a window with a coloured title bar holding its ↑ / ↓ links | Live |
| SH-09 | Section paging | Desktop/tablet (≥721 px wide, ≥620 px tall): every section is exactly one viewport under the fixed top bar; native CSS scroll-snap (wheel/touch/scrollbar/anchor links); URL hash follows the section; reduced motion jumps instantly. Smaller viewports scroll normally | Built — reworked onto native scroll-snap + the Parwani-DOS CRT transition 2026-10-07 (R-DOS-2), replacing the old spring-based pager |
| SH-06 | Last updated | Deploy date from `/api/last-updated`, with local-preview fallback | Replaced 2026-10-04 by SH-10 on the dashboard (route kept for the hidden legacy shell) |
| SH-10 | Game card | Card 08 `[ Game ]`: whichever of PlayStation and Steam is running a game, else whichever was played most recently, with art (square PSN, 2:3 Steam cover), `Playing now` / `Last played / age` and platform, via `/api/game`. PSN reconnects about every 10 days at `/api/psn/authorize`; Steam needs `STEAM_API_KEY` + `STEAM_ID` and public game details | PlayStation live 2026-10-04 (verified in production); Steam live 2026-10-04 (key and ID stored; key, profile visibility and 121-game library checked against the Steam API; production requests log no Steam errors) |
| SH-07 | Personal metrics | Heart-rate and Spotify cards keep their approved layouts as explicit empty states until sources are connected. Spotify card shows the current track (else last played) from `/api/now-playing` | Spotify card Live 2026-09-30 (polls every 30 s while visible; verified in production); heart-rate card Live 2026-09-30 — `/api/heart-rate` from Google Health API, verified in production (81 BPM, reading ~30 s old); both update on screen without a reload (fixed 2026-09-30). Freshness limited by the phone's background sync. Steps card (replaces Time / Location) built 2026-10-02: `/api/steps` daily total vs 10,000 goal with the same "latest reading" age; live with real data 2026-10-02, verified in production (2,587 steps); restyled the same day to Codex's oversized-count design (no age footer) |
| SH-08 | Dubai weather | Current temperature/condition, daily high/low, humidity, wind, and condition-appropriate icon from Open-Meteo, with stable unavailable state | Built |
| SC-01 | Journal (REF. 01) | Writing and media reviews (Codex mockup, implemented 2026-10-02): three cards with a photo on top, then title and copy, then the status pinned to the bottom. Photos, titles and status rows line up across cards. Reviews show a jagged round score badge (red 1–5, yellow 6–7, green 8–9, purple 10; games also list the platform). Unfinished entries show only their status; `Completed` entries add an underlined `Read more ›` link. Current entries: Karoshi (Researching), The Attention Economy (Planned), The Shawshank Redemption review 10/10 (Writing). Article pages and content format (Markdown files or CMS) still to decide | Superseded 2026-10-07 by R-DOS-4: one Journal window, list of every entry left, selected entry right (photo, title, meta, scrolling article body); finished articles go inline in the entry panel, so `Read more` links are gone |
| SC-02 | Projects (REF. 02) | Superseded 2026-10-07 by R-DOS-5/6: Parwani-DOS window with six icon cards (Sounds Like + Prompt Playlist merged) and the Champion Run cartridge, each opening a window | Live |
| SC-03 | Toolbox (REF. 03) | Superseded 2026-10-07 by R-DOS-7: 3×3 grid in a window; a tool opens in a 520px side panel (full-screen sheet on phones) | Live |
| SC-06 | Media (REF. 04, added 2026-10-02) | Same five-card rail as the Gig Finder (shared `createCardRail` in `ui-v2.js`), between Toolbox and Playlists, via `/api/media`. Films showing in Dubai (English, Japanese or Korean only; no TV): new releases once with their release date and no venue, from 7 days ago to 3 months ahead; old films on a limited run tagged Re-release with their first–last screening day and the cinemas showing them (Reel Dubai Mall / VOX Mercato, BurJuman, Mall of the Emirates / ROXY Dubai Hills); Cinema Akil screenings named and shown with their date range. Games: notable releases in the next 3 months with platforms. Posters and covers shown whole over a blurred backdrop; no ticket links | Built 2026-10-02 |
| SC-04 | Playlists (REF. 05) | Three playlist cards (pop, Camon, idk, left to right) with real name/cover/track count and an "Open on Spotify" footer linking to each playlist, via `/api/playlists`; "Top this month" list (name, artist, bar, plays) with a Tracks / Artists toggle, for the Dubai calendar month with play counts via `/api/listening` (D1 play log; `short_term` fallback labelled "Last 4 weeks", no plays or bars); top artists show the album cover from their latest play | Live 2026-09-30 — verified in production: track counts 453/222/113, top 5 from the play log, all five artists with covers |
| SC-05 | Gig Finder (REF. 06) | Five event cards per batch, manual controls, 10-second countdown with progress line, hover/focus pauses rotation; empty-state message when no listings; footer with ©, Back to top, LinkedIn and Spotify. Since 2026-10-02 each card's tag shows its category (Comedy / Musical / Concert / DJ / Film score / Big event) and multi-night runs show a date range | Built |
| MP-01 | Local music player | Removed from the visible experience; Spotify empty state and playlists replace local MP3 playback | Dropped |
| MP-02 | Parametric EQ | Removed with the local music player | Dropped |
| MP-03 | Gigs | Dubai and Abu Dhabi only (Milind, 2026-10-02): comedians in either city; musicals at Dubai Opera and Coca-Cola Arena; English-language concerts at Coca-Cola Arena, Ushuaïa and the big Abu Dhabi venues (incl. F1 after-race concerts); DJs at Dubai clubs, next 90 days only; film/TV composer concerts (Zimmer, Djawadi, Göransson, Williams…, Candlelight tributes count); the F1 weekend. Sources: Ticketmaster UAE (automatic) + `worker/gig-picks.json` (curated, refreshed weekly by a Claude routine). Cards show a category tag, date ranges for multi-night runs, a high-quality photo on every card (≥ 600 px short side; Ticketmaster 1136×639, Deezer 1000×1000, official artwork; `imageOverrides` for logos and cropped posters; Wikimedia photos credited on the card via `imageCredits`), ticket link | Live 2026-10-02 — production `/api/gigs` returns 65 events (25 comedy, 29 DJ, 6 concert, 4 film score, 1 big event); page checked at 1920×969, 1280×720 and 390×844 with no errors. Supersedes the 2026-09-30 top-artists version |

## Parwani-DOS redesign

Full spec and interactive reference: `design_handoff_parwani_dos/` (`README.md`, `PROMPT.md`, `DOC_UPDATES.md`). Rulebook §3 updated 2026-10-07 to approve it. One push per phase; Milind reviews the live result before the next phase starts.

| ID | Item | Status |
|---|---|---|
| R-DOS-1 | Theme tokens (Mono / Paper / Night) + top bar + theme switcher (persisted) | Live 2026-10-07 |
| R-DOS-2 | Scroll-snap shell, CRT transition, 1–7 / Esc keys, reduced-motion fallback | Live 2026-10-07 |
| R-DOS-3 | Home tiles, extras, headline auto-fit | Live 2026-10-07 — tile/extras icons are reserved empty space pending R-DOS-9 (Phase 8). Fixed 2026-10-07 with Phase 3: steps/heart numbers overflowed their windows, the weather window had collapsed to 0 px, and the headline now fits per spec (72→14 px against the whole panel, summary 0.36×, summary dropped only if even 14 px overflows) |
| R-DOS-4 | Journal list/detail with scroll-to-top on switch | Live 2026-10-07 — article bodies show the summary plus an "in progress" note until the posts are written (no placeholder text) |
| R-DOS-5 | Projects grid + overlay windows + scroll lock | Live 2026-10-07 — six cards + Champion Run cartridge; each opens a window over the page (Esc / ✕ / scrim close, focus kept inside, page locked). Crack and Sounds Like run inside their window (iframe); the other four say they are planned |
| R-DOS-6 | Victory Road (renamed from Champion Run 2026-10-07): full Gen I–IX team builder, sprites/reordering/modifiers, and an in-browser battle against the 2026 VGC Masters champion | In progress — Phases 0–4 done 2026-10-07: setup (full 1,127-entry pool with sprites, reorder, hidden random team, nine modifiers) and a playable doubles battle vs the champion's official team (Showdown sim in a worker, public-info AI, bag, five modifiers wired); champion data verified and AI tuned (Phase 3); all nine modifiers working (Phase 4); phases 5–6 next. Record: [`victory-road-build.md`](victory-road-build.md). Entry points still "Coming soon"; `?vr` opens it for testing |
| R-DOS-7 | Toolbox sliding panel | Live 2026-10-07 — every working tool runs in the panel with its existing logic (the panel borrows the legacy tool modal); unbuilt tools say "Still being built" |
| R-DOS-8 | Media / Playlists / Gigs restyle | Live 2026-10-07 — windows with pink / green / yellow bars, same carousels. Filter chips added 2026-10-07: Media All / Films / Games (`kind`), Gigs Both / Dubai / Abu Dhabi (from the venue line). The playlists now-playing strip was dropped at Milind's request |
| R-DOS-9 | Pixel icon sprites (Poké Ball, safe, terminal, bulb, skyline, globe, EQ, book, whiteboard, toolbox, projector, Spotify mark, guitar fire) | Live 2026-10-07 — `public/pdos-icons.js`, ported from the mockup; animate on hover and keyboard focus; still with reduced motion |
| R-DOS-10 | Accessibility and Lighthouse pass for all three themes | Live 2026-10-07 — WCAG AA text contrast checked per theme (Paper got darker status/dim text tokens), dialogs and tabs have ARIA, focus trap in windows. Production Lighthouse (mobile): performance 90–91, accessibility 100, best practices 100 |

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
| PR-07 | Victory Road | Build a six-Pokémon Gen I–IX team, configure challenge modifiers, then play a classic-pixel browser battle against 2026 VGC Masters champion Takuma Yamazaki; complete master spec in [`victory-road-master-prompt.md`](victory-road-master-prompt.md) | Phase 0 must select/licence sprites and battle simulator architecture before dependencies or assets are added | Next | In progress — Phases 0–4 done 2026-10-07 (playable), hidden until complete |

## Toolbox

The visible Toolbox shows all nine tools. Image Converter, Tempo Tap, Key/BPM Lookup, QR Code Generator, Audio Trimmer and Password Generator open their overlays; Sample Finder, PDF Editor and Signature Creator are shown as "Still being built" (disabled) per Milind on 2026-09-30 — their modal code remains in the hidden legacy shell. TB-09 and TB-10 remain future ideas and require a security review before any backend work.

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
