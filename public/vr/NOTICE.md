# Victory Road — third-party notices

Victory Road is an unofficial, non-commercial fan project inside milindparwani.com. It is not affiliated with or endorsed by Nintendo, Game Freak, Creatures, The Pokémon Company, Takuma Yamazaki or Mojang. Pokémon, Pokémon character names and Pokémon sprites are trademarks and copyright of Nintendo, Creatures and Game Freak / The Pokémon Company.

| What | Where in the repo | Source | Licence / rights |
|---|---|---|---|
| Pokémon list (`dex.json`: names, numbers, forms, types) | `public/vr/dex.json` | Pokémon Showdown `data/pokedex.ts`, commit `c046106cbe075931b1ff8d8b800ff5be47a85f96` (2026-10-06), built by `scripts/vr/build-dex.mjs` | Showdown code and data: MIT (© Guangcong Luo and contributors). Pokémon names and data are facts about The Pokémon Company's games. |
| Pixel sprites: front, back, shiny, back-shiny for 1,245 species and forms (4,976 PNG files, 5.0 MB) | `public/assets/vr/sprites/` | PokeAPI sprites repository, `sprites/pokemon/` (fetched 2026-10-07) | The repository is CC0, but its licence states: "All image contents within are Copyright The Pokémon Company." Used here as fan use, with Milind's approval (2026-10-07). |
| Battle engine | `public/vr/vr-engine.js` | Pokémon Showdown `sim/`, `lib/streams`, `lib/utils`, `data/` (base + `champions`, `championsregmb` mods), commit `c046106cbe075931b1ff8d8b800ff5be47a85f96`, bundled by `scripts/vr/build-sim.mjs`; ts-chacha20 1.2.0 | MIT (Showdown: © Guangcong Luo and contributors; ts-chacha20: MIT). The Showdown client (AGPL) is not used. |
| Default battle sets and movepools | `public/vr/sets.json`, `public/vr/movepools.json` | Derived by `scripts/vr/build-sets.mjs` from Showdown `data/random-battles/gen9/*.json`, `learnsets.ts`, `moves.ts`, `items.ts` | MIT |
| Champion team | `scripts/vr/engine/champion.js` | Official 2026 Worlds open team sheet (pokemon.com); stat points from the ChampionsDex community reconstruction | Facts; community data credited |
| Battle sounds, pixel champion avatar, arena art | `public/vr/vr-battle.js`, `public/vr/vr.css` | Original to this site (sounds synthesised in the browser) | Site's own work |
| Pixel X, question mark, grip, bob animation, Poké Ball icon | `public/vr/vr-setup.js`, `public/vr/vr.css`, `public/pdos-icons.js` | Original to this site | Site's own work |

No Pokémon game audio, ROM data or Pokémon Showdown client code is included.
