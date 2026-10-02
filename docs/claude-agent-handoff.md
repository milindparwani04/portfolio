# PARWANI — Claude Handoff

> **Claude-only working record.** This document tracks the work Milind assigns to Claude (Claude Code) — what was built, how, how it was tested, and what is open. Shared project state lives in [`session-handoff.md`](session-handoff.md); Codex keeps its own record in [`codex-agent-handoff.md`](codex-agent-handoff.md). Nothing here is authority to pick up work assigned to Codex.

## Operating boundary

- Work only on tasks Milind assigns to Claude. Do not pick up Codex's assignment or items from the shared priorities unless Milind assigns them here.
- Before editing, check `git status` and the files involved for concurrent changes. Preserve anything that is not part of the Claude assignment. Never edit [`codex-agent-handoff.md`](codex-agent-handoff.md).
- Record Claude-specific detail (implementation notes, test runs, follow-ups) here. Put only project-wide facts in [`session-handoff.md`](session-handoff.md): build state, priorities, shared conventions, anything the other agent must know before touching the same files.
- Every push carries the matching doc updates (Rulebook §3): this file, plus the shared handoff, tracker and security docs when the project state changed.
- Pushing to any branch currently deploys to production (Workers Builds setting not yet fixed), so treat every push as a deploy.

## Current assignment

Status: **Gig Finder: Dubai and Abu Dhabi only (2026-10-02) — pushed, awaiting Milind's review.** Ongoing: the weekly curated refresh routine below.

Areas Claude has most recently owned (coordinate before Codex changes these):

| Area | Files | Notes |
|---|---|---|
| Visible portfolio UI | `public/index.html` (the `.portfolio-v2` block only), `public/ui-v2.css`, `public/ui-v2.js` | Grey-box design from the Soft Monolith mockups. Cache-bust versions: `ui-v2.css?v=16`, `ui-v2.js?v=15` — bump on every change. |
| Worker routes and data | `worker/index.js`, `worker/gig-picks.json`, `migrations/` | Spotify listening data, heart rate, gigs. Gig Finder rebuilt 2026-10-02. |

## Gig Finder (how it works, for the next session and the weekly routine)

- **Milind's criteria (2026-10-02), Dubai and Abu Dhabi only:** comedians in either city (any language); musicals at Dubai Opera only; concerts at Coca-Cola Arena and Ushuaïa Dubai by artists who sing in English (no K-pop, Filipino, Arabic, Bollywood, Turkish etc.); big English-language artists and DJs at the major Abu Dhabi venues, plus the F1 weekend and its after-race concerts; DJs at Dubai clubs, only within the next 3 months; film/TV composer concerts (Zimmer, Djawadi, Göransson, Williams…, including Candlelight tributes) but no other orchestral shows.
- **Sources:** `fetchTicketmasterUaeEvents` (Discovery API, `countryCode=AE`) → `classifyTicketmasterEvent` applies the rules by city, venue regex, TM genre and title. Concerts then need Last.fm `artist.gettoptags`: any non-English scene tag drops the act, no tags at all drops it too, and club tags (house/techno/trance/edm) in the top 3 reclassify it as DJ. `worker/gig-picks.json` holds curated events from sellers with no API (Dubai Opera, Ushuaïa, Soho Garden, Live Nation ME, Fever, abudhabigp.com); it is bundled into the Worker, so changing it needs a deploy (= a push). `excludeArtists` / `includeArtists` override the filters by name; `imageArtist` names the act to look up a photo for when `artist` is a combined name.
- **Merging:** curated entries win over a Ticketmaster duplicate of the same artist and date; nights by the same artist at the same venue within a week collapse to one card with `endDate`. Past events drop out by Dubai date; DJ nights beyond 90 days are held back until they come into range.
- **Probed on 2026-10-02:** Ticketmaster UAE had 88 events. It carries Etihad Arena, Abu Dhabi Comedy Week, part of the Dubai Comedy Festival, Pacha ICONS / Bohemia / The Penthouse, Hans Zimmer Live and a few Coca-Cola Arena shows. It does not carry Dubai Opera, Ushuaïa, Soho Garden, WHITE, or Live Nation ME (Trevor Noah, Mo Gilligan). Platinumlist's API needs a partner token (401) and its site sits behind Queue-it; dubaiopera.com and coca-cola-arena.com serve Cloudflare bot challenges.
- **Weekly routine:** "Gig Finder weekly curated refresh", `trig_01V5wXhtAzpJkHrW11is9yt2`, cron `0 2 * * 1` (Mondays 06:00 Dubai), Sonnet 5.5, https://claude.ai/code/routines/trig_01V5wXhtAzpJkHrW11is9yt2. It edits only `worker/gig-picks.json` and adds a line to the refresh log below and to the shared session log, then pushes to `main`. To change its brief, update the routine's prompt there.

