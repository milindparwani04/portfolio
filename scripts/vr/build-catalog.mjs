// The Very Best: builds the member-editor catalogs from the shipped engine bundle and a pinned
// Pokémon Showdown checkout (MIT).
//
// Usage: node scripts/vr/build-catalog.mjs <pokemon-showdown checkout>   (after build-dex + build-sim)
//
// Writes:
//   public/vr/species.json    base stats, legal abilities and classification (legendary / mythical /
//                             ultra beast / paradox) for every pool entry, plus ability descriptions
//   public/vr/learnsets.json  every move a pool entry can legally learn under this game's ruleset,
//                             and a move catalog (type, category, power, accuracy, PP, priority,
//                             target, description) with the engine's own numbers
//   public/vr/items.json      held items with descriptions and who can hold them
//
// Game data (stats, PP, tags, item users) is read from public/vr/vr-engine.js itself, so the editor
// shows exactly what the battle engine will use. Learnsets and English descriptions come from the
// checkout (data/learnsets.ts, data/text/*.ts), which build-sim.mjs pins to the same commit.
//
// Learnset rule (custom ruleset, documented in docs/victory-road-build.md): a move is legal when
// the species, an earlier evolution, or the form it extends learns it by any method in any
// generation (level-up, TM/TR, egg, tutor, event, transfer). Event-only combinations are not
// cross-checked. Smeargle may Sketch any sketchable move. Z-Moves, Max Moves and moves from
// non-standard data sets (CAP, Let's Go-only, custom) are excluded.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [psArg] = process.argv.slice(2);
if (!psArg) { console.error('Usage: node scripts/vr/build-catalog.mjs <pokemon-showdown checkout>'); process.exit(1); }
const PS = path.resolve(psArg);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Same pin as build-sim.mjs (read from its source: importing it would run that build).
const SHOWDOWN_COMMIT = /SHOWDOWN_COMMIT = '([0-9a-f]{40})'/.exec(fs.readFileSync(path.join(repo, 'scripts/vr/build-sim.mjs'), 'utf8'))[1];
const head = execSync('git rev-parse HEAD', { cwd: PS }).toString().trim();
if (head !== SHOWDOWN_COMMIT) { console.error(`Showdown checkout is at ${head}; expected ${SHOWDOWN_COMMIT}.`); process.exit(1); }
const load = async (rel, name) => (await import(pathToFileURL(path.join(PS, rel)).href))[name];
const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// The engine bundle, as the browser runs it.
const code = fs.readFileSync(path.join(repo, 'public/vr/vr-engine.js'), 'utf8');
const self = {};
const context = vm.createContext({ self, console, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, DataView, Math, JSON, Date, Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet, Symbol, Promise, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, isFinite, BigInt, setTimeout, clearTimeout, queueMicrotask });
context.globalThis = context;
vm.runInContext(code, context);
const E = self.VREngine;
const D = E.Dex.forFormat(E.FORMAT_ID);

const Learnsets = await load('data/learnsets.ts', 'Learnsets');
const MovesText = await load('data/text/moves.ts', 'MovesText');
const ItemsText = await load('data/text/items.ts', 'ItemsText');
const AbilitiesText = await load('data/text/abilities.ts', 'AbilitiesText');
const dex = JSON.parse(fs.readFileSync(path.join(repo, 'public/vr/dex.json'), 'utf8'));

const text = (table, id) => {
  const t = table[id];
  return t ? (t.shortDesc || t.desc || '').replace(/\s+/g, ' ').trim() : '';
};

// --- Moves
const EXCLUDED_SETS = new Set(['CAP', 'Custom', 'LGPE', 'Gmax', 'Unobtainable', 'Future']);
const moveOk = (id) => {
  const m = D.moves.get(id);
  return m.exists && id !== 'struggle' && id !== 'potion' && !m.isZ && !m.isMax && !EXCLUDED_SETS.has(m.isNonstandard);
};
// Champions PP: the mod caps base PP at 20 and gives (pp / 5 + 1) * 4 (scripts.ts calculatePP).
const enginePP = (m) => (m.noPPBoosts ? m.pp : (m.pp / 5 + 1) * 4);

// Showdown's learnsetParent (sim/dex-species.ts, non-Champions branch).
function parent(species) {
  if (!(Learnsets[species.id] && Learnsets[species.id].learnset) && species.forme) return D.species.get(species.changesFrom || species.baseSpecies);
  if (species.prevo) return D.species.get(species.prevo);
  if (species.changesFrom && species.baseSpecies !== 'Kyurem') return D.species.get(species.changesFrom);
  if (!species.prevo && species.baseSpecies && D.species.get(species.baseSpecies).prevo) {
    let base = D.species.get(species.baseSpecies);
    while (base.prevo) base = D.species.get(base.prevo);
    return base;
  }
  return null;
}
const sketchable = Object.keys(D.data.Moves).filter((id) => moveOk(id) && !(D.moves.get(id).flags || {}).nosketch);
function legalMoves(id) {
  const out = new Set();
  let species = D.species.get(id);
  for (let guard = 0; species && guard < 8; guard += 1) {
    const ls = Learnsets[species.id] && Learnsets[species.id].learnset;
    if (ls) Object.keys(ls).forEach((m) => out.add(m));
    species = parent(species);
  }
  if (out.has('sketch')) sketchable.forEach((m) => out.add(m));
  return [...out].filter(moveOk);
}

