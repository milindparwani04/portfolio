# PARWANI — Claude Handoff

> **Claude-only working record.** This document tracks the work Milind assigns to Claude (Claude Code) — what was built, how, how it was tested, and what is open. Shared project state lives in [`session-handoff.md`](session-handoff.md); Codex keeps its own record in [`codex-agent-handoff.md`](codex-agent-handoff.md). Nothing here is authority to pick up work assigned to Codex.

## Operating boundary

- Work only on tasks Milind assigns to Claude. Do not pick up Codex's assignment or items from the shared priorities unless Milind assigns them here.
- Before editing, check `git status` and the files involved for concurrent changes. Preserve anything that is not part of the Claude assignment. Never edit [`codex-agent-handoff.md`](codex-agent-handoff.md).
- Record Claude-specific detail (implementation notes, test runs, follow-ups) here. Put only project-wide facts in [`session-handoff.md`](session-handoff.md): build state, priorities, shared conventions, anything the other agent must know before touching the same files.
- Every push carries the matching doc updates (Rulebook §3): this file, plus the shared handoff, tracker and security docs when the project state changed.
- Pushing to any branch currently deploys to production (Workers Builds setting not yet fixed), so treat every push as a deploy.

## Current assignment

Status: **Home Steps card live with real data 2026-10-02 (Codex's mockup, with Milind's two changes).** Previous wrap-up: Shipped today: Gig Finder (Dubai/Abu Dhabi, photos, credits, Chicago), Journal redesign, Enter-key fix, Cloudflare cache TTL fix, Media tracker. Open items: article pages for the Journal, an optional TMDB key for sharper posters. Two weekly routines run on Mondays (Gig Finder 06:00, Media 06:30 Dubai).

Areas Claude has most recently owned (coordinate before Codex changes these):

| Area | Files | Notes |
|---|---|---|
| Visible portfolio UI | `public/index.html` (the `.portfolio-v2` block only), `public/ui-v2.css`, `public/ui-v2.js` | Grey-box design from the Soft Monolith mockups. Cache-bust versions: `ui-v2.css?v=22`, `ui-v2.js?v=20` — bump on every change. Journal redesign implemented 2026-10-02 from Codex's mockup. |
| Worker routes and data | `worker/index.js`, `worker/gig-picks.json`, `migrations/` | Spotify listening data, heart rate, steps, gigs. Gig Finder rebuilt 2026-10-02. |

## Media tracker (how it works, for the next session and the weekly routine)

- **Milind's brief (2026-10-02):** a section like the Gig Finder for films and games; no TV. Films only in English, Japanese or Korean, from Reel (Dubai Mall), VOX (Mercato, BurJuman, Mall of the Emirates), ROXY (Dubai Hills) and Cinema Akil. A new release shows once with its release date and no venue. Old films on a limited run show the range of days. Cinema Akil is the only venue named, with its date range. Include films released in the last 7 days. Games: notable releases only (no small indies) from a verifiable games outlet, with release date and platforms. Window: next 3 months, rolling. Use the store's poster or cover. No buy links.
- **Sources:**
  - Reel publishes the JSON its own site uses at `storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/`: `Films.json` (title, `Language`, `OpeningDate`, `IsComingSoon`), `Sessions.json` (`CinemaId` `0001` is Dubai Mall; `Showtime`), `Cinemas.json`. Posters are `.../movie_images/{ID}.jpg` (300×450).
  - Cinema Akil: `https://www.cinemaakil.com/api/films?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` gives `films.Records[]` with `movie_languages`, `datesArray` (a day is a screening if it has `formats`) and `movie_content[].original_artwork` (about 966×1451).
  - VOX (`uae.voxcinemas.com`) and ROXY (`theroxycinemas.com`) return 403 to Workers and hang or return 403 to curl, so they are curated. In Chrome they render normally: VOX lists show "Language:" in the page text, and on ROXY movie pages the showtimes are `input[cinema-name][date]` elements.
