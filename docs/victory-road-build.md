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
| 2 Battle engine vertical slice | Done 2026-10-07 — see below |
| 3 Champion fidelity | Next |
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

## Phase 2 — battle engine and battle screen (2026-10-07)

- **Engine bundle:** `npm ci --prefix scripts/vr`, then `node scripts/vr/build-sim.mjs <showdown checkout>` (refuses any commit but `c046106c…`) writes `public/vr/vr-engine.js` (1.65 MB, **352 KB gzipped**), a Web Worker loaded only when a battle starts. The esbuild plugin swaps Showdown's dynamic `require`/`readdirSync` data loading for a static registry (base data + `champions` + `championsregmb`, no learnsets), stubs Node built-ins (`path` and `util.isDeepStrictEqual` get small shims), drops the random-team and text loaders, and supplies a one-format list (`scripts/vr/engine/formats.js`).
- **Format** `[Gen 9 Champions] Victory Road`: `championsregmb` mechanics, doubles, Team Preview, Picked Team Size = 4, Species Clause, Item Clause, Level Clause Mod, Endless Battle Clause. No roster rule (any Gen I–IX Pokémon) and Level Clause Mod instead of Adjust Level = 50 (identical stats at Lv 50; allows Lv 45). Teams aren't validated.
- **Runner** (`scripts/vr/engine/engine.js`): Showdown's synchronous `Battle` (not BattleStream) with `sendUpdates()` after every step; p1's channel goes to the page, p1's request after the log. Seed: our uint32 → `sodium,<hex>`; the same seed and choices replay the same battle (tested).
- **Bag:** a hidden 5th move `Potion` (id `potion`: the data key must equal the name's id), priority +6, heals 50% of max HP, targets self or partner, a shared count of 2; removed when used up or with No Potions. Choice items don't lock into it. It's a status action, so Taunt and Assault Vest block it (documented limitation).
- **Rules wired now:** No Potions, No Switching (engine refuses voluntary switches), Chaotic Replacement (engine picks the replacement, logs `|vr-chaos|`), Level Cap 45 (player Lv 45, champion Lv 50), All Shiny. Random held items, Random moves and Trainer taunts: Phase 4.
- **AI** (`scripts/vr/engine/ai.js` + `view.js`): gets only its own request and a view rebuilt from its own log channel (opponent HP as %, only revealed moves and items). Scores every legal action by estimated damage (type chart, base stats, public boosts, STAB/Adaptability, spread ×0.75, Life Orb, Multiscale, Low Kick weight, Last Respects count), KO bonuses, first-turn Fake Out, Protect when low (never twice running), recoil penalties, and a partner-hit penalty for moves like Earthquake; picks among actions within 8 points using its own seeded RNG. Team preview: Floette + Sneasler lead, back two by damage against the player's six. One Mega per battle.
- **Player sets:** `node scripts/vr/build-sets.mjs <checkout>` → `public/vr/sets.json` (1,127 sets: 485 from Showdown's curated Gen 9 doubles/singles movepools, the rest from learnsets — best STAB per type, coverage, Protect or Fake Out; Mega Stone if the species has one, Eviolite if it evolves, Focus Sash if frail, otherwise Life Orb or Sitrus Berry; 32/32/2 stat points) and `public/vr/movepools.json` (464 moves, for Random Moves). 22 KB + 43 KB gzipped.
- **Battle screen** (`public/vr/vr-battle.js`, styles in `vr.css`): boot screen → champion intro (original pixel avatar + factual label) → team preview (pick four in order) → arena (his front sprites top right, yours from behind bottom left; cream HP boxes with exact HP for yours and % for his; status tags) → narrated text box (typewriter; Enter, Space or click skips) → per-slot menus Fight (type colour, PP, Mega toggle) / Bag / Pokémon / Forfeit, target selection, forced replacement → victory or defeat with the reward tier, Battle again, Back to setup. Synthesised sounds with a Sound on/off toggle; audio suspends when the tab is hidden. A live region narrates every message. Closing the window, Exit or a reload ends the battle (worker terminated).
- **Tests:** `node --test tests/vr/*.test.mjs` — 20 pass: official team sheet, doubles + bring four, deterministic replay, at most one Mega (20 seeds), AI holds only public info, Potion heals / runs out / No Potions, No Switching + Chaotic Replacement, Level Cap 45, and a fuzz of 60 random full-pool teams battling to a result with no errors. Browser (headless Edge, `%TEMP%/pdos/vr2.js`): engine not fetched before Enter Battle; a full battle played through the UI to a result at 1440×900, 1366×657 (Level Cap + No Potions: Lv 45 shown, Bag disabled), 390×844 (Random Team revealed only at team preview) and with reduced motion; no overflow; Back to setup restores the setup; no page errors.
- **Fixed while testing:** Showdown only emits output on `sendUpdates()`; HP strings can carry a colour suffix (`20/100y`); the Potion's data key must equal its id; the AI's Floette knocked itself out with Light of Ruin recoil (recoil penalty added); short screens cropped the arena (the stage now keeps its proportions).