const moveIndex = new Map();
const moveRows = [];
const CAT = { Physical: 'P', Special: 'S', Status: '-' };
function moveRef(id) {
  if (!moveIndex.has(id)) {
    const m = D.moves.get(id);
    moveIndex.set(id, moveRows.length);
    moveRows.push([m.name, m.type, CAT[m.category], m.basePower || 0, m.accuracy === true ? 0 : m.accuracy, enginePP(m), m.priority || 0, m.target, text(MovesText, id)]);
  }
  return moveIndex.get(id);
}

// --- Species, abilities, learnsets
const abilityIndex = new Map();
const abilityRows = [];
const abilityRef = (name) => {
  const id = toId(name);
  if (!abilityIndex.has(id)) { abilityIndex.set(id, abilityRows.length); abilityRows.push([D.abilities.get(id).name, text(AbilitiesText, id)]); }
  return abilityIndex.get(id);
};
// Classification follows the base species (regional forms inherit it), from the engine's tags.
const classOf = (sp) => {
  const tags = (D.species.get(sp.baseSpecies).tags || []).concat(sp.tags || []);
  if (tags.includes('Restricted Legendary') || tags.includes('Sub-Legendary')) return 'L';
  if (tags.includes('Mythical')) return 'M';
  if (tags.includes('Ultra Beast')) return 'U';
  if (tags.includes('Paradox')) return 'P';
  return '';
};
const species = {};
const learnsets = {};
const problems = [];
for (const [id] of dex.pool) {
  const sp = D.species.get(id);
  if (!sp.exists) { problems.push(`${id}: not in engine`); continue; }
  const b = sp.baseStats;
  const abilities = [...new Set(Object.values(sp.abilities))].filter(Boolean).map(abilityRef);
  species[id] = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe, abilities, classOf(sp), sp.weightkg];
  const moves = legalMoves(id).map(moveRef).sort((x, y) => x - y);
  if (moves.length < 1) problems.push(`${id}: no legal moves`);
  // Sorted indices as base-36 gaps: about a third of the size of a plain number list.
  learnsets[id] = moves.map((n, i) => (n - (i ? moves[i - 1] : 0)).toString(36)).join('.');
}
// Moves in the default sets must be in the catalog even if a set predates this ruleset.
const sets = JSON.parse(fs.readFileSync(path.join(repo, 'public/vr/sets.json'), 'utf8')).sets;
for (const [id, row] of Object.entries(sets)) row[3].forEach((name) => { if (moveOk(toId(name))) moveRef(toId(name)); });

// --- Items: anything with a battle effect. Items whose only use is evolution, sale or a
// non-standard data set are left out; Z-Crystals and Poké Balls too.
const items = [];
for (const id of Object.keys(D.data.Items)) {
  const it = D.items.get(id);
  const desc = text(ItemsText, id);
  // 'Future' items (Mega Stones from newer data) are kept: the engine has their Mega forms.
  if (!it.exists || it.zMove || it.isPokeball || (it.isNonstandard !== 'Future' && EXCLUDED_SETS.has(it.isNonstandard)) || /No competitive use/i.test(desc) || !desc) continue;
  if (it.isGem || /^tr\d/.test(id)) continue;
  const users = it.itemUser ? it.itemUser.slice() : (it.megaStone ? [it.megaEvolves] : []);
  const kind = it.megaStone ? 'mega' : /^choice/.test(id) ? 'choice' : it.forcedForme ? 'forme' : '';
  items.push([it.name, desc, users, kind]);
}
items.sort((a, b) => a[0].localeCompare(b[0]));

const write = (file, data) => {
  const out = path.join(repo, 'public/vr', file);
  fs.writeFileSync(out, JSON.stringify(data));
  return fs.statSync(out).size;
};
const sizes = {
  species: write('species.json', { source: `Pokémon Showdown ${SHOWDOWN_COMMIT.slice(0, 8)} (MIT), via vr-engine.js`, fields: ['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'abilities', 'class L/M/U/P', 'weightkg'], species, abilities: abilityRows }),
  learnsets: write('learnsets.json', { source: `Pokémon Showdown ${SHOWDOWN_COMMIT.slice(0, 8)} learnsets (MIT)`, rule: 'any method, any generation, prevolutions and parent forms; Sketch', fields: ['name', 'type', 'category P/S/-', 'power', 'accuracy (0 = never misses)', 'pp', 'priority', 'target', 'description'], moves: moveRows, learnsets }),
  items: write('items.json', { source: `Pokémon Showdown ${SHOWDOWN_COMMIT.slice(0, 8)} (MIT)`, fields: ['name', 'description', 'only for', 'kind'], items })
};
console.log(`species ${Object.keys(species).length}, abilities ${abilityRows.length}, moves ${moveRows.length}, items ${items.length}; bytes ${JSON.stringify(sizes)}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