- **Re-release locations:** re-release cards name their cinemas (Reel Dubai Mall / VOX … / ROXY Dubai Hills, or "Reel Cinemas · venue TBC"). Curated entries need `location`; duplicates merge.
- **Rules in code (`handleMedia`):** re-release = title matches `(YYYY)`, "re-release", "encore" or "anniversary". Its range is the first to last Dubai Mall session; if nothing is on sale yet, its announced date. Royal Ballet / Royal Opera broadcasts are excluded as not films. Chain films are deduplicated by normalised title (Reel first, then curated). An Akil card is dropped when the same film is a current chain release (e.g. Digger). Akil Q&A screenings fold into the film. Games come only from `media-picks.json`. `excludeTitles` hides anything by name. With a `TMDB_API_KEY` secret set, film posters are swapped for TMDB w780 posters (KV `media_poster:v1:*`, at most 12 lookups a run).
- **Games:** Game Informer's schedule (`gameinformer.com/2026`, `/2027`) is parseable HTML (`span.calendar_entry` with `time[datetime]`). Box art: the product page's `/styles/product_box_art/public/...webp` has a 1440×2160 original without the style path. Covers are resized to 600 px wide (mozjpeg q78) in `public/assets/media/games/`. GameSpot and VGC block automated requests.
- **Frontend:** `createCardRail({url, ids, noun, renderCard})` in `ui-v2.js` drives both rails. Media cards reuse the `.v2-gig` card with `.v2-media-art`: the poster is shown whole (contain) over a blurred copy. Status line: Coming soon / In cinemas / Limited run / Out now.
- **Weekly routine:** "Media tracker weekly refresh", `trig_014ZDNi4Uf1ecndu8k5oJ6as`, cron `30 2 * * 1` (Mondays 06:30 Dubai), https://claude.ai/code/routines/trig_014ZDNi4Uf1ecndu8k5oJ6as.

### Media tracker refresh log

- 2026-10-02 — initial list. Games (25) from the Game Informer 2026 schedule, filtered to notable releases (no indies, no plain Switch 2 ports). Films curated: ROXY Dubai Hills K-Fest (Dark Nuns 2 Oct, Revolver 3 Oct, No Other Choice 4 Oct; Exhuma played only at Al Khawaneej and City Walk, so it is excluded). VOX coming soon and what's on were checked in Chrome: no English/Japanese/Korean titles that Reel lacks, apart from spelling variants and K-pop concert broadcasts. Excluded "Verity - Her Night" (a ladies'-night screening) and, at Milind's request, "Always Lalisa" (a K-pop concert film).

## Gig Finder (how it works, for the next session and the weekly routine)

- **Milind's criteria (2026-10-02), Dubai and Abu Dhabi only:** comedians in either city (any language); musicals at Dubai Opera and Coca-Cola Arena (Chicago added 2026-10-02); concerts at Coca-Cola Arena and Ushuaïa Dubai by artists who sing in English (no K-pop, Filipino, Arabic, Bollywood, Turkish etc.); big English-language artists and DJs at the major Abu Dhabi venues, plus the F1 weekend and its after-race concerts; DJs at Dubai clubs, only within the next 3 months; film/TV composer concerts (Zimmer, Djawadi, Göransson, Williams…, including Candlelight tributes) but no other orchestral shows.
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


- Media: Reel posters are 300×450. A free TMDB API key, stored with `wrangler secret bulk` as `TMDB_API_KEY`, turns on 780 px posters with no code change; Milind has to create the TMDB account. VOX and ROXY extras depend on the weekly routine, which may also be blocked from those sites, so they are best-effort.

- Journal: there are no article pages yet for `Read more` to link to.


- A pathological Spotify title (~60 characters) on a 768 px portrait tablet still ends in "…" at the minimum size; normal titles fit everywhere.
- Playlist descriptions are empty on Spotify, so the cards read "Playlist on Spotify." They fill in automatically if Milind adds descriptions on Spotify.
- On 720p-class screens the weather card hides its humidity/wind line.
- Lighthouse `valid-source-maps` flags a third-party library map; it doesn't affect the score categories that matter (production: 90 / 100 / 100).

## Work log (newest first)

### 2026-10-02 — Steps card connected to real data

- Google Health was re-authorized with both scopes. The Cloud consent screen got `activity_and_fitness.readonly` under Data access (done in Chrome). Milind had lost `HEALTH_AUTH_KEY`, so he set a new random one with `wrangler secret put` and opened the authorize link himself. Auto mode blocks Claude from writing secrets. The new key wasn't saved anywhere; to re-authorize again, set a fresh one the same way.
- Bug fixed (`d7c2f5c`): a `dailyRollUp` range needs `CivilDateTime` = `{ date: { year, month, day } }`. The flat date returned 400 "Unknown name year at range.start". Production then returned `{"steps":2587,...}`.
- The tracker logs no step points while you sit still, so the newest step (10:47) was older than the heart reading (10:58) from the same sync. The Steps foot now shows the newer of the two times (`ui-v2.js?v=20`), so both cards read the same age, as Milind asked.

### 2026-10-02 — Home Steps card (Codex's mockup) implemented

