# PARWANI — Claude Handoff

> **Claude-only working record.** This document tracks the work Milind assigns to Claude (Claude Code) — what was built, how, how it was tested, and what is open. Shared project state lives in [`session-handoff.md`](session-handoff.md); Codex keeps its own record in [`codex-agent-handoff.md`](codex-agent-handoff.md). Nothing here is authority to pick up work assigned to Codex.

## Operating boundary

- Work only on tasks Milind assigns to Claude. Do not pick up Codex's assignment or items from the shared priorities unless Milind assigns them here.
- Before editing, check `git status` and the files involved for concurrent changes. Preserve anything that is not part of the Claude assignment. Never edit [`codex-agent-handoff.md`](codex-agent-handoff.md).
- Record Claude-specific detail (implementation notes, test runs, follow-ups) here. Put only project-wide facts in [`session-handoff.md`](session-handoff.md): build state, priorities, shared conventions, anything the other agent must know before touching the same files.
- Every push carries the matching doc updates (Rulebook §3): this file, plus the shared handoff, tracker and security docs when the project state changed.
- Pushing to any branch currently deploys to production (Workers Builds setting not yet fixed), so treat every push as a deploy.

## Current assignment

Status: **Idle — awaiting Milind's next Claude assignment.** Last delivered: feed-style section scrolling (live, 2026-10-01).

Areas Claude has most recently owned (coordinate before Codex changes these):

| Area | Files | Notes |
|---|---|---|
| Visible portfolio UI | `public/index.html` (the `.portfolio-v2` block only), `public/ui-v2.css`, `public/ui-v2.js` | Grey-box design from the Soft Monolith mockups. Cache-bust versions: `ui-v2.css?v=16`, `ui-v2.js?v=14` — bump on every change. |
| Worker routes and data | `worker/index.js`, `migrations/` | Spotify listening data, heart rate, gigs (2026-09-30). Unchanged on 2026-10-01. |

## How the current UI works (for the next Claude session)

- **Home dashboard:** a single grid with named areas (`.v2-dashboard`), columns `1.72fr 1fr .72fr .24fr 1.02fr`, rows `1fr 1.25fr .5fr`. Every cell is min-size 0 and clips its own content, so cards cannot overlap. The time and weather cards use container queries (`container-type: size`, `cqh` units) to size their content from the card itself; the weather card hides humidity/wind below 175 px tall.
- **Title fitting:** `fitText()` in `ui-v2.js` handles any element with `data-fit="1|2"` (line budget) and optional `data-fit-max` (extra lines allowed). It shrinks the font from the CSS size down to 70% within the budget, then for `data-fit-max` down to 55% with more lines. Lines are counted from `range.getClientRects()`, because Anton's tall glyphs make `scrollHeight` checks wrongly report overflow. Call `fitText(el)` after changing any fitted title's text; it also re-runs on resize and when fonts load. The headline and portfolio title keep their own fitters (`fitHeadline`, `fitPortfolioTitle`).
- **Section paging:** `initSectionPager()` is active at ≥721 × ≥620 px. Each move is a critically damped spring (`OMEGA = 14`, 4 substeps per frame, ~0.6 s settle) driven by requestAnimationFrame, with `scroll-snap-type` switched off on `<html>` while it runs and restored when it lands. A move in flight is retargeted, not queued: the next step counts from `targetIndex`. Jumps of 2+ sections add `html.v2-jump-out` (sections fade to 0 over 150 ms), teleport to the target's neighbour, then fade in while the spring finishes. Wheel: a new gesture is a 200 ms pause, a direction change, or a delta >1.6× the previous one (>20 px, ≥250 ms since the last step), so a swipe during momentum counts but one flick or a fast wheel spin moves once; `deltaMode` lines/pages are normalised. Held keys step once per landing. A touch or scrollbar press mid-move stops the spring. Wheel, keys and in-page `#v2-*` links all go through `goTo()`. With reduced motion it jumps instantly. Phones scroll continuously.
- **Empty and failure states:** gigs show "No upcoming gigs to show right now" (there is no invented fallback list — Rulebook §2.4); covers stay as grey squares until a real image loads; the listening rows read "Awaiting listening data".
- **Phones (≤720 px):** two-column dashboard with fixed row heights; small print set to 12 px (Lighthouse legible-font-size).

## Testing approach that works here

- **Local preview:** `npx wrangler dev --port 8787 --ip 127.0.0.1`. The APIs return 503 locally because there are no secrets. For realistic data, copy `public/index.html` to a temporary `public/zz-test.html` with a `fetch` shim in `<head>` that returns saved production `/api/*` JSON (add `?nodata` to make every route return 503). Delete the file before committing. `wrangler dev` serves `zz-test.html` at `/zz-test`, because `.html` URLs redirect.
- **Automated layout check:** for each section, check that no two `.v2-panel`/`.v2-strip`/`.v2-gig-controls` boxes intersect, no child extends past its box, no section child extends past the section, and no `[data-fit]` title exceeds its line budget. Run it at 2560×1300, 1920×969, 1440×789, 1366×657, 1280×720, 1100×620, 1024×700, 768×1024, 390×844 and 360×740.
- **Browsers:** Claude in Chrome works with same-origin iframes at exact sizes, but the extension can disconnect if Chrome closes. As a fallback, run `puppeteer-core` with headless Edge (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), installed in a temp folder, not the repo. Lighthouse also needs `CHROME_PATH` pointed at Edge.
- **Production check:** after a push, poll `https://milindparwani.com/?cb=<random>` for the new `?v=` numbers. The plain `/` can be edge-cached for a minute or two after a deploy.
- `gh` is not installed. Merge with `git merge --ff-only` on `main` and push.

