# Victory Road — Master Implementation Prompt

> **Handoff authority for the next implementation agent.** This document translates Milind's 2026-10-07 Victory Road brief into a phased, research-backed implementation assignment. Read the repository handoffs and rulebook before acting. Victory Road remains disabled and marked "Coming soon" until the complete experience passes its acceptance criteria.

## Master prompt

You are the senior technical lead responsible for turning the existing **Victory Road** prototype in Milind Parwani's portfolio into a polished, production-quality, browser-based Pokémon battle experience.

This is implementation work in the existing repository, not a greenfield redesign.

### Repository and required reading

Repository: <https://github.com/milindparwani04/portfolio>

Before proposing or changing anything:

1. Pull the latest `main` branch and run `git status`.
2. Read, in order:
   - `docs/session-handoff.md`
   - `docs/agent-rulebook.md`
   - `docs/requirements-tracker.md`
   - `docs/security-handoff.md`
   - your own agent handoff
   - `design_handoff_parwani_dos/README.md`
3. Inspect the current Victory Road implementation in:
   - `public/index.html`
   - `public/ui-v2.css`
   - `public/ui-v2.js`
   - `public/pdos-icons.js`
4. Preserve unrelated work and any uncommitted changes.
5. Do not push or deploy unless Milind explicitly asks. Every eventual push must include the handoff/tracker updates required by the rulebook.

### Current state

Victory Road was previously called Champion Run. The existing implementation already contains:

- A disabled "Coming soon" project card and Home extra.
- An existing setup window matching the Parwani-DOS interface.
- Single-generation and cross-generation pool modes.
- Generation I–IX selectors.
- A small placeholder Pokémon dataset.
- Six team slots.
- Five existing modifiers.
- Reward multipliers and reward tiers.
- Setup persistence under the legacy `localStorage` key `pdosChampionRun`.
- An Enter Battle button that currently only reports that the battle is not built.

Do not throw this away or redesign the surrounding site. Extend it surgically and preserve the locked Parwani-DOS design language:

- Pixelify Sans with the PixC override.
- Mono, Paper, and Night themes.
- Existing panel proportions, title bars, colors, spacing, overlays, and focus behavior.
- Color used primarily for hover states, title bars, status, and pixel graphics.
- Victory Road remains a window over the Projects section, not a separate portfolio page.
- Increment the existing CSS/JS cache-bust query versions whenever those files change.

### Product goal

Create an enterprise-quality, single-player browser battle experience that feels like a lovingly made classic handheld monster-battling game while remaining part of Parwani-DOS.

It must not literally embed or emulate a commercial ROM. It is an original browser battle interface and rules simulation.

The user should:

1. Open Victory Road.
2. Build or randomize a team of exactly six Pokémon.
3. Configure modifiers.
4. Press Enter Battle.
5. See a short cartridge/boot sequence inside the existing window.
6. Enter a classic pixel battle presentation.
7. Fight the 2026 Pokémon VGC Masters world champion, Takuma Yamazaki.
8. Win, lose, retry, or exit.
9. Lose all active battle progress on reload or tab close. No accounts, cloud saves, save states, or resumable battles are needed.

The setup may remain in `localStorage`, but the active encounter must be memory-only and reset when the page reloads.

### Research requirements

Do not rely on memory for Pokémon mechanics or tournament facts. Verify them with current sources and record links in the handoff.

The authoritative opponent is:

- Trainer: Takuma Yamazaki, Japan.
- Achievement: 2026 Pokémon VGC Masters Division world champion.
- Game/rules context: Pokémon Champions, Regulation Set M-B.
- Registered team:
  - Floette, Eternal Flower form.
  - Basculegion, male.
  - Kingambit.
  - Dragonite.
  - Garchomp.
  - Sneasler.

Official sources:

- <https://championships.pokemon.com/en-us/events/worlds/2026/san-francisco>
- <https://www.pokemon.com/uk/play-pokemon/worlds/2026/vgc-masters>

A publicly documented replica/open-team-sheet source may be used for items, abilities, natures, moves, and other public details, but distinguish official facts from community reconstruction:

- <https://www.championsdex.app/teams/community-mb861>
- <https://victoryroad.pro/champions-replica/>

Never fabricate hidden IVs, EVs, AI tendencies, or personal traits and present them as factual. If exact hidden information is unavailable, use an explicitly documented deterministic assumption.

Verify Regulation M-B mechanics, including:

- Whether battles are doubles and how many Pokémon are brought.
- Team preview behavior.
- Mega Evolution availability and limits.
- The precise Mega forms used by the winning team.
- Level normalization.
- Target selection.
- Switching and forced replacement rules.
- All abilities, items, moves, priority interactions, spread moves, and status effects needed by the champion's team.

