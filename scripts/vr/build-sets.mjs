// Victory Road: builds public/vr/sets.json (a default battle set for every Pokémon in the pool) and
// public/vr/movepools.json (each Pokémon's usable learnable moves, for Random Moves).
//
// Usage: node scripts/vr/build-sets.mjs <pokemon-showdown checkout>   (run after build-dex.mjs)
//
// Sources, all from Pokémon Showdown (MIT): data/random-battles/gen9/doubles-sets.json (curated
// doubles movepools), gen9/sets.json (singles), learnsets.ts, moves.ts, pokedex.ts, items.ts.
// Sets are a heuristic, not competitive advice: moves come from the curated movepool when there is
// one, otherwise the strongest legal STAB + coverage attacks from the full learnset, plus Protect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [psRoot] = process.argv.slice(2);
if (!psRoot) { console.error('Usage: node scripts/vr/build-sets.mjs <pokemon-showdown checkout>'); process.exit(1); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (rel, name) => (await import(pathToFileURL(path.join(psRoot, rel)).href))[name];
const Pokedex = await load('data/pokedex.ts', 'Pokedex');
const Moves = await load('data/moves.ts', 'Moves');
const Learnsets = await load('data/learnsets.ts', 'Learnsets');
const Items = await load('data/items.ts', 'Items');
const DOUBLES = JSON.parse(fs.readFileSync(path.join(psRoot, 'data/random-battles/gen9/doubles-sets.json'), 'utf8'));
const SINGLES = JSON.parse(fs.readFileSync(path.join(psRoot, 'data/random-battles/gen9/sets.json'), 'utf8'));
const dex = JSON.parse(fs.readFileSync(path.join(repo, 'public/vr/dex.json'), 'utf8'));
const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Moves that don't work as an ordinary pick (charge/recharge turns, self-KO, OHKO, conditional or
// gimmick moves) are never chosen.
const BANNED = new Set(['struggle', 'hiddenpower', 'dreameater', 'focuspunch', 'synchronoise', 'lastresort', 'belch', 'steelroller', 'selfdestruct', 'explosion', 'mistyexplosion', 'memento', 'finalgambit', 'healingwish', 'lunardance', 'naturalgift', 'fling', 'spitup', 'swallow', 'snore', 'sleeptalk', 'present', 'magnitude', 'beatup', 'trumpcard', 'wringout', 'crushgrip', 'punishment', 'return', 'frustration', 'round', 'echoedvoice', 'furycutter', 'rollout', 'iceball', 'uproar', 'thrash', 'outrage', 'petaldance', 'ragingfury', 'bide', 'counter', 'mirrorcoat', 'metalburst', 'comeuppance', 'endeavor', 'painsplit', 'superfang', 'naturesmadness', 'ruination', 'guillotine', 'fissure', 'sheercold', 'horndrill', 'mefirst', 'copycat', 'mirrormove', 'assist', 'metronome', 'transform', 'sketch', 'celebrate', 'splash', 'holdhands', 'happyhour', 'teleport', 'shadowforce', 'phantomforce', 'futuresight', 'doomdesire', 'freezeshock', 'iceburn', 'skyattack', 'razorwind', 'solarblade', 'meteorbeam', 'electroshot']);
const GOOD_STATUS = ['protect', 'fakeout', 'followme', 'ragepowder', 'tailwind', 'trickroom', 'willowisp', 'thunderwave', 'spore', 'sleeppowder', 'icywind', 'electroweb', 'snarl', 'helpinghand', 'wideguard', 'swordsdance', 'nastyplot', 'calmmind', 'dragondance', 'quiverdance', 'recover', 'roost', 'slackoff', 'moonlight', 'synthesis', 'partingshot', 'encore', 'taunt', 'yawn', 'haze', 'reflect', 'lightscreen', 'auroraveil', 'leechseed', 'toxic', 'substitute', 'bulkup', 'shellsmash', 'irondefense', 'coil', 'shiftgear', 'victorydance', 'tidyup'];
const usable = (id) => {
  const m = Moves[id];
  if (!m || BANNED.has(id) || m.isZ || m.isMax || m.isNonstandard === 'CAP' || m.isNonstandard === 'Custom' || m.isNonstandard === 'LGPE' || m.isNonstandard === 'Unobtainable') return false;
  if (m.flags && (m.flags.charge || m.flags.recharge)) return false;
  if (m.category === 'Status') return GOOD_STATUS.includes(id);
  return m.basePower >= 40 || ['lowkick', 'grassknot', 'heavyslam', 'heatcrash', 'gyroball', 'electroball', 'lastrespects'].includes(id);
};

function learnable(id) {
  const out = new Set();
  const add = (sid) => {
    const ls = Learnsets[sid] && Learnsets[sid].learnset;
    if (ls) Object.keys(ls).forEach((m) => out.add(m));
  };
  let s = Pokedex[id];
  add(id);
  // Appliance/size forms carry only their extra moves: add the base species' list.
  if (s.baseSpecies && toId(s.baseSpecies) !== id && (!Learnsets[id] || Object.keys(Learnsets[id].learnset || {}).length < 15)) add(toId(s.baseSpecies));
  for (let guard = 0; s && s.prevo && guard < 3; guard += 1) { const p = toId(s.prevo); add(p); s = Pokedex[p]; }
  const good = [...out].filter(usable);
  // One-trick Pokémon (Ditto, Wobbuffet, Unown...) keep their own moves even if normally excluded.
  return good.length >= 2 ? good : [...out].filter((m) => Moves[m] && m !== 'struggle' && !Moves[m].isZ && !Moves[m].isMax);
}

const statsOf = (s) => s.baseStats;
function scoreMove(id, s, physical) {
  const m = Moves[id];
  if (m.category === 'Status') return 0;
  let bp = m.basePower || 60;
  if (m.multihit) bp *= Array.isArray(m.multihit) ? 3 : m.multihit;
  const acc = m.accuracy === true ? 1 : m.accuracy / 100;
  const stab = s.types.includes(m.type) ? 1.5 : 1;
  const fit = (m.category === 'Physical') === physical ? 1 : 0.55;
  const spread = m.target === 'allAdjacentFoes' ? 1.15 : m.target === 'allAdjacent' ? 0.95 : 1;
  const recoil = m.recoil ? 0.9 : 1;
  const drop = m.self && m.self.boosts ? 0.92 : 1;
  const priority = m.priority > 0 ? 1.05 : 1;
  return Math.min(bp, 150) * acc * stab * fit * spread * recoil * drop * priority;
}
function pickMoves(s, pool) {
  const st = statsOf(s);
  const physical = st.atk >= st.spa;
  const attacks = pool.filter((id) => Moves[id].category !== 'Status').map((id) => ({ id, type: Moves[id].type, s: scoreMove(id, s, physical) })).sort((a, b) => b.s - a.s);
  const chosen = [];
  const types = new Set();
  // Best attack of each STAB type first, then the best coverage of new types.
  for (const t of s.types) { const a = attacks.find((x) => x.type === t); if (a) { chosen.push(a.id); types.add(t); } }
  for (const a of attacks) { if (chosen.length >= 3) break; if (!types.has(a.type)) { chosen.push(a.id); types.add(a.type); } }
  for (const a of attacks) { if (chosen.length >= 3) break; if (!chosen.includes(a.id)) chosen.push(a.id); }
  if (pool.includes('protect')) chosen.push('protect');
  else if (pool.includes('fakeout') && !chosen.includes('fakeout')) chosen.push('fakeout');
  for (const id of [...pool.filter((p) => GOOD_STATUS.includes(p)), ...attacks.map((a) => a.id)]) { if (chosen.length >= 4) break; if (!chosen.includes(id)) chosen.push(id); }
  return chosen.slice(0, 4);
}

// Mega Stones the Reg M-B/Champions data knows, keyed by the species that holds them.
const megaStone = {};
for (const [id, item] of Object.entries(Items)) {
  if (item.megaStone && item.isNonstandard !== 'CAP') {
    const from = Array.isArray(item.itemUser) ? item.itemUser[0] : item.megaEvolves;
    if (from) (megaStone[toId(from)] ||= []).push(item.name);
  }
}
const BAD_ABILITIES = ['Truant', 'Slow Start', 'Defeatist', 'Klutz', 'Stall', 'Comatose', 'Emergency Exit', 'Wimp Out', 'Zen Mode', 'Gulp Missile', 'Ball Fetch', 'Honey Gather', 'Run Away', 'Pickup', 'Illuminate', 'Plus', 'Minus'];

const sets = {};
const pools = {};
const moveIndex = new Map();
const moveList = [];
let curated = 0;
for (const [id, , , , , , ] of dex.pool) {
  const s = Pokedex[id];
  const st = statsOf(s);
  const physical = st.atk >= st.spa;
  const pool = learnable(id);
  const set = DOUBLES[id]?.sets?.[0] || SINGLES[id]?.sets?.[0];
  let moves;
  let ability;
  if (set) {
    curated += 1;
    const mp = set.movepool.map(toId).filter((m) => Moves[m]);
    moves = pickMoves(s, mp.length >= 4 ? mp : [...new Set([...mp, ...pool])]);
    ability = set.abilities.find((a) => !BAD_ABILITIES.includes(a)) || set.abilities[0];
  } else {
    moves = pickMoves(s, pool);
    const abilities = Object.values(s.abilities);
    ability = abilities.find((a) => !BAD_ABILITIES.includes(a)) || abilities[0];
  }
  if (moves.length < 4) moves = [...moves, ...pool.filter((m) => !moves.includes(m))].slice(0, 4);
  if (!moves.length) moves = ['tackle'];
  const fast = st.spe >= 90;
  const nature = physical ? (fast ? 'Jolly' : 'Adamant') : (fast ? 'Timid' : 'Modest');
  const evs = fast ? (physical ? '2,32,0,0,0,32' : '2,0,0,32,0,32') : (physical ? '32,32,0,0,2,0' : '32,0,0,32,2,0');
  const stones = megaStone[id] || [];
  const bst = Object.values(st).reduce((a, b) => a + b, 0);
  let item = 'Sitrus Berry';
  if (stones.length) item = stones.length > 1 ? stones[physical ? 0 : 1] : stones[0];
  else if (s.evos && s.evos.length && !s.nfeIgnore) item = 'Eviolite';
  else if (bst < 420) item = 'Focus Sash';
  else if (fast) item = 'Life Orb';
  sets[id] = [ability, item, nature, moves.map((m) => Moves[m].name), evs];
  pools[id] = pool.map((m) => {
    if (!moveIndex.has(m)) { moveIndex.set(m, moveList.length); moveList.push(Moves[m].name); }
    return moveIndex.get(m);
  });
}
fs.writeFileSync(path.join(repo, 'public/vr/sets.json'), JSON.stringify({ fields: ['ability', 'item', 'nature', 'moves', 'stat points hp,atk,def,spa,spd,spe'], sets }));
fs.writeFileSync(path.join(repo, 'public/vr/movepools.json'), JSON.stringify({ moves: moveList, pools }));
console.log(`sets ${Object.keys(sets).length} (${curated} from curated movepools), movepool moves ${moveList.length}`);
