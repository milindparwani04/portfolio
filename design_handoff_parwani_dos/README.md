# Handoff: Parwani-DOS — portfolio redesign

## Overview
A redesign of milindparwani.com as a retro desktop "OS". It's one full-screen page that scrolls a section at a time: Home → Journal → Projects → Toolbox → Media → Playlists → Gigs. A fixed top bar holds the brand, a theme switcher, a typed command line and a clock. Projects and tools open as windows layered over the page, never as new pages. Every landing tile and project card has a pixel-art icon that animates on hover. Champion Run (the Pokémon battle project) is a featured "cartridge" with an animated pixel Poké Ball.

## About the design files
`Portfolio Scroll Mockup.dc.html` is a **design reference built in HTML**. It shows the intended look and behaviour; it is not production code to copy in. Rebuild it inside the existing site (`public/index.html`, `public/ui-v2.css`, `public/ui-v2.js`) using that site's patterns: plain HTML/CSS/JS, shared CSS variables, no new heavy dependencies. The mockup's scaling wrapper (sections drawn at 1440 wide then scaled) exists only so the mockup fits a preview pane. Build real responsive layouts instead.

## Fidelity
**High-fidelity.** Colours, type, spacing, copy, hover states and motion are final unless noted. The data shown (journal entries, projects, tools, playlists) is the live site's copy. Weather, health, Spotify, media and gig values are placeholders for the existing Worker feeds.

## ⚠ Rulebook conflict — needs Milind's sign-off before Phase 1
`docs/agent-rulebook.md` §3 says: *"Design is locked. Grayscale only, IBM Plex Mono / Sans, Anton…"*. This design changes all three:
- Font becomes **Pixelify Sans** everywhere, plus a custom C/c override (see Assets).
- Colour appears on hover fills, window title bars, status colours and pixel icons.
- Three colour themes instead of one greyscale scheme.

The rulebook is static and agents may not edit it unless Milind raises it. Milind should update §3 first, for example: "Design: Parwani-DOS. Pixelify Sans (+ PixC override). Themes Mono / Paper / Night. Greyscale surfaces; colour only on hover, title bars and icons."

---