The visual presentation can evoke FireRed-era handheld games, but the battle rules should follow the verified 2026 competitive context unless a documented product decision deliberately simplifies them.

### Pokémon pool and sprites

Replace the tiny placeholder DEX with a complete, data-driven Generation I–IX catalog.

"All Pokémon" means every standard species in the current nine-generation National Dex, plus battle-relevant forms required for this experience. Do not flood the DOM with every asset simultaneously.

Requirements:

- Data-driven manifest with stable IDs, species name, generation, form, sprite paths, shiny paths, and battle-data availability.
- Search and/or efficient filtering if needed to keep a full National Dex usable.
- Lazy-load sprites.
- Use `loading="lazy"` and `decoding="async"` where applicable.
- Use `image-rendering: pixelated`.
- Reserve dimensions to prevent layout shift.
- Provide a deliberate fallback for a missing sprite.
- Preserve accessible names independent of the artwork.
- Do not depend on hundreds of live PokéAPI calls at runtime.
- Prefer a version-pinned, build-time manifest and approved/self-hosted assets.
- Keep asset size and first-load performance within the portfolio's existing Lighthouse budget.

The PokéAPI sprite repository is a possible source, but its own licence file states that image contents remain copyright The Pokémon Company. Treat Pokémon sprites, character likenesses, music, names, and branding as third-party IP requiring deliberate review:

- <https://github.com/PokeAPI/sprites>
- <https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt>

Do not silently scrape or commit a huge third-party asset collection. First produce an asset inventory covering source, licence/rights status, attribution, number of files, and download weight.

### Setup UI

Pokémon cards in the pool must show pixel sprites, name, and generation/form information.

When selected, a Pokémon enters the next open team slot. Each occupied team slot must contain:

- Pixel sprite.
- Pokémon name.
- Slot number.
- A small red pixel X inside a pixelated circle at the upper-right.
- An accessible remove-button label such as "Remove Garchomp from slot 3."

The whole card must not remove the Pokémon when clicked. Removal belongs to the X control.

Team sprites should bob vertically like a floating dropped item in a voxel game:

- Use an original animation, not copied Minecraft assets or code.
- Stagger animation phases between slots.
- Add a restrained changing shadow or one-pixel vertical squash if appropriate.
- Keep the motion subtle enough that names and controls remain readable.
- Disable the movement under `prefers-reduced-motion: reduce`.

### Team reordering

Occupied team slots must be reorderable through drag and drop.

Support:

- Mouse.
- Touch/pointer input.
- Keyboard reordering.
- Visible drag handle or an equally discoverable drag affordance.
- Drag preview/ghost.
- Clear valid drop target.
- Swap or insertion behavior that never duplicates or loses a Pokémon.
- Screen-reader announcements such as "Garchomp moved from slot 4 to slot 1."
- State persistence after reorder.

Do not rely exclusively on the native HTML5 drag API because its touch behavior is inadequate. Use pointer events or a small, justified, accessible dependency.

### Random-team privacy

When Random Team is selected:

- Generate six unique eligible Pokémon.
- Lock manual pool selection.
- Do not reveal names, forms, sprites, types, generation, items, moves, or any other team identity before battle.
- Render six large yellow pixel question marks in the team slots.
- Give each question mark the same staggered bobbing animation.
- Accessible text must say "Hidden random Pokémon, slot N."
- Reroll remains available but does not reveal the result.
- Reveal the randomized Pokémon only during the battle flow at the appropriate point.

Do not leak hidden identities in DOM text, title attributes, `alt`, data attributes, accessibility names, status messages, or console output.

### Modifiers

Display modifiers from least reward contribution at the top to most contribution at the bottom.

Use this initial ordered model unless research or playtesting identifies a serious balancing problem:

1. **All Shiny — ×1.00**

   All player Pokémon use shiny sprites/forms. Cosmetic only.
2. **Trainer Taunts — ×1.00**

   After each completed player move, show a short original trainer quip in a pixel speech bubble. Cosmetic only.
3. **Random Held Items — ×1.10**

   Give each player Pokémon a compatible random held item, with no duplicate-item rule if required by the selected format.
4. **Chaotic Replacement — ×1.15**

   When one of the player's active Pokémon faints, randomly choose the replacement from the remaining eligible party instead of allowing the player to choose.
5. **No Switching — ×1.20**

   Voluntary switching is disabled. Forced replacement after fainting still works.
6. **No Potions — ×1.25**

   Bag-based healing is unavailable.
7. **Random Team — ×1.35**

   Six unique eligible Pokémon are generated and hidden during setup.