### Gig Finder curated refresh log

- 2026-10-02 — initial list (31 events) from dubaicomedyfest.ae/shows, ushuaiadubai.com, The National's UAE events list (2026-09-03) and Dubai Opera 2026-27 season (2026-09-10), factmagazines.com (Soho Garden), feverup.com (Candlelight Hans Zimmer, Harry Potter in Concert), abudhabigp.com / Khaleej Times (F1 concerts), etihadarena.ae (Aries Spears), livenation.me (Trevor Noah). Left out: OFFLIMITS (cancelled), Andrew Schulz (sources disagree on the date), Alex Warren F1 night (not on the official page yet).

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

- Cache hits on `/api/*` reach browsers with `max-age=14400`. Check the zone's Browser Cache TTL ("Respect existing headers" would keep the Worker's TTLs).
- Gig Finder: about 13 curated cards have no photo, because Ticketmaster has no attraction image for those acts. Chicago the Musical (Coca-Cola Arena, 16–20 Dec) is excluded by the "Dubai Opera musicals" rule; ask Milind whether he wants it. In headless Edge, pressing Enter on a focused gig Next button didn't change the batch, while Space and click did. This is existing code; check it in a real browser.

- A pathological Spotify title (~60 characters) on a 768 px portrait tablet still ends in "…" at the minimum size; normal titles fit everywhere.
- Playlist descriptions are empty on Spotify, so the cards read "Playlist on Spotify." They fill in automatically if Milind adds descriptions on Spotify.
- On 720p-class screens the weather card hides its humidity/wind line.
- Lighthouse `valid-source-maps` flags a third-party library map; it doesn't affect the score categories that matter (production: 90 / 100 / 100).

## Work log (newest first)

### 2026-10-02 — Gig Finder: Dubai and Abu Dhabi only

- Milind's brief is above. Replaced the Spotify top-artists / Last.fm chart / MusicBrainz pipeline in `handleGigs` with the Ticketmaster-UAE + curated design; removed `resolveGigArtist`, `fetchTicketmasterSoonestShow`, `isTributeEvent`, `DECEASED_ARTISTS` and the MusicBrainz constants (nothing else used them). Errors are now generic (S-04 for this route), and a Ticketmaster failure falls back to the curated list. Frontend: category tag, `formatGigDate(date, endDate)` with ranges and a year when it isn't this year, kicker "Dubai and Abu Dhabi. Five at a time."
- Testing approach: a scratch harness Worker named `portfolio` (so `wrangler dev --remote` gets the real secrets) imports `worker/index.js` and swaps `GIG_KV` for an in-memory map; the real `GIG_KV` has no `preview_id`, so it can't be used in remote dev.
- Tested: cold run returned 65 events in 2.9 s with a 5-min cache while lookups were pending, then 1 h. Tags dropped Tarkan, Andrea Bocelli and Ebru Gündeş. Ghostly Kisses stayed a concert after "electronic" was taken out of the DJ tags, and Anyma became a DJ. Chicago the Musical and PFL were left out of comedy, F1 ticket tiers and Golden Circle upgrades were skipped, Jan Blomqvist and Jonas Blue were each shown once, and Trevor Noah merged to 25–29 Nov. No Ticketmaster key gave 503; a bad key gave 31 curated events with a 5-min cache. Date formatter unit check: 9 cases. Headless Edge with a fixture at 2560×1300 → 360×740 (ten sizes) with and without data: 0 overlaps, 0 spill, 0 page errors. Next/Prev by click and Space rotate batches. `wrangler deploy --dry-run` bundles the JSON import.
- Production (`c2aec6f`): the new `?v=15` was live after about 30 s, and `/api/gigs` returns the same 65 events. The first responses were cached while photo lookups were still pending (19 without a photo); they fill in once the cache expires. The edge serves cache hits with `Cache-Control: max-age=14400`, not the Worker's 300/3600, which looks like a zone Browser Cache TTL setting. Visitors may therefore keep an older list for up to 4 h. Not changed here; see follow-ups.
- One slip: escapes in an ad-hoc node script put backspace characters into two regexes. Caught by `file` reporting "overstriking" and fixed; `grep -P '\x08'` is clean.

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