- Milind asked Claude to build Codex's approved Steps card. He made two changes to the mockup: no centred `DAILY STEPS` heading (the `[ STEPS / TODAY ]` tag already says it), and the card gets the same update line as Heart Rate.
- **Worker:** `/api/steps` returns `{ steps, updatedAt }`. Two parallel Google Health calls: `dataPoints:dailyRollUp` for today's Dubai civil day (Google recommends this over summing raw points, because it handles time zones), and `dataPoints?pageSize=1` filtered on `steps.interval.start_time` over the last 24 h for the newest point's `interval.endTime`. 30 s versioned edge cache and a generic 502, like heart rate. `GOOGLE_HEALTH_SCOPE` now also asks for `googlehealth.activity_and_fitness.readonly`, so the stored refresh token must be re-issued once. The rollup reads `countSum` and falls back to `count_sum`, because the docs show both spellings.
- **UI:** card 05 is `.v2-steps` (grid area `steps`; the old `time` area, clocks and `.v2-cities` rules are gone). It shows the value `2,500/10,000` (Anton, sized by container units `min(24cqh, 14cqw)`), then `25% OF DAILY GOAL`, a 1 px bar and the foot `LATEST READING / 4M AGO` in the Heart Rate style. At 10,000 or more the card gets `.v2-steps--done`: the value, `DAILY GOAL REACHED` and the bar turn `--v2-green`, and the bar is capped at 100%. It polls every 30 s with heart rate and on tab focus. A failed poll keeps the last total. The Dubai date moved to `.v2-about-date` at the foot of About, and it ticks once a minute instead of every second.
- **Tested:** `wrangler dev` with a `zz-test.html` fetch shim (2,500, 10,000 and 12,345 steps), deleted before the commit. Chrome at 1912 px wide shows both states as in the mockup. Iframes at 390×844, 1280×640 and 1366×700: no element extends outside card 05, the value is green at 10,000, and the date sits inside About. Live Google data is untested until the re-authorization.


### 2026-10-02 — Re-releases name their cinemas

- Milind asked where the Shawshank re-release is showing. Every re-release card now lists the followed cinemas showing it:
  - Reel: "Reel Dubai Mall" when Dubai Mall has sessions; "Reel Cinemas · venue TBC" while Reel lists the film but hasn't put it on sale anywhere (Shawshank, from 15 Oct). Reel re-releases running only at other Reel cinemas are dropped.
  - Curated VOX/ROXY entries carry a `location`. When the same re-release comes from several sources, they merge into one card: locations joined (a known venue replaces "venue TBC") and the widest date range.
  - Example: Avengers Endgame: Encore reads "Reel Dubai Mall / VOX BurJuman, Mall of the Emirates, Mercato / ROXY Dubai Hills", 2–7 Oct, checked in Chrome on the VOX and ROXY film pages.
- The venue line on media cards wraps: up to 3 lines, 6 at ≤900 px. Cache key `media-v3`, `ui-v2.css?v=21`. The routine brief now asks for `location` on re-releases.
- Tested in remote preview: 79 items, and every re-release has a location. Headless Edge at ten sizes: the Endgame venue line is never cut off and no card overflows; 0 page errors.

### 2026-10-02 — Media tracker section

- The brief, sources and rules are in "Media tracker" above. Built `/api/media` (`handleMedia`, `reelFilms`, `akilFilms`, optional `tmdbPoster`), `worker/media-picks.json`, the Media section in `index.html` (REF. 04; Playlists is now 05 and Gigs 06; nav, cues and back links renumbered) and `.v2-media-*` CSS. The gig rail's state and countdown code became `createCardRail`, shared by both sections. Versions: `ui-v2.css?v=20`, `ui-v2.js?v=18` (v18: single-day Cinema Akil screenings read "Limited run").
- Research: probed every venue with curl, a Cloudflare Worker and Chrome. Reel and Akil expose data that Workers can read; VOX and ROXY don't. ROXY K-Fest showtimes per venue were read in Chrome.
- Tested:
  - Remote-preview harness (`?path=/api/media`): 80 items. All image URLs return 200 with real images. Language set {English, Korean, Japanese}. Dates from 2026-10-01 (released within the last week) to 2026-12-31.
  - Headless Edge with a fixture, at ten sizes: no panel overlaps or section overflow, no page errors; titles stay within 2 lines. Posters were checked on screen at 1920 and 390.
  - Paging: 7 sections, PageDown ×4 lands on `#v2-media` with the nav underlined.
  - Gig rail unchanged (14 batches); Enter on the Media Next button advances the batch.

### 2026-10-02 — Coca-Cola Arena musicals, photo credits, cache TTL, Enter key