8. **Random Moves — ×1.50**

   Each Pokémon receives a legal randomized moveset under clearly documented rules. Do not assign impossible or unusable moves.
9. **Level Cap 50 — ×1.75**

   This is the hardest modifier and must appear last. Research and clearly document what makes it harder relative to the champion's levels without falsely claiming that the resulting rule was the official Worlds rule.

Continue calculating the combined multiplier consistently. Document whether multipliers are compounded or additive and add unit tests for the calculation and tier boundaries.

Modifier combinations must be validated. Resolve conflicts explicitly rather than allowing impossible battle states.

### Trainer taunts

The tone should be quick, playful, clever superhero-style battle banter, inspired by the general idea of a wisecracking comic hero but not copied from Spider-Man dialogue.

Requirements:

- Entirely original lines.
- No copyrighted quotations.
- No slurs, hate, sexual content, attacks on protected traits, or cruelty toward the player.
- No claims about Takuma Yamazaki's real personality.
- Treat the lines as fictional dialogue for the in-game opponent avatar.
- Context-aware pools for super-effective hits, misses, Protect, switching, fainting, Mega Evolution, and low HP.
- Avoid immediate repetition.
- Respect reduced motion.
- Make bubbles dismissible and prevent them from blocking battle controls.
- Taunts do not change the multiplier.

### Battle experience

Build the battle as an internal state machine, not a collection of loosely coordinated click handlers.

At minimum define:

- Booting.
- Team preview.
- Lead selection if the verified format uses it.
- Awaiting player command.
- Move selection.
- Target selection.
- AI choice.
- Turn resolution.
- Animation queue.
- Forced replacement.
- Victory.
- Defeat.
- Exit/retry.

The presentation should include:

- A short original cartridge/boot animation.
- Pixel-art battle arena.
- Player and opposing trainer introductions.
- Front/back or suitably framed Pokémon sprites.
- HP bars, status, level, and active Pokémon labels.
- Classic command menu: Fight, Pokémon, and any format-appropriate additional actions.
- Move names, type, PP if used, and target selection.
- Turn narration in pixel text boxes.
- Mega Evolution control when legal.
- Clear victory/defeat sequence.
- Retry and Exit controls.
- A Pokémon-inspired pixel border integrated with the existing Parwani-DOS window.
- Responsive phone/tablet layouts without clipping.

This must be a functional battle, not a scripted animation whose outcome is predetermined.

### Battle-engine architecture

Do not attempt to hand-code the entire nine-generation mechanics corpus without first evaluating an established simulator.

Investigate the MIT-licensed Pokémon Showdown simulator:

- <https://github.com/smogon/pokemon-showdown>
- <https://github.com/smogon/pokemon-showdown/blob/master/sim/SIMULATOR.md>

Important distinction:

- The Pokémon Showdown server/simulator is MIT licensed.
- The Pokémon Showdown client is AGPLv3 and should not be copied into this portfolio without intentionally accepting the licence obligations.
- Build an original Victory Road interface.
- Do not import the Showdown client wholesale.

Preferred architecture to investigate:

- Lazy-loaded battle bundle.
- Simulation runs locally in a Web Worker because this is single-player and no anti-cheat authority is required.
- Main thread owns rendering and accessibility.
- Worker owns deterministic battle state, AI decisions, seeded RNG, and battle events.
- Version-pinned simulator dependency or auditable vendored build with licence notices.
- Load battle code only when Enter Battle is pressed.

Before selecting this architecture, measure bundle size and confirm whether the simulator supports the required Regulation M-B data and 2026 Mega forms. If it does not, report the exact gaps. Do not disguise missing mechanics as complete fidelity.

The opponent AI must:

- Use only information it could legally know.
- Never read future RNG.
- Never select after seeing the player's hidden current-turn action.
- Make reasonable competitive choices.
- Be deterministic for a given battle seed.
- Support difficulty tuning without cheating.
- Use the champion's verified team faithfully.

### Audio

Do not ship recordings ripped from FireRed, Pokémon games, broadcasts, or commercial soundtrack releases.

Create or use properly licensed original audio that evokes classic handheld battle energy:

- Original boot sound.
- Original menu/select/confirm sounds.
- Original hit/status/victory effects.
- Original looping chiptune boss theme.
- Mute and volume controls.
- Pause audio when the page becomes hidden.
- Resume only after user interaction where browser autoplay policy requires it.
- Respect reduced-motion and user audio preferences.
- Store attribution and licence information in the repository.

If Milind later provides licensed exact audio, make it swappable through a small audio manifest rather than coupling it to gameplay code.

### Trainer art

