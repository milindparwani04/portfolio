# PARWANI — Session Handoff

> **Living document.** Update this file as part of every push that changes the project — not just at a session's end. The next device to pull needs this current to pick up where you left off. (Unlike [`docs/agent-rulebook.md`](agent-rulebook.md), which is static.)

## How to use this doc

This is the opening document for every new agent session. Read it top to bottom before touching code, then read your own agent handoff (below), the [Rulebook](agent-rulebook.md), [Security Handoff](security-handoff.md) and [Requirements Tracker](requirements-tracker.md). This file holds the **overall project scope and shared state**; each agent's detailed working notes live in its own handoff. At the end of each session, add a short project-level entry to the Session Log (newest on top) and update Current Build State and Priorities if they changed. Keep entries factual: what changed in the project, what was verified, what is broken, what is next.

## Agents and handoff docs

Milind runs two agents in parallel and assigns each its own work:

| Agent | Own handoff | Use it for |
|---|---|---|
| Claude (Claude Code) | [`claude-agent-handoff.md`](claude-agent-handoff.md) | Claude's assignment, implementation notes, test runs, follow-ups |
| Codex | [`codex-agent-handoff.md`](codex-agent-handoff.md) | Codex's assignment, notes and follow-ups |

Shared rules:

- Each agent works only on what Milind assigns to it. Shared priorities below are the project backlog, not a task list either agent can pick from unprompted.
- Each agent writes only its own handoff. This file is shared: record project-wide changes here (build state, priorities, architecture, conventions, anything the other agent must know), with detail in your own handoff.
- Before editing, check `git status` for the other agent's uncommitted work and preserve it. Coordinate before changing an area the other agent is working in: each handoff's "Current assignment" lists its areas.
- Pushing any branch currently deploys to production (see Priorities #1). Push only when Milind has asked for it, and include the doc updates in the same push.

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

Back end: one Cloudflare Worker (`worker/index.js`) acting as an API proxy so no third-party key ever reaches the browser. Storage is one KV namespace, `GIG_KV`, holding OAuth state tokens (10-minute TTL, prefixes `oauth_state:` for Spotify and `health_oauth_state:` for Google), the owner refresh tokens (`spotify_refresh_token`, `health_refresh_token`, `psn_refresh_token` plus a cached `psn_access_token` with a ~1 h TTL, `psn_refresh_expires_at` and daily `psn_reminder_sent:<date>` flags for the reconnect reminder, `reminder_sent:<id>:<date>` flags for the daily reminders) and the Gig Finder's lookup caches (`gig_tags:v1:*` Last.fm artist tags and `gig_image:v1:*` artist photos, 30 days; old `gig_artist:v2:*` entries expire on their own), plus one D1 database, `portfolio-plays` (binding `PLAYS_DB`, schema in `migrations/`), holding the Spotify play log. A Cron Trigger (`*/30 * * * *`) runs `scheduled()`, which copies the latest 50 plays from Spotify recently-played into `PLAYS_DB` and, since 2026-10-04, runs `checkPsnExpiry`: from 2 days before the PSN refresh token expires it pushes a "Reconnect PlayStation" notification to Milind's phone through ntfy.sh, once per Dubai day between 09:00 and 21:00. Since 2026-10-05 it also runs `sendDailyReminders`, which pushes each active entry in `worker/reminders.json` (Milind's general reminders, each with `from`/`until` dates) to the `REMINDERS_TOPIC` topic once per Dubai day from 12:00. Deploy timestamp comes from the `CF_VERSION_METADATA` binding.

Secrets (set with `wrangler secret bulk` from a temp file — piping into `secret put` from PowerShell 5.1 corrupted a value — never in code): `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_AUTH_KEY`, `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `HEALTH_AUTH_KEY`, `FREESOUND_API_KEY`, `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, `PSN_AUTH_KEY`, `STEAM_API_KEY`, `STEAM_ID` (the SteamID64; not secret, kept with the key for convenience), `NTFY_TOPIC` (private ntfy.sh topic Milind's phone subscribes to), `REMINDERS_TOPIC` (ntfy topic for the daily reminders, `shawshankreminder`, chosen by Milind). If a secret is missing the route returns 503 "Lookup is not configured" rather than crashing.

| Route | Purpose | Upstream | Edge cache |
|---|---|---|---|
| `/api/news` | Headline ticker | BBC World RSS | 5 min |
| `/api/last-updated` | "Last deployed" stamp, now read only by the hidden legacy shell (the dashboard card was replaced by the Game card on 2026-10-04) | Version metadata | 5 min |
| `/api/bpm-lookup` | Key/BPM Lookup tool (Camelot keys) | Spotify search + ReccoBeats | 1 hr |
| `/api/audio-features` | Sounds Like project | Spotify + ReccoBeats | 1 hr |
| `/api/sample-search` | Sample Finder tool | Freesound | 1 hr |
| `/api/spotify/authorize` | Owner-only OAuth start (key-gated) | Spotify | none |
| `/api/spotify/callback` | OAuth callback, stores refresh token | Spotify | none |
| `/api/media` | Media tracker: Dubai films (EN/JA/KO) from 7 days ago to 3 months ahead plus notable games. Reel Cinemas public Vista JSON (`Films.json` releases and languages; `Sessions.json` Dubai Mall screening days for re-releases) + Cinema Akil `/api/films` + curated `worker/media-picks.json` (games; VOX/ROXY screenings, since both block automated requests). Optional `TMDB_API_KEY` secret upgrades Reel's 300×450 posters. Returns `[{ kind, title, date, endDate?, rerelease?, location?, language?, platforms?, image }]` | Reel (Google Cloud Storage), Cinema Akil, TMDB (optional) | 3 h (fixed key `media-v2`; 5 min if a source failed) |
| `/api/gigs` | Dubai / Abu Dhabi events in Milind's categories (comedy, Dubai Opera musicals, English-language concerts at Coca-Cola Arena / Ushuaïa / big Abu Dhabi venues, Dubai DJs within 90 days, film-score concerts, F1): Ticketmaster UAE events classified in the Worker, merged with the curated `worker/gig-picks.json`. Returns `{ artist, category, venue, date, endDate?, image, url }` | Ticketmaster, Last.fm (language tags) | 1 hr (fixed key `gigs-v3`; 5 min while lookups are pending or Ticketmaster is down) |
| `/api/health/authorize` | Owner-only Google Health OAuth start (`HEALTH_AUTH_KEY`, constant-time compare) | Google | none |
| `/api/health/callback` | OAuth callback, stores `health_refresh_token` in `GIG_KV` | Google | none |
| `/api/heart-rate` | Dashboard Health card: latest Fitbit reading `{ bpm, sampledAt, motion }` from the last 24 h | Google Health API v4 | 30 s |
| `/api/psn/authorize` | Owner-only PSN connect: GET shows a form, POST takes `PSN_AUTH_KEY` and an NPSSO in the body (constant-time compare), stores `psn_refresh_token` | Sony account (`ca.account.sony.com`) | none |
| `/api/game` | Dashboard Game card: `{ source, isPlaying, title, image, imageFallback, platform, hoursPlayed, lastPlayedAt }`. Whichever of PlayStation and Steam is running a game, else whichever was played most recently. One source failing (e.g. the PSN token lapsing) still serves the other; 502 only if both fail. Online status alone is never exposed | PSN private mobile-app API (unofficial); Steam Web API (`GetPlayerSummaries`, `GetOwnedGames`) | 60 s |
| `/api/now-playing` | Dashboard Spotify card: current track, else last played | Spotify (owner token) | 20 s |
| `/api/playlists` | The three playlist cards (pop, Camon, idk — IDs in `PLAYLIST_IDS`) with track counts | Spotify (owner token; app token fallback — Spotify only returns track counts to the owner since Feb 2026) | 6 hr |
| `/api/listening` | Top 5 tracks + artists for the Dubai calendar month, with play counts from `PLAYS_DB`; artists show the album cover from their latest play; falls back to Spotify `short_term` (no counts, `source: "short_term"`) while the month has < 5 distinct tracks | D1, Spotify (owner token) | 10 min |
| `/privacy` | Static privacy page (`public/privacy.html`), required by Google's OAuth consent screen | — | default |
| `/audio/*` | Legacy Range handler; no MP3 assets are tracked or exposed by the current UI | Static assets | default |

## Design system (locked — do not change unless Milind raises it)

- Aesthetic: retro terminal / command-prompt soul fused with Apple-grade minimalism.
- Palette: predominantly monochrome, with restrained colour reserved for real Spotify covers, gig artist photos, the weather icon, and the Spotify label. Everything else is text-only.
- Surfaces ("grey box", 2026-10-01): filled grey panels (`--v2-panel` #151515; the About card uses `--v2-panel-raised` #202020) on #070707, no outlines. Hairline rules (`--v2-soft-line`, 20% white) for the nav underline, card footers and table rows. Card actions are a hairline footer with status left and action right, not outlined buttons. Reference mockups: the six "Soft Monolith" screenshots Milind supplied on 2026-10-01.
- Type: IBM Plex Mono for system UI, IBM Plex Sans for body, Anton for display headlines.
- Structure: rock-poster / cold-war redacted document language with "REF. 0X" numbered section labels.
- Navigation: every main section gets an equal, full-viewport chapter divider. No section looks subordinate.

## Goals and current priorities

Long-term goal: a portfolio that feels like an enterprise-quality product — fast, secure, accessible and fully working — while showing personality through music, finance and games.

Priorities, in order:

1. Close the open security findings (see [Security Handoff](security-handoff.md) §4) before shipping new public endpoints. Most urgent operational item: confirm Workers Builds' non-production branch command is `npx wrangler versions upload` — until then every branch push deploys to production.
2. **In progress:** the Parwani-DOS redesign (design handoff in `design_handoff_parwani_dos/`, full spec in its `README.md`). Nine phases, one push per phase with Milind reviewing the live result before the next starts (see the Claude handoff's current assignment and work log). Phase 1 (theme tokens, top bar, CRT section transition, keyboard, reduced-motion) shipped 2026-10-07.
3. Finish API-integrated projects: Sounds Like, then Where Next (with Liveliness Index).
4. Activate remaining Toolbox placeholders, client-side tools first (no new backend risk).
5. Parked: real-time multiplayer "swipe to decide where to go out" — needs WebSockets/Durable Objects or Supabase, a places API and match logic. Do not start until 1–4 are done.

## Current build state

**Parwani-DOS redesign, Phase 1 of 9 (2026-10-07, see the Claude handoff for the full work log):** the top bar is now "■ Parwani-DOS" + a Mono/Paper/Night theme switcher (persisted in `localStorage`, Night default) on the left, a typed `C:\PARWANI> cd <section>` command line centre, and a `0N / 07 · Section` counter + clock on the right. Switching sections (desktop/tablet paging mode only) now plays a CRT power-on transition — a thin glowing line opens to full height in pixel steps, then the content slides up — driven by an `IntersectionObserver` (`initShell()` in `public/ui-v2.js`, replacing the old `initSectionPager` spring). Keys 1–7 jump straight to a section; Esc closes the theme menu. The whole v2 UI's font is now Pixelify Sans with a custom PixC override for C/c (`public/assets/fonts/PixC-*.otf`), loaded via new CSS theme tokens (`--bg`, `--fg`, `--p0`–`--p3`, `--ok`, `--warn`, `--on`) scoped to `.portfolio-v2[data-theme]`; "Mono" reproduces the previously-locked greyscale palette exactly, so every existing `--v2-*`-driven component recolours for free when the theme changes. Phones/short windows are unaffected (the CRT wrappers are inert there, same continuous scroll as before). Content inside each section (Home tiles, Journal, Projects, Toolbox, Media, Playlists, Gigs, the pixel icons, window overlays, Champion Run) is still the pre-redesign markup — those land in Phases 2–8.

Shell: opens directly onto a clean `C:\PARWANI>` navigation bar and the `MY DIGITAL PORTFOLIO.` dashboard. The former ENTER/CRT boot gate, floating navigation and bottom status bar are no longer visible.

Home dashboard: one CSS grid with named areas (`.v2-dashboard` in `public/ui-v2.css`), so cards cannot overlap. Headline card (text only, fitted on each rotation from `/api/news`); grey "About this space" card; heart rate from `/api/heart-rate`; Dubai weather from Open-Meteo (humidity/wind line hides when the card is short; temperature scales to the card); Spotify card with the cover centred, track and artist beneath and "Now playing / Last played" bottom-left from `/api/now-playing` (grey square until a cover loads); Steps card (`05 [ STEPS / TODAY ]`, since 2026-10-02, oversized-count design): small `DAILY STEPS` label, today's total from `/api/steps` very large with `/10,000` on its baseline, a full-width progress line and the percent-of-goal line; no age footer. It all turns green at 10,000. The Dubai date sits at the foot of About this space; bottom row with dissertation, current focus (Sounds Like) and the Game card (08 `[ Game ]`, since 2026-10-04: art the card's full height on the left — square for PlayStation, a 2:3 cover for Steam, falling back to Steam's header cropped square — then the title and `Playing now / PS5|Steam` or `Last played / 17h ago / PS5|Steam`, from `/api/game`; on phones it gets its own full-width row). Heart rate, steps, now-playing and the Game card refresh every 30 s without a reload. Every API-backed card keeps its layout when data is unavailable. Card titles marked `data-fit` (`fitText` in `ui-v2.js`) shrink to fit their box instead of being cut off: one-line titles shrink down to 55%; the Spotify track name shrinks up to 30% on two lines, then may take a third line; playlist and gig titles wrap onto two lines.

Home Steps direction (Codex approved mockup, **implemented by Claude 2026-10-02** with two changes from Milind: no centred `DAILY STEPS` heading, and a "Latest reading / age" foot like Heart Rate. Live with real data since 2026-10-02.) Original mockup record: preserve the live Heart Rate card exactly and replace the entire Time / Location card with a dedicated `05 [ STEPS / TODAY ]` card; remove every city clock and time-zone label. The Steps card shows centered `DAILY STEPS` and a dynamic `[current]/10,000` value. Before goal completion, `2,500/10,000`, `25% OF DAILY GOAL` and a 25%-filled hairline use the current restrained white/gray/accent treatment. At 10,000, the exact value becomes green, the metadata changes to `DAILY GOAL REACHED`, and the hairline fills green. Move `FRI, 02 OCT 2026` to the bottom of About This Space. Keep all existing card dimensions and grid positions; no clipping or overlap is acceptable. The live step-count source and refresh path have not yet been specified or verified. See [`codex-agent-handoff.md`](codex-agent-handoff.md) for the detailed mockup record.

Selected Steps visual refinement (**approved 2026-10-02; implemented by Claude the same day**, see the Claude handoff): keep the existing live card shell and data behavior, but replace its sparse internal composition with Codex's oversized-metric variant. Keep `05` top-left and `[ STEPS / TODAY ]` top-right; add a small upper-left `DAILY STEPS`; render the current count (for example `2,500`) extremely large across the card with a smaller `/10,000` on the same baseline; place a nearly full-width proportional hairline immediately below; and put `25% OF DAILY GOAL` beneath it. Remove the current `LATEST READING / age` footer so the metric and progress treatment use the full card. At 10,000, retain the green completed state and fully filled green progress line. Do not change the card's outer dimensions or grid position, and verify no clipping or overlap. The alternate centered, split-percentage and ledger mockups are rejected/superseded.

Section paging: on desktop/tablet (≥721 px wide and ≥620 px tall) every section is exactly one viewport under the fixed top bar. **Since Phase 1 (2026-10-07) this is native CSS scroll-snap** (`html{scroll-snap-type:y mandatory}`, `scroll-margin`/`scroll-snap-align` on each section) plus the site-wide `scroll-behavior:smooth`, not a custom spring — wheel, touch, scrollbar and in-page anchor links (scroll cues, Back to top) all move the browser handles directly, and `initShell()` just toggles each section's `.is-active` class (via `IntersectionObserver`, 0.55 threshold) to drive the CRT transition and keep the top bar's command line/counter/URL hash in sync. The old multi-section fade-through-neighbours trick is gone; the CRT power-on/off now plays that role instead. Keys 1–7 jump straight to a section (`scrollIntoView`); reduced-motion users get an instant cut with no clip/slide/line animation. Each section still has a "↑ previous" cue top-right and a "SCROLL / X NEXT ↓" cue at the bottom. Content scales with viewport height so nothing clips down to ~1100×620; a short-viewport tier (≤760 px tall) tightens spacing. Grids stay three columns down to 721 px so locked sections still fit. Phones (≤720 px wide) and short windows scroll continuously with no paging and no CRT effect, and small print is at least 12 px.

Section order since 2026-10-02: Journal 01, Projects 02, Toolbox 03, **Media 04** (new), Playlists 05, Gig Finder 06; the nav has six links.

Sections: Journal (REF. 01, writing and reviews: three cards, each with a photo on top, then title and copy, then status, with the rows lined up across cards; see below), Projects (REF. 02, text-only 3×2 cards plus one full-width card, each ending in a status / action footer), Toolbox (REF. 03, text-only 3×3 grid of all nine tools; Sample Finder, PDF Editor and Signature Creator show a disabled "Still being built"), Playlists (REF. 04, three playlist cards with real Spotify covers and track counts, plus "Top this month" — name / artist / bar / plays with a Tracks / Artists toggle), and Gig Finder (REF. 05, Dubai and Abu Dhabi events with a category tag, artist photo where available and ticket link; Ticketmaster plus a curated list refreshed every Monday by a Claude cloud routine; 10-second countdown, hover/focus pause; an honest empty state replaces the old invented fallback list; footer with © / Back to top / LinkedIn / Spotify). The placeholder photography in `public/assets/ui/` has been removed. A privacy page lives at `/privacy`. The local music player is no longer exposed. The modal code for the three unfinished tools remains in the hidden legacy shell.

Journal redesign (Codex's approved mockup, **implemented by Claude 2026-10-02**; see the Claude handoff for markup and CSS notes): Journal encompasses both writing and media reviews in a three-card desktop grid, with imagery at the top of each card and copy/metadata below. Article topics appear only in the card header. Reviews use a distinct many-point circular score badge: red for 1–5, yellow for 6–7, green for 8–9 and purple for 10, with a white number; game reviews also list the platform played. Entry actions are conditional: unfinished entries show only their bottom-anchored status and no `READ MORE` placeholder; an entry marked `COMPLETED` additionally reveals a borderless, underlined `READ MORE ›` link. All current mockup entries are unfinished — Karoshi `RESEARCHING`, The Attention Economy `PLANNED`, and The Shawshank Redemption review `WRITING` — so none should currently expose `READ MORE`. See [`codex-agent-handoff.md`](codex-agent-handoff.md) for the detailed design record.

Backend endpoints live: news, last-updated, BPM/key lookup, audio features, sample search, gigs, media, Spotify owner OAuth, now-playing, playlists, listening, Google Health owner OAuth, heart-rate, steps, PSN owner auth, game (PlayStation + Steam), plus the 30-minute play-log cron.

External accounts connected (owner-only): Spotify (re-authorize at `/api/spotify/authorize?key=<SPOTIFY_AUTH_KEY>` if scopes change) and Google Health (Google Cloud project `golden-monolith-255513`, OAuth app **In production, unverified**, single scope `googlehealth.health_metrics_and_measurements.readonly`; re-authorize at `/api/health/authorize?key=<HEALTH_AUTH_KEY>`). PlayStation (since 2026-10-04): no OAuth app exists, so `/api/psn/authorize` takes an NPSSO token (sign in at playstation.com, then open https://ca.account.sony.com/api/v1/ssocookie) plus `PSN_AUTH_KEY`; **the refresh token lasts only 10 days**, so the form has to be re-submitted with a fresh NPSSO about every 10 days (Milind chose this over storing the NPSSO itself). While it is lapsed the Game card still shows Steam. Steam (since 2026-10-04): official Web API key from https://steamcommunity.com/dev/apikey (`STEAM_API_KEY`) plus `STEAM_ID`; the Steam profile and its Game details must be public. All three owner keys are stored only as Worker secrets — if lost, generate a new random value and store it with `wrangler secret bulk <file.json>` (then delete the file) rather than trying to read them back; secrets are write-only.

Settled removals (do not re-propose without flagging): YouTube to MP3/MP4/WAV converters (ToS and backend complexity), Seamless Set project, standalone Liveliness Index (merged into Where Next), public location card (built and dropped 2026-10-04: Milind judged showing his whereabouts not responsible).

## Session log (newest first)

### 2026-10-07 — Parwani-DOS redesign, Phase 1: themes, top bar, CRT transition
Agent: Claude · Model: Sonnet 5
Phase: 1 of 9
Done:
- Milind approved the Parwani-DOS redesign (`design_handoff_parwani_dos/`, copied into the repo) and its rulebook §3 change; updated `docs/agent-rulebook.md` to the new design-lock wording.
- Phase 1 per the handoff's suggested plan: three colour themes (Mono/Paper/Night, token table scoped to `.portfolio-v2[data-theme]`, aliased onto the existing `--v2-*` tokens so every current component recolours with no changes of its own), the new top bar (brand, theme switcher with persistence, typed command line, section counter, clock), the CRT power-on/off section transition (native scroll-snap + `IntersectionObserver`, replacing the old spring-based `initSectionPager`), keys 1–7 and Esc, and the Pixelify Sans + PixC font swap. Section *content* (tiles, icons, windows) is unchanged — later phases.
Tested (how, result):
- No Node.js or browser automation tool was available this session, so `wrangler dev` / headless-browser testing (the approach used in prior sessions) wasn't possible. Verified instead: `python3 -m http.server` to serve `public/` statically and confirm it loads; an HTML parser pass over `index.html` (0 unclosed/mismatched tags); a brace/paren balance check on `ui-v2.css`; a JavaScriptCore (`osascript -l JavaScript`) syntax check on `ui-v2.js`; cross-reference checks (every `byId()` target exists in the HTML, `data-sec` order matches the JS `SECS` array, every `pdos-*` class used in JS has a CSS rule, theme values match across CSS/HTML/JS); and a from-scratch DOM-mock harness that spliced the real `initShell()` function in verbatim and exercised it under JavaScriptCore — 24/24 assertions passed (section activation/labelling, typed command text, URL-hash sync, theme switch + persistence + ARIA state, 1–7 keyboard jump, input-field guard, Escape).
Known issues / not done:
- **Not visually verified in an actual browser** — no Node.js and no browser-automation tool were available in this session. The CRT clip-path/transform timing, theme-switch recolouring, and responsive behaviour at specific breakpoints should be checked live on milindparwani.com after this deploys.
- Phases 2–9 (Home tiles/icons, Journal, Projects + overlay windows, Champion Run, Toolbox panel, Media/Playlists/Gigs restyle, pixel icon sprites, accessibility pass) not started.
Next session starts with:
- Confirm Phase 1 looks right in production (theme switcher, CRT transition, keyboard 1–7, phone fallback), then start Phase 2 (Home: tiles, extras, headline auto-fit) per `design_handoff_parwani_dos/README.md`.

Copy this template for each session:

```
### YYYY-MM-DD — <session goal>
Agent: <Claude / Codex> · Model: <model>
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

### 2026-10-05 — General daily reminders through ntfy
Agent: Claude · Model: Opus 5.5
Done:
- Milind wants a general daily reminder channel on his phone. A cloud routine couldn't reach ntfy.sh (the routine sandbox's egress proxy returned 403 even after he allowed the domain), so reminders now run in the Worker cron, which already reaches ntfy for the PSN reminder.
- `worker/reminders.json` lists reminders (`id`, `title`, `message`, `tags`, `click`, `from`, `until`). `sendDailyReminders` pushes each active one to `REMINDERS_TOPIC` (Milind's own `shawshankreminder` topic, separate from the PSN one) once per Dubai day from 12:00 (stops at 21:00), keyed by `reminder_sent:<id>:<date>` in KV. Expired entries do nothing and can be pruned later.
- First entry: check Reel/VOX for The Shawshank Redemption tickets for 15 Oct, daily 2026-10-05 to 2026-10-15.
Tested (how, result):
- `sendDailyReminders` against mocked KV/ntfy over a simulated timeline: nothing before `from` or before 12:00, one push at 12:00, no repeat the same day, none at 21:00, one on the next day and on the `until` day, none after it, none without the secret.
Next session starts with:
- To add a reminder, append to `worker/reminders.json` and push. If one doesn't arrive, check `npx wrangler tail` for "daily reminder failed".

### 2026-10-04 — PlayStation reconnect reminder on Milind's phone
Agent: Claude · Model: Opus 5.5
Done:
- Milind asked for a text reminder; there's no SMS without a paid Twilio account, so he chose ntfy push notifications. The 30-minute cron now checks `psn_refresh_expires_at` and, from 2 days before expiry, pushes once a day (09:00–21:00 Dubai) to the `NTFY_TOPIC` secret's topic, with a tap-through to `/api/psn/authorize`. Reconnecting moves the expiry and stops the reminders.
- The expiry is recorded only when the refresh token is new, because a refresh returns the same token with a full lifetime. Seeded for the current token as 2026-10-14T10:20Z.
Tested (how, result):
- Cron against mocked KV/ntfy over a simulated timeline: silent until 2 days before, one push per Dubai day, none at night, "has expired" after expiry, none without the secret, silent again after a reconnect; a same-token refresh doesn't move the expiry.
- Live: a test push to the production topic reached Milind's phone (ntfy 200, confirmed by Milind).
Next session starts with:
- If Milind says the reminder never arrived, check `npx wrangler tail` for "PSN reminder failed".

### 2026-10-04 — Game card: PlayStation or Steam
Agent: Claude · Model: Opus 5.5
Done:
- Card 08 renamed `[ Game ]`. `/api/game` replaces `/api/playstation`: it shows whichever of PlayStation and Steam is running a game (Milind never runs both at once), else whichever was played most recently.
- Steam via the official Web API: `GetPlayerSummaries` (`gameid`, `gameextrainfo`) and `GetOwnedGames` (`rtime_last_played`, `playtime_forever`). Art: `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg` (2:3), `header.jpg` as fallback.
Tested (how, result):
- Worker handler against mocked PSN and Steam: Steam playing beats PSN idle, PSN playing beats Steam idle, idle picks the newer last-played, either source down still serves the other, both down 502, none configured or bad STEAM_ID 503.
- Layout via iframes at 1920×1080, 1440×900, 1280×720, 1100×620 and 390×844 with Steam cover, long title, missing cover (fell back to header) and PSN: art inside, no overlap with the index row, title baseline level with the neighbouring cards. Fixed: at 1100×620 a short title pushed the text up into the index row; `align-self: safe end` now lets it overflow downward like the neighbours.
Known issues / not done:
- Steam connected the same day: key valid, profile public, 121 games visible (latest: Call of Duty: Black Ops III, 2026-09-13). PlayStation was played more recently, so the card shows it; production logs show no Steam errors. Not yet seen: the card switching to Steam during a live session.
Next session starts with:
- When Milind next plays on Steam, check `/api/game` shows `source: "steam"` and the portrait cover.

### 2026-10-04 — PlayStation card replaces Site Updated
Agent: Claude · Model: Opus 5.5
Done:
- Card 08 is now PlayStation: box art, game title, and `Playing now` or `Last played / age` with the platform, from the new `/api/playstation`. Owner connects at `/api/psn/authorize` (form; key and NPSSO in the POST body). New secret `PSN_AUTH_KEY`.
- Uses Sony's private PSN mobile-app endpoints (no public API exists): `basicPresences` and `gamelist/v2` with account `me`. Box art from `image.api.playstation.com`, resized with `?w=440`.
Tested (how, result):
- Live probe against Milind's account: NPSSO → code → tokens, refresh, presence and game list all 200. Refresh token lifetime is 863,999 s (10 days) and a refresh returns the same token.
- Worker handlers against mocked Sony responses: wrong key 403, bad NPSSO 400, other methods 405, success stores tokens, idle/playing shapes, access token reused from KV, Sony down 502 generic, no secret 503.
- Layout in Chrome at 1920×1080, 1440×900, 1280×720, 1100×620 and 390×844: art inside the card, title on one line, nothing clipped.
Known issues / not done:
- Re-connect about every 10 days (first connect 2026-10-04, so next by ~2026-10-14). The endpoints are unofficial and may change.
- Production check after connecting: `/api/playstation` 200 with the real game, and the card shows box art, title and `Last played / 22m ago / PS5`.
Next session starts with:
- If the card shows `PS5 / Offline`, re-submit `/api/psn/authorize` with a fresh NPSSO.

### 2026-10-04 — Location card built, then dropped
Agent: Claude · Model: Opus 5.5
Done:
- Built and deployed a Location card (`fb2fabb`) that replaced Site Updated: iPhone Shortcuts automations posted a coarse label (home, work, a friend's house, a mall or restaurant name, in transit) to a key-gated `/api/location`, shown 30 minutes late.
- Milind dropped it the same day before any automation was set up ("don't think it is responsible"). Reverted the commit: card 08 is Site Updated from `/api/last-updated` again, and `/api/location` is gone. The `LOCATION_KEY` secret was deleted, and no location data was ever stored in production.
Tested (how, result):
- After the revert deployed: production home page shows `[ Site Updated ]`, and `/api/location` no longer answers as an API route.
Known issues / not done:
- None.
Next session starts with:
- Settled removal: a public location card. Don't re-propose it without flagging this decision.

### 2026-10-02 — Oversized Steps card built
Agent: Claude · Model: Opus 5.5
Done:
- Restyled card 05 to Codex's selected design: small `DAILY STEPS` label, huge count with `/10,000` on its baseline, full-width progress line, `25% OF DAILY GOAL` below. The age footer was removed, as the design asks.
Tested (how, result):
- Local mocked data at 2,587 and 10,000 across six viewport sizes (desktop to phone): nothing clips or overlaps, and the green completed state works.
Known issues / not done:
- None.
Next session starts with:
- Nothing pending on the Steps card.

### 2026-10-02 — Oversized Steps-card refinement selected
Agent: Codex · Model: GPT-5
Phase: Design handoff only
Done:
- Milind selected Codex's oversized current-count variant for the already-live Steps card: small `DAILY STEPS`, dominant current value, smaller `/10,000`, full-width proportional hairline and percentage metadata below.
- The selected refinement removes the live card's `LATEST READING / age` footer and uses that space for the larger metric/progress composition while preserving the existing card shell and goal-state behavior.
- Recorded that the other generated card-only variants are superseded and that Milind will continue implementation with the other agent.
Tested (how, result):
- Visually reviewed the isolated card mockup against a crop of the live Steps card; the selected composition uses substantially more of the available card area while retaining the site's existing type, palette and terminal/editorial treatment.
Known issues / not done:
- Not implemented by Codex. No site files, API, assets, commit, push or deployment changed in this selection pass.
Next session starts with:
- Other agent: restyle only the existing live Steps card to the selected oversized-metric composition and verify both unfinished/completed states without clipping or overlap.

### 2026-10-02 — Home Steps card built
Agent: Claude · Model: Opus 5.5
Done:
- Card 05 is now Steps: no city clocks, no "Daily Steps" heading. It shows today's total out of 10,000, the percent of goal, a hairline bar and a "Latest reading / 4m ago" foot like Heart Rate. It all turns green at 10,000. The date moved to the About card.
- New `/api/steps` (Google Health daily rollup for the Dubai day plus the newest sync time). The OAuth scope adds `googlehealth.activity_and_fitness.readonly`.
Tested (how, result):
- Local `wrangler dev` with mocked data: both goal states look as intended at desktop, 1280×640, 1366×700 and phone width, and nothing extends outside card 05.
Known issues / not done:
- Real step data needs Milind to re-run `/api/health/authorize?key=…` once and accept the new scope. Until then the card shows "Awaiting health data source".
Next session starts with:
- Done the same day: re-authorized with the new scope and fixed the rollup date format. Live with real totals; the Steps foot uses the newer of the step and heart-rate times, so both cards show the same age.

### 2026-10-02 — Home Steps card direction
Agent: Codex · Model: GPT-5
Phase: Mockup only
Done:
- Finalized two current-live-style Home screenshots in which card 05 is exclusively for Steps and the Heart Rate card remains unchanged.
- Approved the unfinished state (`2,500/10,000` in white with 25% metadata/hairline) and completed state (`10,000/10,000` plus `DAILY GOAL REACHED` and a green full hairline).
- Moved the date from the removed Time / Location content to the bottom of About This Space in both mockups.
Tested (how, result):
- Used a fresh screenshot of the production Home section as the visual source of truth; reviewed both generated states for the existing grid/style and for a fully contained card 05 with no overlap or clipping.
Known issues / not done:
- This direction is not implemented. No site code, API, assets, commit, push or deployment changed. The live source and refresh behavior for daily steps still need implementation planning.
Next session starts with:
- Implement only if Milind explicitly assigns it: preserve Heart Rate, replace Time / Location with Steps, move the date to About, and verify unfinished/completed states at supported viewport sizes.

### 2026-10-02 — Media: re-releases show their cinemas
Agent: Claude · Model: Opus 5.5
Done:
- Re-release cards now name the cinemas showing them, e.g. Avengers Endgame: Encore at Reel Dubai Mall / VOX BurJuman, Mall of the Emirates, Mercato / ROXY Dubai Hills. Shawshank reads "Reel Cinemas · venue TBC" until Reel assigns a cinema. `worker/index.js`, `worker/media-picks.json`, `public/ui-v2.css` (`?v=21`).
Tested (how, result):
- Remote preview: every re-release has a location. Headless Edge at ten sizes: no clipping or overflow.

### 2026-10-02 — Media tracker (new section)
Agent: Claude · Model: Opus 5.5
Done:
- New **Media** section (REF. 04) between Toolbox and Playlists, using the Gig Finder's rail (the rail code is now shared). It lists films in Dubai cinemas (English, Japanese or Korean only) and notable games, for the next 3 months plus films released in the last week. New releases show once with their release date; re-releases and Cinema Akil screenings show their date range; Akil is the only venue named. Playlists became REF. 05 and Gig Finder REF. 06.
- New Worker route `/api/media` and file `worker/media-picks.json`; 25 game covers in `public/assets/media/games/`. A new weekly routine, "Media tracker weekly refresh" (`trig_014ZDNi4Uf1ecndu8k5oJ6as`, Mondays 06:30 Dubai), maintains the games and the VOX/ROXY extras.
- VOX and ROXY block automated requests (403 from Workers, hang or 403 from curl). Today's VOX and ROXY listings were checked by hand in Chrome: the only English/Japanese/Korean screenings Reel doesn't list were ROXY Dubai Hills' Korean Film Week (Dark Nuns, Revolver, No Other Choice).
Tested (how, result):
- Production checked after deploy (`e372902`): `/api/media` returns the same 80 items with no missing images; in Chrome, the Media nav link opens the section, posters and covers load, and there are no failed requests.
- Remote preview against live sources: 80 items (44 films, 8 re-releases, 3 Akil, 25 games); all 81 image URLs load; only English, Korean and Japanese films. Headless Edge at ten sizes: no overlaps, no page errors; PageDown paging reaches Media and the nav follows it; the gig rail still works; Enter works on the Media Next button.
Known issues / not done:
- Reel's posters are 300×450. Adding a free `TMDB_API_KEY` secret switches films to 780 px posters automatically.
- "Always Lalisa" (a K-pop concert film) is hidden via `excludeTitles` at Milind's request.

### 2026-10-02 — Chicago, photo credits, browser cache fix, Enter key
Agent: Claude · Model: Opus 5.5
Done:
- Gig Finder now includes musicals at Coca-Cola Arena (Chicago the Musical, 16–20 Dec). Wikimedia photos now show a small credit link, on Journal photos and on gig cards (`imageCredits` in `worker/gig-picks.json`).
- **Cloudflare zone setting changed:** Caching → Configuration → Browser Cache TTL changed from 4 hours to "Respect Existing Headers", so the Worker's own `Cache-Control` (for example 20 s for now-playing, 1 h for gigs) reaches browsers.
- Fixed: the hidden legacy boot gate swallowed the first Enter or Space press on the page (found by testing the gig Next button in real Chrome).
Tested (how, result):
- Remote preview: 66 events, Chicago as a musical with its credit. Headless Edge: credits fit at desktop and phone sizes. Production headers checked after the setting change. Details in [`claude-agent-handoff.md`](claude-agent-handoff.md).

### 2026-10-02 — Journal redesign implemented
Agent: Claude · Model: Opus 5.5
Done:
- Milind asked Claude to build Codex's approved Journal mockup (entry below). Changed: the Journal block in `public/index.html`, the Journal rules in `public/ui-v2.css` (`?v=17`), and three new photos in `public/assets/journal/`. All three entries are unfinished, so no `Read more` link is shown. Codex's mockup used AI concept images, so the cards use real Wikimedia Commons photos in the same mood (licences and credits are in the Claude handoff).
- Committed Codex's pending doc entries (this file and `codex-agent-handoff.md`) unchanged in the same push.
Tested (how, result):
- Headless Edge at ten sizes from 2560×1300 to 360×740: no overlaps or overflow, no page errors, photos the same height in every card, no description cut off. A temporary `Completed` state shows the `Read more ›` link inside the card.
Known issues / not done:
- Article pages behind `Read more` don't exist yet; the content format is still to decide (SC-01).

### 2026-10-02 — Journal writing/review card direction
Agent: Codex · Model: GPT-5
Phase: Mockup only
Done:
- Finalized the approved Journal mockup direction: a three-card grid for writing and media reviews, top-contained imagery, non-duplicated topic labels, and a distinct colour-coded jagged score badge for reviews.
- Defined conditional card actions: unfinished entries show status only; completed entries show `STATUS  COMPLETED` plus the borderless `READ MORE ›` link.
- Confirmed every current Journal entry is unfinished, so the intended present state contains no `READ MORE` links.
Tested (how, result):
- Iterated and visually reviewed generated desktop screenshots while preserving the strict full-viewport section layout. No repository implementation was changed.
Known issues / not done:
- The live Journal remains in its existing implementation. The approved redesign is documented but has not been coded, committed, pushed, or deployed.
Next session starts with:
- Implement only if Milind explicitly assigns the Journal build; initialize Karoshi as `RESEARCHING`, The Attention Economy as `PLANNED`, and The Shawshank Redemption review as `WRITING`, with no `READ MORE` links.

### 2026-10-02 — Gig Finder photos
Agent: Claude · Model: Opus 5.5
Done:
- Every gig card now has a high-quality photo. Ticketmaster images are picked at 1136×639 instead of the 305×225 thumbnail. Curated acts get a fixed `image` or a Deezer 1000×1000 fallback. A new `imageOverrides` map in `worker/gig-picks.json` swaps out logos and cropped posters. Only `worker/index.js` and `worker/gig-picks.json` changed. The weekly routine now adds photos for new events.
Tested (how, result):
- Remote preview: 65/65 cards have a photo, all loaded, smallest short side 639 px; all crops checked by eye. Details in [`claude-agent-handoff.md`](claude-agent-handoff.md).

### 2026-10-02 — Gig Finder: Dubai and Abu Dhabi only
Agent: Claude · Model: Opus 5.5
Done:
- Milind asked for the Gig Finder to show only Dubai/Abu Dhabi events in set categories: comedians, Dubai Opera musicals, English-language concerts at Coca-Cola Arena and Ushuaïa, big Abu Dhabi artists/DJs and the F1 weekend, Dubai club DJs within the next 3 months, and film/TV composer concerts. `/api/gigs` rewritten (`worker/index.js`): Ticketmaster UAE events + curated `worker/gig-picks.json`; the old Spotify top-artists / MusicBrainz logic is gone. Cards show a category tag and date ranges (`public/ui-v2.js`, `ui-v2.js?v=15`).
- Ticketmaster can't see Dubai Opera, Ushuaïa, Soho Garden or Live Nation ME (no public API on Platinumlist / venue sites), so those events are curated. A weekly Claude cloud routine, "Gig Finder weekly curated refresh" (`trig_01V5wXhtAzpJkHrW11is9yt2`, Mondays 06:00 Dubai), researches new events, edits only `worker/gig-picks.json` plus a log line in each handoff, and pushes to `main` (= production deploy).
- No new secrets, bindings or config. Security doc updated (generic gig error, new KV prefixes, routine).
Tested (how, result):
- Production after deploy (`c2aec6f`): `/api/gigs` returns 65 events; the page renders category tags at 1920×969, 1280×720 and 390×844 with no page errors.
- Remote preview with real secrets: 65 events, Tarkan/Bocelli/Turkish/Arabic/Filipino/K-pop acts filtered, Trevor Noah merged to 25–29 Nov; missing key → 503, bad key → curated list only. Headless Edge at ten sizes with and without data: no overlaps or spill, no page errors. Details in [`claude-agent-handoff.md`](claude-agent-handoff.md).
Known issues / not done:
- Chicago the Musical (Coca-Cola Arena, 16–20 Dec) is excluded because the rule is Dubai Opera musicals only.
- Concert language is judged from Last.fm tags, so an unusual artist could be misjudged; `excludeArtists` / `includeArtists` in the JSON override it.

### 2026-10-01 — Feed-style section scrolling
Agent: Claude
Done:
- Milind found section scrolling clunky and asked for TikTok/Instagram-smooth moves and seamless nav jumps. Replaced the fixed 0.9 s ease-in-out with a critically damped spring that starts moving on the first frame and retargets mid-move; trackpad swipes during momentum now count as new gestures; multi-section nav jumps fade instead of blurring through every section. Only `public/ui-v2.js`, `public/ui-v2.css` and the cache-bust numbers in `public/index.html` changed (`ui-v2.css?v=16`, `ui-v2.js?v=14`).
Tested (how, result):
- Headless Edge at 1920×969 and 1280×720, 1440×789 (reduced motion) and 390×844: 24/24 checks pass. Details in [`claude-agent-handoff.md`](claude-agent-handoff.md).
Known issues / not done:
- Feel on a real Mac trackpad and a real mouse wheel still needs Milind's check; gesture thresholds are tunable constants in `initSectionPager`.

### 2026-10-01 — Two-agent handoff docs
Agent: Claude
Done:
- Added the "Agents and handoff docs" section above and created [`claude-agent-handoff.md`](claude-agent-handoff.md). Claude's detailed notes moved there; this log keeps project-level entries. Codex's entries and handoff were committed unchanged.
Next session starts with:
- Each agent reads this file, then its own handoff, then waits for Milind's assignment.

### 2026-10-01 — Grey-box UI live (Soft Monolith implemented)
Agent: Claude
Done:
- The whole visible site now follows the Soft Monolith mockups Codex produced and Milind selected: filled grey panels without outlines, single-rule nav, hairline status/action footers, text-only Projects and Toolbox, a grey diagonal placeholder for the Journal image, real Spotify covers and gig artist photos only. **This supersedes the "mockup only / awaiting implementation" status in Codex's entries below.**
- Long titles shrink and wrap to fit their box (`fitText()`, `data-fit`) instead of being cut off; section paging uses an eased 0.9 s scroll; phones scroll continuously.
- Removed the invented Gig Finder fallback list and the placeholder photos in `public/assets/ui/`.
- No Worker, secret, config or security changes.
Tested (how, result):
- Automated overlap/clip/truncation checks on all six sections at ten viewport sizes from 2560×1300 to 360×740 with production data; failure states with every API down; keyboard paging; production re-checked after each deploy. Lighthouse mobile on production: 90 / 100 / 100 (was 68 / 100 / 100). Details in [`claude-agent-handoff.md`](claude-agent-handoff.md).
Known issues / not done:
- See Claude handoff → Open follow-ups.
Next session starts with:
- Unchanged priorities below.

### 2026-10-01 — Minimal UI direction exploration (mockups only)
Model: Codex
Phase: 1 of 2 — visual direction selected and refined
Done:
- Created eight interactive UI directions for Milind to compare without changing the website: Hairline Index, Editorial Columns, Quiet Bands, Offset Ledger, Terminal Type, Swiss Archive, Open Grid, and Soft Monolith.
- All directions preserve the existing home information hierarchy and section navigation while exploring fewer full containers, more bottom rules/open whitespace, a concise gray portfolio-introduction field in place of the home news image, and compact playlist artwork.
- Toolbox treatment is explicitly type-and-rule led; article and gig imagery remain valid editorial content.
- Milind selected Soft Monolith. The refined home mockup preserves the original oversized Anton title and all visible live-content labels/values from the supplied production screenshot, retains the gray “About this space” module, and makes Spotify an album-led lock-screen-style module with the track and artist beneath the cover.
- Expanded Soft Monolith into a navigable six-section mock site covering Home, Journal, Projects, Toolbox, Playlists, and Gigs. Home drops the “Interest-led / always evolving” footer, tightens Spotify around the cover/track metadata, and uses the recovered width for Dubai, London, and Sydney clocks with the date anchored at the bottom. Toolbox is text-only; playlist covers are compact; article and gig image areas remain.
- Refined the full-site mockup after review: the sticky nav no longer clips the home or section titles; the home title visually spans to the weather module's right edge; Spotify centers its cover, track, and artist while leaving `NOW PLAYING` left-aligned; Dubai, London, and Sydney now use equal-size time rows with larger adjacent zone labels and a larger bottom date.
- Completed the final static-review pass requested for handoff: every section fits within one 1280×720-style viewport with section-level scroll snapping and no intentional intra-section vertical scroll. On Home, the full `MY DIGITAL PORTFOLIO.` title is visible and its period aligns to the Weather module's right edge; Time / Location is a centered vertical sequence of three equal-size time → location/time-zone pairs with the date visible at the bottom.
- Exported six handoff screenshots outside the repository in the task visualization workspace: `soft-monolith-home.png`, `soft-monolith-journal.png`, `soft-monolith-projects.png`, `soft-monolith-toolbox.png`, `soft-monolith-playlists.png`, and `soft-monolith-gigs.png`.
Tested (how, result):
- Rendered the comparison gallery, refined home, and full Soft Monolith site locally. Confirmed navigation reaches all six sections, Home and Journal clear the sticky navigation without clipping, the image-free Toolbox layout renders correctly, responsive reflow is present, and browser logs contain no errors or warnings. Exported and visually inspected all six final 1248×720 section screenshots; the Home title, clock hierarchy/date, lower cards, and next-section control all remain visible in the same frame.
Known issues / not done:
- The selected direction remains a mockup. No website code, assets, configuration, requirements, security state, commit, push, or deployment changed.
Next session starts with:
- Use the six static screenshots as the approved visual handoff reference. Do not implement from them unless Milind explicitly assigns that work to the receiving agent.

### 2026-10-01 — Parallel-agent coordination boundary
Model: Codex
Phase: coordination setup (documentation only)
Done:
- Established that this Codex session will work only on tasks Milind explicitly assigns to it and will not pick up shared priorities or another agent's tasks by inference.
- Reserved [`codex-agent-handoff.md`](codex-agent-handoff.md) for this agent's task-specific notes so parallel work stays separate; shared facts that affect the whole project will still be recorded in this communal handoff.
- Set the working-tree boundary: apart from explicitly assigned changes, this agent may edit only the communal handoff and its individual handoff, and will preserve concurrent changes made by other agents.
Tested (how, result):
- Documentation-only setup; checked the working tree before editing and found no existing changes.
Known issues / not done:
- No implementation task has been assigned to this agent yet. No code, configuration, requirements, or security state changed.
Next session starts with:
- Read this communal handoff and [`codex-agent-handoff.md`](codex-agent-handoff.md), then act only on Milind's explicit Codex assignment.

### 2026-09-30 — Rulebook: every push updates the handoff docs
Model: Opus
Phase: 1 of 1
Done:
- At Milind's request, added a §3 rule to [`agent-rulebook.md`](agent-rulebook.md): every push (any branch) must include the matching Session Log / Tracker / Security updates in the same commit; §5 Definition of Done now says the same. This is an explicit, Milind-approved exception to the rulebook being static.
- Deleted the stray untracked `hello.txt` ("hello partner", never committed) from the working tree.
Tested (how, result):
- Docs only; no code or deploy behaviour changed.
Next session starts with:
- Unchanged — see the wrap-up entry below.

### 2026-09-30 — Session wrap-up: live data, heart rate, gigs (all on `main`, deployed)
Model: Opus
Done (this session, oldest → newest, all merged to `main` and live):
- S-01 fixed. Spotify listening data: `/api/now-playing`, `/api/playlists`, `/api/listening`, D1 play log + cron; frontend wiring (PR #7, `3116eb0`). Playlist track counts via owner token (`526af09`).
- Heart rate from the Google Health API (`4ddb271`), privacy page (`85652c2`), Google Cloud consent screen fixed and published (Chrome, with approval).
- Top-artist album covers (`8daec92`); Gig Finder shows only verified real-artist shows with artist photos and ticket links (`f80652a`); heart rate + now-playing refresh without reload (`31d8f93`).
- Secrets rotated/created via `wrangler secret bulk`: `SPOTIFY_AUTH_KEY`, `HEALTH_AUTH_KEY`, `GOOGLE_HEALTH_CLIENT_ID/SECRET`. Wrangler is now logged in on this laptop.
- Merged branches deleted (local + GitHub).
Tested (how, result):
- Production checks after each deploy: all listening routes 200 with real data; first cron write 50 plays; `/api/heart-rate` real readings; `/api/gigs` 8 verified shows with images and URLs; artist covers present. Details in the entries below.
Known issues / not done:
- Workers Builds non-production branch command still to be confirmed as `npx wrangler versions upload` (Milind).
- Google Health refresh token should outlive 7 days now that the app is In production — confirm after 2026-10-07.
- Heart rate is only as fresh as the phone's last background sync (iOS decides; typically 15–60 min). Nothing server-side can force it.
- Heart-rate `motion` comes back null; card omits it.
- Security findings S-02 to S-09 still open (S-07 fixed for the health route only).
Next session starts with:
- Confirm the branch-deploy setting and the Google token after 7 days, then Security Handoff §3 dashboard checklist and S-02 to S-04.

### 2026-09-30 — Heart rate updates without a page reload
Model: Opus
Phase: 1 of 1
Done:
- Found (Chrome, production) that the 30 s polls for `/api/heart-rate` were all answered from the browser's HTTP cache (`max-age` header), so the card only changed on reload. Polls for heart rate and now-playing now use `fetch(..., { cache: 'no-store' })`; the Worker's edge cache still rate-limits calls to Google/Spotify. Heart-rate edge TTL 60 → 30 s. The "Xm ago" label re-renders on every tick.
Tested (how, result):
- Mock server sending production's `Cache-Control: public, max-age=30` and a new bpm per request: value changed on screen after 30 s without reload (62 → 63 BPM), 0 of 2 polls served from browser cache.
Known issues / not done:
- Deployed (`31d8f93`) and verified: production serves `ui-v2.js?v=10` with `cache: 'no-store'` polls; `/api/heart-rate` sends `max-age=30`.
- Readings only reach Google when the phone app syncs with the tracker; nothing server-side can force that. Advice given to Milind: Background App Refresh on for the Google Health/Fitbit app, don't force-quit it, Bluetooth on, Low Power Mode off, enable any "all-day sync" option.

### 2026-09-30 — Gig Finder: real artists only, artist photos, top-artist covers
Model: Opus
Phase: 1 of 1
Done:
- Top artists (play log) now show the album cover from each artist's latest play (`fix/artist-images`, `LISTENING_CACHE_VERSION` 3).
- Gig Finder: Ticketmaster keyword search matched tributes, venue names and unrelated titles (live feed had Frank Sinatra, Fleetwood Mac, Daft Punk, INXS, Queen at an opera house, Drake at "The Drake Hotel", "salute"). Now: exact-name Ticketmaster attraction → only that attraction's events; MusicBrainz top match with `life-span.ended` excludes dead/disbanded acts (replaces the hard-coded list as the main check); wider tribute-title pattern, applied with the artist's own name removed. Per-artist results cached in `GIG_KV` (`gig_artist:v2:*`, 30 days); at most 6 uncached lookups per run (subrequest budget + MusicBrainz 1 req/s). Cards use the artist's Ticketmaster photo (listing image as fallback) and link to the ticket page. `/api/gigs` cache key is now fixed and versioned (`gigs-v2`).
Tested (how, result):
- `wrangler dev --remote` (real secrets/KV): after warming the cache, gigs = Maroon 5, Bruno Mars, Barry Can't Swim, The Weeknd, Disclosure, Post Malone, Calvin Harris, Tame Impala — all real headline shows with images and ticket URLs; every false entry gone (KV shows why: ended, no exact attraction, or no upcoming events). Chrome: cards render artist photos, links go to Ticketmaster/Moshtix, no console errors.
- Queen: MusicBrainz's top "Queen" is marked ended (Queen + Adam Lambert is a separate act) — only matters if Ticketmaster lists a "Queen" attraction with upcoming events.
Known issues / not done:
- Deployed (`f80652a`) and verified in production: same 8 verified shows, all with images and ticket URLs.
- Visitors' browsers may hold the old `/api/gigs` response up to 1 h (`max-age=3600`); the edge cache is retired by the new key.
- Old `gig_artist:v1:*` KV entries from testing expire on their own within 30 days.

### 2026-09-30 — Heart rate live
Model: Opus
Phase: 4 of 4
Done:
- Deployed (`4ddb271`, privacy page `e3c5f55`); `HEALTH_AUTH_KEY` generated via `wrangler secret bulk` (rotated once more at Milind's request); Milind completed the Google consent (unverified-app screen, app In production).
Tested (how, result):
- Production `/api/heart-rate` → `{"bpm":81,"sampledAt":"2026-09-30T18:41:17Z","motion":null}`, ~30 s after the reading. An unverified In-production app with a restricted scope works.
Known issues / not done:
- `motion` came back null (field absent for this reading or named differently); the card simply omits it.
- Check the Google refresh token survives past 7 days (it should, now that the app is In production).

### 2026-09-30 — Heart rate from Google Health API (Phases 1–3 of 4)
Model: Opus
Phase: 3 of 4
Done:
- Research: Fitbit Web API sunsets Sept 2026; its replacement is the Google Health API (`health.googleapis.com/v4`). Heart rate = `users/me/dataTypes/heart-rate/dataPoints`, newest first, scope `googlehealth.health_metrics_and_measurements.readonly`. All `googlehealth.*` scopes are Restricted: the OAuth app runs **In production, unverified** (single user, under the 100-user cap) because Testing mode expires refresh tokens after 7 days. Apple Health route rejected (no cloud API; would need a phone app pushing to a new public write endpoint).
- Milind created the Google Cloud project + OAuth client (redirect `https://milindparwani.com/api/health/callback`). Claude stored `GOOGLE_HEALTH_CLIENT_ID`/`_SECRET` via `wrangler secret bulk` without printing them. `HEALTH_AUTH_KEY` is generated at deploy time.
- Worker: `/api/health/authorize`, `/api/health/callback`, `/api/heart-rate` (see route table). Separate KV state prefix `health_oauth_state:` so a Google state can't be spent at the Spotify callback.
- Frontend: Health card shows "68 BPM" and "Latest reading / 7m ago / At rest"; polls with now-playing every 30 s while visible.
Tested (how, result):
- `wrangler dev --local` with dummy config: authorize 403 without/with wrong key, 302 with right key and correct Google params (offline, consent, readonly scope, no include_granted_scopes); callback: error param not echoed, missing params, bad state, valid state + bad code → "Token exchange failed.", state single-use, health state rejected by Spotify callback; heart-rate not connected → generic 502.
- Mock API in Chrome: reading → value + age + motion; `bpm: null` → "No reading in the last 24 h"; 502 → empty state unchanged; no console errors.
- Not testable before deploy: the real Google consent (unverified-app screen), the real response shape.
Known issues / not done:
- If Google refuses the restricted scope for an unverified production app, fall back to Testing mode (weekly re-login) or the Apple Health push route.
- First Google login failed: consent screen was still in Testing with no test users, and publishing needed a privacy policy URL. Added `public/privacy.html` (served at `/privacy`; claims checked — no cookies/analytics in `public/` or the Worker). Claude then (with Milind's go-ahead, in Chrome) set Branding home page + privacy link, removed the six unused restricted scopes (kept only `health_metrics_and_measurements.readonly`), and published the app.
Next session starts with:
- Deploy, generate `HEALTH_AUTH_KEY`, Milind logs in with Google, verify `/api/heart-rate` in production.

### 2026-09-30 — Spotify listening data: live (Phases 3–4 complete)
Model: Opus
Phase: 4 of 4
Done:
- `526af09` (playlist track-count fix) fast-forwarded to `main` and deployed. Merged branches `feat/spotify-listening`, `feat/section-paging` and `fix/playlist-track-count` deleted on GitHub and locally.
- Tracker: SH-07 (Spotify card) and SC-04 marked Live.
Tested (how, result):
- Production: `/api/playlists` → pop 453, Camon 222, idk 113 tracks; `/api/now-playing` → real last-played track; first cron run (18:00 UTC) wrote 50 plays (49 distinct, all with artwork); `/api/listening` → `source: "log"`, September 2026 top 5 tracks and artists with play counts.
Known issues / not done:
- September counts start at 12:46 UTC 30 Sep (recently-played only reaches back 50 plays); October onward is complete.
- Milind to set Workers Builds' non-production branch deploy command to `npx wrangler versions upload` — until then any branch push deploys to production.
Next session starts with:
- Confirm the branch-deploy setting, then Security Handoff §3 dashboard checklist and S-02 to S-04.

### 2026-09-30 — Spotify listening data: deploy check (Phase 3)
Model: Opus
Phase: 3 of 4
Done:
- Found PR #7 (`feat/spotify-listening`) had a "Merge branch 'main'" commit (`a923102`) whose conflict resolution dropped every Phase 2 frontend change and part of the docs (the conflicts came from #6 being squash-merged while this branch still carried the original section-paging commit). Restored the files from a clean rebase onto `main` as a new commit — no force-push.
- Production was already running this branch's Worker (routes live, HTML still the old `v=6`) before any merge to `main`: **pushing a non-main branch deploys to production.** Check Workers → portfolio → Settings → Builds: the non-production branch command should be `npx wrangler versions upload`, not `deploy`.
Tested (how, result):
- Production after the branch deploy: `/api/playlists` 200 with real names/covers; `/api/listening` 200 via `short_term` (real top tracks); `/api/now-playing` 502 (refresh token predates the new scopes — expected until re-authorize); D1 `plays` empty (cron needs the new scope too).
Known issues / not done:
- `/api/playlists` returned `trackCount: null` for all three: since Spotify's Feb 2026 dev-mode changes a playlist's `items` is only returned to its owner/collaborator, never to an app token. Fixed by fetching with the owner token (app token as fallback) and versioning the listening routes' cache keys (`LISTENING_CACHE_VERSION`) so the 6-hr cached response doesn't outlive the fix.
- PR #7 merged to `main` (`3116eb0`) by Claude at Milind's request.
- `SPOTIFY_AUTH_KEY` rotated by Claude via `wrangler secret bulk` (wrangler now logged in on this laptop). Piping the value into `npx wrangler secret put` from PowerShell 5.1 stored a different value — use `secret bulk` with a file, or the dashboard. Milind re-authorized; `/api/now-playing` returns real data.

### 2026-09-30 — Spotify listening data: frontend wiring (Phase 2)
Model: Opus
Phase: 2 of 4
Done:
- `public/ui-v2.js`: `loadNowPlaying` (dashboard Spotify card; "Now playing" / "Paused" / "Last played 2h ago" + artists; polls every 30 s while the tab is visible), `loadPlaylists` (name, description as plain text, cover, track count in the tag, link), `loadListening` + `renderTop` (Top Tracks / Top Artists table, play counts, bars relative to the top item). All API strings escaped; only `https:` URLs accepted for links and images.
- `public/index.html`: static playlist cards now show the real names (pop, Camon, idk) and link to the real playlists, so a failed `/api/playlists` still works; Tracks / Artists toggle added inside the Listening History card (hidden until data loads — Milind approved deploying after this phase; toggle chosen so the locked layout doesn't change); IDs for JS hooks; CSS/JS cache-bust `v=7`.
- `public/ui-v2.css`: toggle, artwork in table cells, link style, ellipsis for long now-playing titles.
Tested (how, result):
- Scratch mock server (not committed) serving `public/` with fake `/api/*` in three modes, driven in Chrome at 1456×819 viewport: ok mode → all panels filled, `<img onerror>` track name rendered as text, `javascript:` playlist URL/image rejected (static link kept), HTML entities in description decoded, long title truncated; Artists toggle switches heading, period line and rows; fallback mode → "Last 4 weeks", `--` plays, empty bars; fail mode → every empty state unchanged, toggle hidden. 390 px (iframe) → no horizontal overflow, mobile column rule intact. No console errors.
Known issues / not done:
- Not deployed; real Spotify data unverified until deploy + re-authorize.
Next session starts with:
- Phase 3: merge to `main` (deploys), Milind re-authorizes, verify all three routes and the first cron run in production.

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
- Top artists from the log have no image (recently-played returns simplified artists); `short_term` fallback artists do. **Resolved 2026-09-30:** each artist now shows the album cover from their latest logged play (`LISTENING_CACHE_VERSION` 3); verified read-only against production D1 — all top 5 artists get a cover, each from their most recent play.
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