## Global shell
- **Viewport:** `position:fixed; inset:0`. A 40px top bar, then a scroll container filling the rest.
- **Scroll container:** `overflow-y:auto; scroll-snap-type:y mandatory; scroll-behavior:smooth`. Each `<section data-sec>` is 100% of the container's height, with `scroll-snap-align:start; scroll-snap-stop:always`. Sections fill edge to edge with no margins.
- **Scroll lock:** while a project window or tool panel is open, set the container to `overflow-y:hidden` and ignore number-key and jump-link navigation. Esc closes the window and unlocks.
- **Keyboard:** keys 1–7 jump to sections; Esc closes overlays and the theme menu.
- **Top bar** (40px, 1px bottom border `--line`, 14px uppercase, letter-spacing .04em). Three-column grid, `1fr auto 1fr`:
  - Left: `■ PARWANI-DOS` (bold, jumps home), then a **Theme** button with three swatches and `Theme: <Name> +`. It opens a 240px dropdown (bg `--p1`, 1px `--fg` border, `8px 8px 0 rgba(0,0,0,.45)` hard shadow) listing Mono / Paper / Night with swatches and a `■` beside the active one.
  - Centre: `C:\PARWANI> cd <section>` with a blinking block cursor (`steps(1)`, 1s). The command types itself one character every 45ms whenever the active section changes (`cd \` for home).
  - Right (nowrap): `0N / 07 · <Section>` and a live `HH:MM` clock.
  - Removed on purpose: File / Extras / System / ⌘K (they did nothing).
- **Section transition (CRT power-on):** when a section becomes active (IntersectionObserver, threshold 0.55), animate three layers:
  - Outer: `clip-path: inset(49.7% 0 49.7% 0)` → `inset(0)` over 600ms, `steps(10)`.
  - Inner: `translateY(40px)`/opacity 0 → `0`/1 over 550ms, `cubic-bezier(.2,.8,.2,1)`, 180ms delay.
  - A 4px `--fg` line with `box-shadow:0 0 22px --fg` at 50% height: `scaleX(.12)` → `1` (320ms, `steps(4)`), then it fades out (200ms, `steps(2)`, 380ms delay).
  - Leaving reverses it, so it replays on every visit. Respect `prefers-reduced-motion` with a simple fade.
- **Scanline overlay** on every section: `repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px)`, `pointer-events:none`.
- **Window chrome:** a 30px title bar (12px uppercase, weight 500, colour fill per section, text `--on`), and a body with a 1px `--line` outline.

## Design tokens
**Type:** `font-family: 'PixC', 'Pixelify Sans', sans-serif` everywhere. Display weight 700, body 400. Common sizes: 10, 11, 12, 13, 14, 15px for UI; 22–34px for card titles; 44–104px for section titles. The landing title is fitted to its box (see Home).

**Themes** (CSS custom properties on the root):
| var | Mono | Paper | Night (default) |
|---|---|---|---|
| --bg | #070707 | #ecebe4 | #0d1020 |
| --fg | #f4f3ef | #141414 | #f3ead8 |
| --p0 | #0d0d0d | #e3e1d9 | #10142a |
| --p1 | #151515 | #dcdad1 | #151a33 |
| --p2 | #202020 | #d0cec4 | #1d2346 |
| --p3 | #262626 | #c6c4b9 | #262d57 |
| --dim | #aaa9a3 | #5c5a53 | #9a9db8 |
| --line | rgba(244,243,239,.2) | rgba(20,20,20,.18) | rgba(243,234,216,.2) |
| --ok | #1ed760 | #2fbf63 | #7ef0b0 |
| --warn | #f7c947 | #e0a526 | #ffc65c |
| --on | #070707 | #141414 | #0d1020 |

**Hover / title-bar fills** (text on top is `--on`):
- Journal `oklch(0.75 0.16 40)`
- Projects `oklch(0.72 0.16 290)`
- Toolbox `oklch(0.74 0.14 245)`
- Media `oklch(0.74 0.16 0)`
- Playlists `#1ed760`
- Gigs tile hover `#160a06` with text `#ffd43b` (dark, so the fire shows)
- Champion Run `#f7c947`
- Crack `#f4f3ef`

**Other:** gaps of 8–12px, no radii, borders 1px `--line`. The review score badge is #5b21ff with a jagged 48-point `clip-path` star, the same polygon as `.v2-score` in ui-v2.css.

## Screens
### 01 Home
- **Layout:** grid `minmax(0,1fr) 330px`, gap 10, padding 12.
- **Left column**, rows `auto / 1fr / auto`:
  - Title row, grid `1fr 380px`. "MY DIGITAL / PORTFOLIO." in display type with line-height 1 (a small gap between the lines), auto-fitted so the widest line fills the column. Beside it, an `about.txt` window with the live about copy and a three-line boot log (`[ OK ]` in `--ok`, `[ !! ]` in `--warn`).
  - Six tiles in a 3×2 grid: Journal, Projects, Toolbox, Media, Playlists, Gigs. Each tile has, top to bottom: a header (glyph + `journal.log` etc. + a key-number badge), a 34px title, a **centred animated pixel icon** in the remaining space, and a preview (10px label + 13px one-line ellipsis), above a currentColor rule. Hover fills the tile with its colour; clicking jumps to the section.
  - Extras row, two buttons (padding 8px 14px, 1px border):
    - `champion_run.cart — insert cartridge` with a bobbing Poké Ball. Hover gives a yellow border; click jumps to Projects and opens Champion Run.
    - `crack.exe — play` with a pixel safe whose door opens on hover. Click jumps to Projects and opens Crack.
- **Right column:** small windows for weather, spotify, heart and steps, then `headlines.feed`, which takes the leftover height. The headline font auto-fits from 72px down to 14px until the panel stops overflowing; the summary is about 0.36× the headline size, clamped to 12–20px. Below that, `game.sys` and `dissertation.pdf` (Read →).
- **Status bar:** `Scroll, or press 1–7 to jump · Esc closes a window`.