Create an original, non-photoreal pixel avatar representing Takuma Yamazaki as the 2026 champion.

Use official event imagery only as visual research. Do not copy a photograph pixel-for-pixel, misrepresent endorsement, or invent personal characteristics. Include a small factual opponent label:

> Takuma Yamazaki · Japan · 2026 VGC Masters World Champion

Add a discreet fan-project disclaimer stating that Victory Road is unofficial and is not endorsed by Nintendo, Game Freak, Creatures, The Pokémon Company, the competitor, or Minecraft/Mojang.

### Quality requirements

- WCAG 2.1 AA.
- Full keyboard support.
- Visible focus.
- Correct dialog focus trap and focus restoration.
- Screen-reader battle narration through a controlled live region.
- `prefers-reduced-motion` support.
- No important information conveyed only through color.
- No console errors.
- No HTML injection from Pokémon data or taunt text.
- No secrets or new public API keys.
- No runtime dependency on an unreliable external service.
- Deterministic seeded tests.
- Lighthouse performance and accessibility remain at least 90.
- Memory and event listeners are cleaned up after exiting/retrying.
- Mobile layouts tested at 390×844 and 360×740.
- Desktop/tablet layouts tested at the repository's documented standard sizes.
- Battle bundle is lazy-loaded and does not materially regress the portfolio's initial page load.

### Test coverage

Add automated tests for:

- Multiplier calculation and modifier order.
- Unique random-team generation.
- No hidden-team DOM/accessibility leakage.
- Drag reorder, removal, and persistence.
- Keyboard reorder.
- Shiny asset selection and fallback.
- Random legal moves and items.
- Deterministic seeded battles.
- Damage, accuracy, priority, status, switching, fainting, replacement, items, abilities, spread moves, and Mega Evolution used by the champion team.
- AI information boundaries.
- Every pair of conflicting modifiers.
- Victory, defeat, retry, exit, reload reset, and close/reopen.
- Missing sprite/audio failure states.
- Reduced-motion behavior.
- Mobile overflow.
- Keyboard-only completion of setup and battle.

### Phased delivery

This task is too large for a single implementation pass. Follow the project rulebook.

Your first response must contain no code changes. Provide:

#### Phase 0 — Discovery and architecture

- Audit current code and state.
- Verify tournament/team/rules details.
- Produce an asset and licensing inventory.
- Evaluate Pokémon Showdown simulator feasibility and bundle cost.
- Identify unsupported mechanics.
- Propose the battle-state model and data schema.

#### Phase 1 — Complete setup experience

- Full data-driven Gen I–IX catalog.
- Pixel sprites.
- Selection/removal.
- Drag and keyboard reorder.
- Random-team concealment.
- Four new modifiers plus the revised ordering/multipliers.
- No battle yet.

#### Phase 2 — Battle-engine vertical slice

- Boot flow.
- One fully functioning representative battle.
- Worker/state/event architecture.
- Original temporary sound set.
- Deterministic tests.

#### Phase 3 — Champion fidelity

- Complete verified Takuma Yamazaki team.
- Required moves, abilities, items, Mega mechanics, doubles/format rules, and AI.
- Trainer avatar and introduction.

#### Phase 4 — Full catalog integration and modifier behavior

- Legal player loadouts.
- Random moves/items.
- Shiny handling.
- All modifier combinations.

#### Phase 5 — Presentation, audio, accessibility, and responsive polish

- Final original chiptune/SFX.
- Pixel border and animation work.
- Live-region narration.
- Reduced motion.
- Mobile/tablet layouts.

#### Phase 6 — Hardening and release preparation

- Automated regression suite.
- Lighthouse and asset-weight audit.
- Security/licence review.
- Documentation and handoff updates.
- Rollback plan.
- Re-enable the Victory Road entry points only after the complete flow passes acceptance testing.

For each phase, report:

```text
Phase: N of 6 — name
Built: exact files/functions changed
Tested: test and result
Not done / risks: honest list
Next phase: proposal — awaiting approval
```

Do not call something complete if it uses fake battle logic, placeholder Pokémon data, copied commercial music, inaccessible drag-only controls, invented championship facts, or an outcome-scripted demo.

Begin by reading the repository and returning the Phase 0 audit and proposed architecture. Do not edit files yet.

## Handoff notes

- This prompt intentionally specifies a browser battle engine rather than a ROM emulator. It preserves the requested classic experience without embedding or distributing a commercial game.
- The official 2026 results establish the champion and registered species. Community team sheets must be labelled as community sources for the finer build details.
- The simulator and asset choices remain Phase 0 decisions. No dependency or third-party artwork was added while writing this handoff.
