# Victory Road — build record

Living record of the Victory Road build (spec: [`victory-road-master-prompt.md`](victory-road-master-prompt.md)). Owner: Claude. Update this file with every phase.

## Milind's decisions (2026-10-07)

| Question | Decision |
|---|---|
| Pokémon pool | Every Pokémon, Gen I–IX, labelled as a fan project |
| Sprites | PokeAPI sprites, self-hosted, under a fan-project disclaimer |
| Battle format | Doubles, bring 6 pick 4 (faithful to Worlds 2026, Regulation M-B) |
| Hardest modifier | **Level Cap 45**: the player's team is Lv 45, the champion stays Lv 50 (at Worlds everyone is Lv 50). Labelled as a Victory Road rule |
| No Potions | Kept. The normal game gets a small bag (2 Potions) usable in place of a move; No Potions removes it |
| Engine / audio | Pokémon Showdown simulator (MIT, `sim/` only); original audio synthesised in the browser |
| Pushing | Push each finished phase; the Projects card and Home extra stay "Coming soon" until the whole game passes acceptance. `?vr` in the URL switches them on for testing |

## Phase 0 findings (2026-10-07)

**Champion (official):** Takuma Yamazaki, Japan, 2026 VGC Masters World Champion; Regulation Set M-B; battles in Pokémon Champions. Official open team sheet ([pokemon.com](https://www.pokemon.com/uk/play-pokemon/worlds/2026/vgc-masters)):

| Pokémon | Item | Ability | Nature | Moves |
|---|---|---|---|---|
| Floette (Eternal Flower) | Floettite | Flower Veil | Timid | Moonblast, Dazzling Gleam, Light of Ruin, Protect |
| Basculegion | Life Orb | Adaptability | Adamant | Wave Crash, Last Respects, Aqua Jet, Protect |
| Kingambit | Chople Berry | Defiant | Adamant | Sucker Punch, Kowtow Cleave, Low Kick, Iron Head |
| Dragonite | Dragoninite | Multiscale | Modest | Dragon Pulse, Heat Wave, Extreme Speed, Protect |
| Garchomp | Choice Scarf | Rough Skin | Adamant | Dragon Claw, Stomping Tantrum, Earthquake, Rock Slide |
| Sneasler | Focus Sash | Poison Touch | Jolly | Close Combat, Dire Claw, Fake Out, Feint |

**Community reconstruction (label as such):** stat points from [ChampionsDex community-mb861](https://www.championsdex.app/teams/community-mb861) — Dragonite HP 2 / SpA 32 / Spe 32; Floette HP 4 / Def 8 / SpA 32 / Spe 22; Basculegion HP 4 / Atk 18 / Def 4 / SpD 15 / Spe 25; Sneasler HP 2 / Atk 32 / Spe 32; Kingambit HP 32 / Atk 15 / SpD 19; Garchomp HP 10 / Atk 20 / Def 9 / Spe 27. IVs are not published; assume 31 (documented assumption).

**Rules (Reg M-B):** doubles, bring 6 pick 4, team preview, all Pokémon set to Lv 50, one Mega Evolution per battle chosen by the player, Mega Stone required, 66 stat points (max 32 per stat), Item Clause. Sources: [Serebii](https://www.serebii.net/pokemonchampions/rankedbattle/regulationm-b.shtml), [ChampDex format rules](https://champdex.com/guides/format-rules). His team carries two Mega Stones, so the AI chooses one Mega per battle.

**Simulator:** Pokémon Showdown master (checked at `c046106c`, 2026-10-06) has `[Gen 9 Champions] VGC 2026 Reg M-B` (`mod: 'championsregmb'`, doubles, Flat Rules, Open Team Sheets) with all six species, both Megas and both stones, and the Champions stat-point formula. `Level Clause Mod` allows levels other than 50 (needed for Level Cap 45); `NatDex Mod` lets Champions mechanics accept species outside the Champions roster (needed for an all-Gen pool). Measured cost: ~440 KB gzipped for `sim/` + core data + Champions mods; full learnsets add ~380 KB (only for Random Moves; a trimmed derived table will be smaller). Loaded only when a battle starts. The Showdown *client* (AGPL) is not used.

**Known gaps (handled by design, not hidden):** no bag-item action in the simulator (Potions need custom engine work, Phase 2/4); player Pokémon outside the Reg M-B roster battle under a custom format (Champions mechanics, all species) — not tournament-legal, labelled as such; player sets come from Showdown's random-battle set data where available.

## Phase status

| Phase | Status |
|---|---|
| 0 Discovery and architecture | Done 2026-10-07 (above) |
| 1 Setup experience | Done 2026-10-07 — see below |
| 2 Battle engine vertical slice | Next |
| 3 Champion fidelity | — |
| 4 Catalog integration + modifier behaviour | — |
| 5 Presentation, audio, accessibility polish | — |
| 6 Hardening and release | — |

## Phase 1 — setup experience (2026-10-07)

- **Data:** `scripts/vr/build-dex.mjs <showdown checkout>` writes `public/vr/dex.json` (1,127 pickable entries: all 1,025 species + 102 alternate forms that change stats/types/abilities, e.g. regional forms, Rotom appliances, Therian forms, Floette-Eternal; 118 battle-only forms such as Megas for later) and downloads front/back/shiny/back-shiny sprites to `public/assets/vr/sprites/` (4,976 files, 5.0 MB; only Zygarde-Mega has none and falls back to Zygarde). `dex.json` is 71 KB (18 KB gzipped). Notices: `public/vr/NOTICE.md`.
- **Loading:** nothing loads with the page. The first time the window opens, `ui-v2.js` (`loadVictoryRoad`) adds `/vr/vr.css`, `/vr/vr-core.js`, `/vr/vr-setup.js` (version `VR_VERSION`), which fetch `dex.json`. Pool sprites use `loading="lazy"` (about 100 of 1,127 load on open).
- **`vr-core.js`** (pure, also `require`-able by tests): `MODS` (ordered least → most reward), `multiplier` (compounding; all nine ×6.724), `tier`, seeded `rng` (mulberry32), Fisher-Yates `shuffle`, `rollTeam` (six, Species Clause by dex number), `eligible`, `moveSlot`, `addToTeam`, `modNotes`, `serialize`/`restore` (storage key `pdosVictoryRoad`, migrates `pdosChampionRun`).
- **`vr-setup.js`:** pool with sprites, name, dex number, generation and form; search by name or number; one-gen / cross-gen chips. Team: six slots with a bobbing sprite, slot number, a red pixel X in a pixel circle (`Remove X from slot N`), and a grip. Reorder by pointer drag on the grip (mouse/touch/pen, ghost + green target outline) or keyboard (Space lifts, arrows move, Space drops, Escape cancels without closing the window); every change is announced in an assertive live region. Random Team: six bobbing yellow pixel "?" (`Hidden random Pokémon, slot N`), pool locked, Reroll; the team lives only in memory (never in DOM, storage, labels or console) and is rerolled after a reload. Enter Battle needs exactly six; for now it says the battle arrives in the next build.
- **Modifiers:** All shiny ×1.00, Trainer taunts ×1.00, Random held items ×1.10, Chaotic replacement ×1.15, No switching ×1.20, No potions ×1.25, Random team ×1.35, Random moves ×1.50, Level cap 45 ×1.75. Only All shiny (team sprites) and Random team have visible effects yet; the rest take effect in the battle phases.
- **Tests:** `node --test tests/vr/*.test.mjs` — 11 unit tests (order, compounding, tiers, full pool, unique seeded random teams, unbiased shuffle, reorder never loses a Pokémon, Species Clause, hidden team never stored, storage validation + migration). Browser (headless Edge, `?vr`): no `/vr/` request before opening; 1,127 pool cards with ~100 sprites loaded; add six via search; seventh refused; slot body click doesn't remove; drag slot 4 → 1; keyboard move; Escape cancels and keeps the window open; order persists after reload; X removes; random team shows six "?", no species name anywhere in the team markup or status, generic labels, nothing in storage, ×1.35; no horizontal overflow; no page errors — at 1440×900, 1366×657, 1280×720, 390×844, 360×740.
- **Found and fixed while testing:** the sprite layer covered the grip and X (z-index); `[hidden]` pool cards stayed visible (display override); the team box squeezed the modifiers on short screens.
