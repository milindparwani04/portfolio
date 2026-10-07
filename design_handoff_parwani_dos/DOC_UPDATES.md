# Paste-in updates for the living docs

Add these when you commit `design_handoff_parwani_dos/`. They follow CLAUDE.md: every push updates the living docs in the same commit.

## docs/session-handoff.md — Session Log entry
**2026-10-07 — Parwani-DOS redesign handed off (design only, no code changes).** Interactive HTML reference plus spec in `design_handoff_parwani_dos/`. The site becomes a single scroll-snapped "desktop OS" page with a themed top bar (Mono / Paper / Night), a CRT section transition, overlay windows for projects and tools, pixel hover icons, and Champion Run as a featured cartridge. The font changes to Pixelify Sans with a custom C/c override (`fonts/PixC-*.otf`). **Blocked on rulebook §3 (design lock):** Milind needs to approve the new design rule before Phase 1.

## docs/requirements-tracker.md — new rows (status: Spec ready / Blocked on §3 sign-off)
- R-DOS-1 Theme tokens + top bar + theme switcher (persisted)
- R-DOS-2 Scroll-snap shell, CRT transition, 1–7 / Esc keys, reduced-motion fallback
- R-DOS-3 Home tiles, extras, headline auto-fit
- R-DOS-4 Journal list/detail with scroll-to-top on switch
- R-DOS-5 Projects grid + overlay windows + scroll lock
- R-DOS-6 Champion Run setup window (pool modes, gens, team of 6, modifiers, reward tiers)
- R-DOS-7 Toolbox sliding panel
- R-DOS-8 Media / Playlists / Gigs restyle
- R-DOS-9 Pixel icon sprites (Poké Ball, safe, terminal, bulb, skyline, globe, EQ, book, whiteboard, toolbox, projector, Spotify mark, guitar fire)
- R-DOS-10 Accessibility and Lighthouse pass for all three themes

## docs/claude-agent-handoff.md — current assignment
Implement the Parwani-DOS redesign from `design_handoff_parwani_dos/README.md`, one phase at a time (9 phases listed there). Start only after Milind confirms the §3 design-rule change. Use surgical edits to `public/index.html`, `public/ui-v2.css` and `public/ui-v2.js`. Reuse the existing Worker data endpoints, which are unchanged, so `security-handoff.md` needs no update.

## docs/agent-rulebook.md — for Milind only
The rulebook is static, so this change is for Milind alone to make. Proposed replacement for the "Design is locked" bullet:
> **Design is locked: Parwani-DOS.** Pixelify Sans (+ PixC C/c override). Themes Mono / Paper / Night. Greyscale surfaces; colour only on hover fills, window title bars, status colours and pixel icons. Windows over pages, never new pages. Do not change confirmed design elements unless Milind raises them.