## Open follow-ups (Claude's areas)

- A pathological Spotify title (~60 characters) on a 768 px portrait tablet still ends in "…" at the minimum size; normal titles fit everywhere.
- Playlist descriptions are empty on Spotify, so the cards read "Playlist on Spotify." They fill in automatically if Milind adds descriptions on Spotify.
- On 720p-class screens the weather card hides its humidity/wind line.
- Lighthouse `valid-source-maps` flags a third-party library map; it doesn't affect the score categories that matter (production: 90 / 100 / 100).

## Work log (newest first)

### 2026-10-01 — Feed-style section scrolling (live)

- Milind: scrolling felt clunky; wanted TikTok/Instagram-smooth section moves and seamless nav jumps. Causes found: ease-in-out quint barely moves for the first ~150 ms (feels laggy), any input during the 0.9 s move plus a 400 ms landing cooldown was dropped, and nav jumps scrolled through every section in between.
- Replaced with the spring + retarget + fade-jump described above. Also fixed Firefox line-mode wheel deltas (3 lines read as <4 px and were ignored).
- Tested in headless Edge (puppeteer-core in scratchpad) at 1920×969 and 1280×720: trackpad flick with 50-event momentum moves one section and restores snap; motion monotonic, moving from the first frame; a second swipe during coasting adds a section; a 12-notch fast wheel spin moves one; two notches 300 ms apart move two; nav Home→Gigs lands exactly with one hidden teleport and opacity restored; adjacent nav click springs without fade; three quick ArrowUp presses move three; hash follows; no page errors. Reduced motion jumps instantly at 1440×789; wheel not intercepted at 390×844. 24/24 pass.

### 2026-10-01 — Two-agent docs split

- At Milind's request, created this Claude handoff. The shared [`session-handoff.md`](session-handoff.md) now holds project scope and shared state plus an "Agents and handoff docs" section; Claude's detailed work notes live here. `CLAUDE.md` points future Claude sessions to this file.
- Committed Codex's pending shared-handoff entries and its `codex-agent-handoff.md` unchanged, so both devices see the same docs.

### 2026-10-01 — Fit-to-box titles and smoother section scrolling (`0d30b74`, live)

- Milind asked for long text to shrink slightly and wrap rather than be cut off. Added `fitText()` with `data-fit` / `data-fit-max`: the Spotify track (2 lines, a 3rd if needed), playlist names and gig artists (2), and tool, metric and bottom-row headings (1). Removed the matching `nowrap`/ellipsis/clamp rules.
- The first version measured height and shrank every Anton title to the minimum, because the glyphs overflow their line box. Fixed by counting line boxes instead.
- Replaced `scrollIntoView({behavior:'smooth'})` with the eased rAF scroll, turned snap off during the move, and routed nav links, scroll cues and Back to top through it.
- Tested in headless Edge with fixtures at nine sizes: all sections pass. "Freaking Out the Neighborhood" sits on 2 lines at full size everywhere. Scroll moves are monotonic and land exactly (≤30 px per frame between neighbouring sections), the hash updates, snap is restored, reduced motion jumps instantly, no page errors. Production re-checked at 1280×720, 1920×969 and 390×844.

### 2026-10-01 — Grey-box UI rebuild (`74166f8` → `1e3a13a`, live)

Built from the six Soft Monolith mockups in four phases, each approved by Milind:

1. **Shared styles + Home** (`74166f8`): panel tokens (`--v2-panel` #151515, `--v2-panel-raised` #202020, `--v2-soft-line` 20%), outline-free panels, full-bleed single-rule nav. Home rebuilt on the named-area grid (the mockup itself had the bottom row overlapping Spotify/Time). Added the About card, centred Spotify cover with "Now playing / Last played" bottom-left, Dubai/London/Sydney clocks (London and Sydney zone names via `Intl`), and a full-width title (height cap raised to 26% of the viewport).
2. **Journal, Projects, Toolbox** (`294ad85`): Journal copy card next to a CSS diagonal-stripe placeholder panel; `.v2-card-foot` hairline footer (status left, action right) replaces the outlined icon buttons; tool thumbnails removed; tool descriptions reserve two lines so rows align. The 2-column fallbacks for 721–900 px were removed, since locked sections can't hold them.
3. **Playlists, Gigs** (`d3aa1aa`): real Spotify covers and track-count tags; "Top this month" as name / artist / bar / plays (header row hidden from view, kept for screen readers); gig cards with artist photos and an `Open details ↗` footer; invented fallback gigs and stock photos removed; footer restyled as a scroll cue.
4. **Test + deploy** (`ef1b737`, docs `1e3a13a`): deleted `public/assets/ui/`; 12 px minimum text on phones. Lighthouse mobile went from 68 / 100 / 100 (performance, accessibility, best practices) to 90 / 100 / 100 on production, with LCP down from 6.4 s to 3.3 s. Verified in production with live data at 1280×720, 1366×657, 1920×969 and 390×844.

### 2026-09-30 — Earlier Claude work (summary)

Spotify listening data (Worker routes, D1 play log, cron, frontend), heart rate via the Google Health API, Gig Finder real-artist filtering, full-viewport section paging, and the first mockup-matched UI. Full entries are in the shared [`session-handoff.md`](session-handoff.md) session log.