- **Musicals:** Milind asked for musicals at Coca-Cola Arena as well as Dubai Opera (`GIG_MUSICAL_VENUES`; cache key `gigs-v5`). Chicago the Musical now shows as one card for 16–20 Dec, merged from 8 Ticketmaster listings. Its Ticketmaster poster would have its text cut off, so `imageOverrides` uses the Commons "Chicago the Musical Banners on Broadway" photo instead. The routine's prompt was updated to cover Coca-Cola Arena musicals.
- **Photo credits:**
  - Journal: each photo has an `a.v2-journal-credit` bottom-right ("Photo: Author / Licence", linked to the Commons page).
  - Gig cards: `gig-picks.json` has a new `imageCredits` map keyed by the exact image URL. The Worker adds `credit: {text, url}` to a gig only while that photo is shown, and `ui-v2.js` renders `a.v2-gig-credit`. Credited now: Chicago, Vir Das, Enissa Amani, F1.
  - The routine must add a credit for every Wikimedia photo (step 5b).
  - Credits are .62rem on desktop and 12 px on phones, where they wrap so they aren't cut off.
- **Browser cache:** the Cloudflare zone's Browser Cache TTL was "4 hours", which overrode every Worker `Cache-Control` on cache hits. Changed to "Respect Existing Headers" in the dashboard via Claude in Chrome (Caching → Configuration). Verified: `/api/gigs` now sends `max-age=3600`, `/api/now-playing` `max-age=20`, and assets keep `max-age=0, must-revalidate`.
- **Enter key:** tested in real Chrome. The first Enter on the focused gig Next button did nothing and reset the page scroll; a second Enter worked. Cause: the legacy boot-gate keydown handler in `index.html` still swallowed the first Enter or Space and called `enterSite()`, even though `#boot` is hidden. It now acts only while the boot screen is actually displayed.
- Tested: remote-preview harness returned 66 events, Chicago as `musical` with its credit, and 4 credited cards. Headless Edge: the credit stays inside the photo at 1440×789 and 390×844, with no page errors; Journal credits fit with no cropping. Versions: `ui-v2.css?v=19`, `ui-v2.js?v=16`.

### 2026-10-02 — Journal redesign (Codex's mockup) implemented

- Milind asked Claude to finish Codex's task: build the approved Journal UI. The final mockup is `~/.codex/generated_images/01a0fb70-…/exec-8d3cff83-….png` (11:24). The 11:17 and 11:20 images show older states with `Read more` links. Codex's rule is that all three entries are unfinished and none shows `Read more`.
- **Markup:** each card in `public/index.html` has an index row, a `figure.v2-journal-media` (photo plus top-left caption), a `.v2-journal-copy` (h3 `data-fit="2"`, or a `.v2-review-head` with title, year and `.v2-score` badge, then the description), and a `.v2-journal-foot` with the status in yellow. An HTML comment above the grid explains how to mark an entry finished: set the status to `Completed` and add `a.v2-journal-more` as the last child of the foot. It also lists the badge colour classes `v2-score--red/--yellow/--green/--purple`.
- **CSS:** the grid has 4 shared rows (`auto minmax(90px,1fr) auto auto`), and cards use `grid-template-rows: subgrid`, so the photos are the same height and the status rows line up even when titles wrap differently. The photo row gives way on short screens. Phones (≤720 px) switch cards to flex columns with 220 px photos. The badge is a 48-point `clip-path` polygon sized `clamp(64px, min(7vw,13vh), 124px)`, with a 92 px badge on phones. The old `.v2-journal-meta`, `.v2-journal-status` and diagonal-stripe placeholder rules were removed. The strip now reads "03 entries" (the mockup still said "01 entry"). The scroll cue stays "Projects next" to match the other sections, rather than the mockup's text.
- **Photos** (Wikimedia Commons, 1280 px thumbnails resized to 1000 px wide at mozjpeg q78, 108–163 KB each, in `public/assets/journal/`):
  - `karoshi-marunouchi.jpg`: "Marunouchi skyscrapers" by KimonBerlin, CC BY-SA 2.0.
  - `attention-shibuya.jpg`: "Japan (15608018214)" by Moyan Brenn, CC BY 2.0 (credit watermark visible bottom-left).
  - `shawshank-reformatory.jpg`: "Ohio State Reformatory-4" by Marianodemiguel, CC BY-SA 4.0. The film was shot at this reformatory.
  - These licences require attribution. Credits are recorded here; adding a visible credit line on the site is a follow-up for Milind to decide.