### 02 Journal
- A window with an orange title bar; `↑ Home` and `Projects ↓` are clickable. Grid `440px 1fr`.
- **Left:** a 96px "JOURNAL" title, a kicker, and a scrollable list of **all** entries. Each row has a 64px thumbnail, kind, tag, 22px title and status. The selected row gets bg `--p2` and an inset 3px orange left bar.
- **Right:** a 280px photo (cover, top gradient, caption at top-left, credit at bottom-right). Reviews show a 136px jagged score badge at top-right; other entries show a status chip there. Under the photo: a 48px title and a meta row, then the scrollable article body.
- Selecting an entry **resets the body scroll to top**.
- Article body text is placeholder until the posts are written.

### 03 Projects
- A purple title bar. Grid of 3 columns with rows `1fr 1fr 168px`.
- **Six cards**, each with: a header (number + tag, or a `▶ Game` chip), a centred animated icon, a 30px title, a 12px description, and a foot row above a currentColor rule.
  1. **Sounds Like + Prompt Playlist** — equaliser bars bounce (`steps(4)`).
  2. **Today Somewhere** — a dark skyline whose windows light up with a staggered delay; hover bg `oklch(0.3 0.07 265)`.
  3. **Where Next** — a pixel globe on a brass and wood stand; its land strip scrolls inside a pixel-circle `clip-path` (`steps(24)`).
  4. **Speed Round** ▶ Game — a bulb goes from dim to on, with a glow and rays.
  5. **Untitled Terminal Adventure** ▶ Game — a monitor's blinking prompt switches to scrolling green/yellow code lines.
  6. **Crack** ▶ Game — a safe door rotates open (`perspective rotateY(-80deg)`, `steps(4)`) showing gold bars.
- **Champion Run full-width card:** a 6px-grid Poké Ball beside a 62px two-line "CHAMPION / RUN" wordmark, the description, modifier chips, and `Insert cartridge ▸`.
- **Every card opens a window over the grid** (backdrop rgba(0,0,0,.6), 14px hard shadow, ✕ or Esc to close):
  - Generic projects: a 780px window showing the title, description and a placeholder area where the project runs.
  - Champion Run: a near-full-size window containing:
    - Header: Poké Ball and pixel wordmark, plus the reward multiplier and its tier.
    - Pool: a One generation / Cross-generation toggle, Gen I–IX chips, and a pool grid.
    - Team: 6 slots.
    - Modifiers, each with its multiplier: Random team (all gens) ×1.4 (locks the pool, adds Reroll), Random moves ×1.5, No potions ×1.3, Level cap 50 ×1.2, No switching ×1.25.
    - Tiers: Bronze ≥1, Silver ≥1.75, Gold ≥2.5, Master ≥4.
    - An `Enter battle` CTA.

### 04 Toolbox
- A blue title bar. Closed state: the 3×3 tool grid fills the full width under a 76px heading. Unavailable tools sit at 50% opacity.
- **Opening a tool:** the grid's flex item shrinks while a 520px panel grows from 0 (`width .55s cubic-bezier(.7,0,.2,1)`). The panel's content slides in from `translateX(80px)` and fades in.
- Tool bodies:
  - Tempo Tap: works. BPM is averaged over the last 8 taps, and a gap over 2.5s resets.
  - Password Generator: lengths 12, 16 or 24, with a regenerate button.
  - Image Converter and Audio Trimmer: drop zones.
  - Key/BPM Lookup and QR Code Generator: an input plus an output area.
  - Unfinished tools: a "Still being built" message.
- ✕ closes the panel.

### 05 Media, 06 Playlists, 07 Gigs
These keep the current site's content and behaviour (batch carousels of 5, auto-advance every 10 seconds, hover pauses), restyled as windows with pink, green and yellow title bars.
- **Playlists:** 3 cards (cover, name, "Playlist on Spotify.", `Open on Spotify ↗`), with the text block 18px above the card bottom. Beside them, "Top this month" with a Tracks/Artists toggle, 5 rows with bars, and a now-playing strip.

