# Prompt for Claude Code

Paste this into Claude Code from the root of `milindparwani04/portfolio`, with this folder copied into the repo as `design_handoff_parwani_dos/`.

---

Implement the "Parwani-DOS" redesign of milindparwani.com. The full spec and an interactive HTML reference are in `design_handoff_parwani_dos/`:
- `README.md`: the spec
- `DOC_UPDATES.md`: entries for the living docs
- `Portfolio Scroll Mockup.dc.html`: open it in a browser next to `support.js`
- `fonts/PixC-*.otf`: the C/c override fonts

Rebuild it in the existing `public/index.html`, `public/ui-v2.css` and `public/ui-v2.js`. Don't ship the mockup HTML itself.

**Before anything else:** I'm replacing the "Design is locked" bullet in `docs/agent-rulebook.md` §3 with the wording in DOC_UPDATES.md. Treat that as approved. Follow the rest of the rulebook: work in phases, use surgical edits, test before reporting, and update the living docs in the same commit.

**What the site becomes:**
- A single full-screen page that scrolls one section at a time: Home → Journal → Projects → Toolbox → Media → Playlists → Gigs. Sections fill edge to edge, with no side navigation rail.
- Keys 1–7 jump to sections. Landing tiles also jump to their section. Esc closes any open window.
- **Fixed top bar:**
  - Left: "■ PARWANI-DOS" (goes to Home) and a Theme dropdown with Mono / Paper / Night, saved in localStorage. Night is the default.
  - Centre: a command line that types `cd <section>` whenever the section changes.
  - Right: "0N / 07 · Section" and a live clock.
  - No File / Extras / System / ⌘K.
- **Section transition:** a CRT power-on effect. The section starts as a thin bright line that opens to full height in pixel steps, then the content slides up. It replays on every visit. Provide a reduced-motion fallback.
- **Font:** Pixelify Sans everywhere. Load the PixC override fonts first, restricted to the C and c characters, because Pixelify's own C looks like an O.
- **Themes:** the token table is in the README. Surfaces stay greyscale; colour appears only on hover fills, window title bars, status colours and the pixel icons.
- **Windows, not pages:** projects and tools always open as windows over the page. While one is open, scrolling and jump navigation are locked until it's closed.

**Sections:**
- **Home:**
  - A "MY DIGITAL / PORTFOLIO." title auto-fitted to its width, with a small gap between the two lines, beside an `about.txt` window and a short boot log.
  - Six tiles, each with a title, a centred animated pixel icon, and a one-line preview:
    - Journal: a book that opens, then lines of writing fill in.
    - Projects: a whiteboard where a pie chart, bar chart and formula are drawn on.
    - Toolbox: a red toolbox whose lid opens to show tools.
    - Media: a projector whose reels spin and beam lights up.
    - Playlists: a symmetric Spotify mark that glows.
    - Gigs: a diagonal electric guitar with a fighting-game "special move" fire aura (flickering three-frame flames, a pulsing glow, a shake). The Gigs tile turns dark on hover.
  - Extras buttons:
    - Champion Run, with a bobbing pixel Poké Ball that opens on hover and stays centred. Clicking opens the Champion Run window in Projects.
    - Crack, with a pixel safe that opens on hover. Clicking opens the Crack window in Projects.
  - Right column: weather, Spotify, heart rate and steps widgets; a headlines panel whose headline auto-fits the space with a summary underneath; the last game played; and the dissertation link.
- **Journal:**
  - Left: a list of all entries.
  - Right: a smaller photo with the large jagged score badge in the top corner for reviews. The title stays fixed under the photo and the article body scrolls.
  - Switching entries resets the article scroll to the top.
- **Projects:** two rows of three cards, then a full-width Champion Run card using the pixel-lockup logo. Each card has a hover-animated pixel icon:
  - Sounds Like + Prompt Playlist (merged into one card): bouncing equaliser bars.
  - Today Somewhere: a dark skyline whose windows light up.
  - Where Next: a globe on a stand that spins.
  - Speed Round: a bulb that turns on.
  - Untitled Terminal Adventure: a terminal with code scrolling.
  - Crack: a safe that opens.
  - The last three, plus Champion Run, are tagged "▶ Game".
- **Champion Run window:**
  - Pool: one generation or cross-generation, plus Gen I–IX chips.
  - Team: up to 6.
  - Modifiers and multipliers:
    - Random team (all gens) ×1.4. This locks the pool and adds Reroll.
    - Random moves ×1.5
    - No potions ×1.3
    - Level cap 50 ×1.2
    - No switching ×1.25
  - Reward tiers: Bronze, Silver, Gold, Master.
  - The battle itself is out of scope for now. No official Pokémon artwork.
- **Toolbox:**
  - Closed state: a full-width 3×3 grid; hovering a tile fills it with colour.
  - Clicking a tool shrinks the grid and slides a 520px panel in from the right.
  - Tempo Tap and Password Generator work. The upload tools show drop zones, and unfinished tools say "Still being built".
- **Media, Playlists, Gigs:**
  - Keep the current content and carousels, restyled as windows.
  - Playlist card text sits slightly above the card bottom.

**Process:** propose the 9-phase plan from the README, then deliver one phase per turn. Use the existing Worker endpoints unchanged. Paste the entries in DOC_UPDATES.md into `session-handoff.md`, `requirements-tracker.md` and `claude-agent-handoff.md` in the first commit.