- **Tested** in headless Edge at 2560×1300, 1920×969, 1440×789, 1366×657, 1280×720, 1100×620, 1024×700, 768×1024, 390×844 and 360×740:
  - no panel overlaps, child overflow or section overflow, and no page or request errors;
  - all three photos the same height at every size;
  - titles stay within 2 lines, and no description is cut off;
  - no `Read more` links.
  - A temporary `Completed` state at 1440×789 keeps the link inside its card.
  - A phone bug was found and fixed: the flex-column foot shrank to content width. On phones it now stretches to the full card width.

### 2026-10-02 — Gig Finder: high-quality photo on every card

- Milind: some cards had no photo and many looked soft. Cause: `pickTicketmasterImage` preferred the 4:3 ratio, and Ticketmaster's only 4:3 image is a 305×225 `_CUSTOM` thumbnail. It now picks by height: the smallest image at least 600 px tall, which is 1136×639 `RETINA_LANDSCAPE` for every act checked. `_SOURCE` originals are skipped.
- Curated events without a photo now look up the exact-name Ticketmaster attraction, then fall back to Deezer's 1000×1000 `picture_xl` (exact name, most fans) (`curatedArtistImage`). The cache keys were bumped to `gig_image:v2:*` and `gigs-v4`.
- `gig-picks.json` changes: 14 events got a fixed `image`, from Deezer, the Dubai Comedy Festival's official Squarespace artwork (`?format=1000w`), Wikimedia (thumbnails must use standard widths such as `1280px`; 1200/1600 return errors) and a Fever og:image (`f_auto,c_fill,w_1000,h_1000`). A new top-level `imageOverrides` map (artist → URL) replaces the photo on any card, Ticketmaster cards included. It is used for Marco Carola (Ticketmaster had only a logo), Vir Das, Bryson Tiller & Central Cee, Hans Zimmer, Neema Naz, Shane Todd and Rafi Bastos (posters whose text was cut off by the square crop).
- The weekly routine's prompt now requires a photo for every new entry, using the same sources and rules, at least 600 px, checked with curl.
- Tested: remote-preview harness returned 65 events, all with a photo. Every image loaded in headless Edge, and the smallest short side is 639 px (it was 225 px). A contact sheet of all 65 crops was checked by eye; each shows the right act, with no logos or cut-off text left. Frontend and CSS unchanged.

### 2026-10-02 — Gig Finder: Dubai and Abu Dhabi only

- Milind's brief is above. Replaced the Spotify top-artists / Last.fm chart / MusicBrainz pipeline in `handleGigs` with the Ticketmaster-UAE + curated design; removed `resolveGigArtist`, `fetchTicketmasterSoonestShow`, `isTributeEvent`, `DECEASED_ARTISTS` and the MusicBrainz constants (nothing else used them). Errors are now generic (S-04 for this route), and a Ticketmaster failure falls back to the curated list. Frontend: category tag, `formatGigDate(date, endDate)` with ranges and a year when it isn't this year, kicker "Dubai and Abu Dhabi. Five at a time."
- Testing approach: a scratch harness Worker named `portfolio` (so `wrangler dev --remote` gets the real secrets) imports `worker/index.js` and swaps `GIG_KV` for an in-memory map; the real `GIG_KV` has no `preview_id`, so it can't be used in remote dev.
- Tested: cold run returned 65 events in 2.9 s with a 5-min cache while lookups were pending, then 1 h. Tags dropped Tarkan, Andrea Bocelli and Ebru Gündeş. Ghostly Kisses stayed a concert after "electronic" was taken out of the DJ tags, and Anyma became a DJ. Chicago the Musical and PFL were left out of comedy, F1 ticket tiers and Golden Circle upgrades were skipped, Jan Blomqvist and Jonas Blue were each shown once, and Trevor Noah merged to 25–29 Nov. No Ticketmaster key gave 503; a bad key gave 31 curated events with a 5-min cache. Date formatter unit check: 9 cases. Headless Edge with a fixture at 2560×1300 → 360×740 (ten sizes) with and without data: 0 overlaps, 0 spill, 0 page errors. Next/Prev by click and Space rotate batches. `wrangler deploy --dry-run` bundles the JSON import.
- Production (`c2aec6f`): the new `?v=15` was live after about 30 s, and `/api/gigs` returns the same 65 events. The first responses were cached while photo lookups were still pending (19 without a photo); they fill in once the cache expires. The edge serves cache hits with `Cache-Control: max-age=14400`, not the Worker's 300/3600, which looks like a zone Browser Cache TTL setting. Visitors may therefore keep an older list for up to 4 h. Fixed later the same day: Browser Cache TTL is now "Respect Existing Headers".
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