## Pixel icons
Every icon is built from square cells on an integer grid (`P` px per cell). Transitions use `steps()`. Build them as `<canvas>` sprites or small CSS-grid / box-shadow sprites. Exact grids are in the mockup's logic (`BALL`, `SAFE`, `MON`, `BULB`, `BOOK_C/O`, `TB_*`, `MAP`, and the generators for the skyline, globe, board, projector, Spotify mark and guitar).
- **Poké Ball:** 14×14. It bobs constantly: `translateY(0 → -16%)`, 1.6s ease-in-out, with the shadow shrinking to `scaleX(.62)` in sync. On hover the top half hinges open (`rotate(-30deg)`, `steps(3)`) and a yellow glow appears. It has a 1-cell `--fg` rim made from four drop-shadows. It sits centred in its frame, so the bob never crosses a border.
- **Landing icons:**
  - Book: a closed red book flips to an open one, then the writing lines fill in one cell at a time.
  - Whiteboard: a pie chart, bar chart and formula are revealed by `clip-path` from left to right, `steps(13)`.
  - Toolbox: the red lid swings open and a wrench and screwdriver rise out.
  - Projector: the reels spin, the lens and LED light up, and a flickering beam appears.
  - Spotify mark: symmetric 16×16; it goes from dim green to bright `#1ed760` with a pulsing glow.
  - Electric guitar: a diagonal 24×25 grid. On hover the guitar shakes and a "special move" fire aura appears: three flame frames cycling every 0.33s with `steps(1)`, colours #fff6c2 / #ffd43b / #ff8a1a / #ff3b1f, a pulsing radial glow behind and rising sparks.

## State
- `scheme`: mono | paper | night; persist it in localStorage.
- `activeSection`: driven by the IntersectionObserver.
- `cmd`: the typer text.
- `openProject`: null | key. `openTool`: null | index. Both lock scrolling.
- `journalIndex`: the selected entry.
- `hover`: per icon.
- Champion Run: `mode`, `gen`, `gens[]`, `team[]` (up to 6), `mods{}`.
- Tempo Tap: `taps[]`. Password Generator: `length` and the generated value.

## Assets
- `fonts/PixC-400.otf` and `fonts/PixC-700.otf`: custom C and c glyphs only, built to match Pixelify Sans' pixel grid (its own C is the O with a 1-pixel notch). Load them with:
  ```css
  @font-face{font-family:'PixC';src:url(fonts/PixC-400.otf);font-weight:400 599;unicode-range:U+0043,U+0063}
  @font-face{font-family:'PixC';src:url(fonts/PixC-700.otf);font-weight:600 900;unicode-range:U+0043,U+0063}
  ```
  Then list 'PixC' before 'Pixelify Sans'. Consider converting them to woff2.
- Pixelify Sans comes from Google Fonts (`wght@400..700`).
- Journal photos are the existing `public/assets/journal/*`, with their Wikimedia credits.
- All icons are code-drawn; no image files.
- The Poké Ball and Pokémon names are used for a personal fan project; keep official artwork out.

## Files
- `Portfolio Scroll Mockup.dc.html`: the full interactive reference. Open it in a browser alongside `support.js`.
- `fonts/`: the PixC override fonts.

## Suggested phases (per rulebook §2)
1. Theme tokens, top bar, scroll-snap shell, CRT transition, keyboard support, reduced-motion.
2. Home: tiles, extras, widgets wired to the existing Worker data, headline auto-fit.
3. Journal: list, detail, scroll-to-top.
4. Projects: grid, overlay windows, scroll lock.
5. Champion Run window: setup state only; the battle itself is a later spec.
6. Toolbox: sliding panel; move the existing tool logic into the panel.
7. Media / Playlists / Gigs restyle.
8. Pixel icon sprites and hover animations.
9. Accessibility (WCAG AA contrast per theme, focus states, aria on windows) and Lighthouse budget.
