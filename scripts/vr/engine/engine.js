// The Very Best battle runner: one Showdown Battle, the player on p1, the champion's AI on p2.
//
// createEngine(config, emit) validates the player's team, starts a battle and returns
// { choose(choice, rqid), resume(id), state() }. It throws TeamError for an invalid team.
// emit() receives, in order for each step:
//   { t: 'log', lines }            p1's channel of the battle log (what the player may see)
//   { t: 'request', request }      p1's next decision (team preview, moves, forced switch); request.rqid
//                                  must come back with the choice, so stale choices are refused
//   { t: 'escalation', id, ... }   the championship event: the battle is paused until resume(id)
//   { t: 'end', winner, champion } 'p1' | 'p2' | '' (tie); the champion's full sets, revealed after the battle
//   { t: 'error', message }        an invalid choice; the same request stands
//
// Game rules on top of Showdown (documented in docs/victory-road-build.md):
//   - Bag: `potions` Potions (heal 50% of max HP) used instead of a move, as a hidden 5th move
//     "Potion" with priority +6 (bag items act first) targeting the user or its partner. A Potion
//     is a status action, so Taunt and Assault Vest block it. No Potions sets the bag to 0.
//   - noSwitch: the player's voluntary switches are refused (forced replacements still work).
//   - chaos: when the player must replace a fainted Pokémon, the engine picks one at random.
//   - Championship escalation, exactly once per battle: when two different participating champion
//     Pokémon have fainted, at the next end-of-turn boundary (after residuals, before anyone's
//     replacement or move request is answered) the battle pauses. resume(id) revives the first
//     champion Pokémon to have fainted (REVIVE_COUNT, Milind 2026-10-10), once, at 50% of max HP (status cleared; PP, used items
//     and boosts are not restored or reset beyond what fainting already did), then re-issues fresh
//     requests. If the player has no Pokémon left at that moment, the battle has already ended and
//     the loss stands. Nothing outside the champion's four can be revived.
import { Battle, extractChannelMessages } from 'ps-sim/sim/battle';
import { Dex } from 'ps-sim/sim/dex';
import { CHAMPION, VARIANTS, TEMPLATE_VERSION, championTeam } from './champion.js';
import { createView } from './view.js';
import { createAI } from './ai.js';

export const FORMAT_ID = 'gen9championsvictoryroad';
// How many fainted champion Pokémon the championship escalation revives (first to faint first).
export const REVIVE_COUNT = 1;
const POTION = {
  num: -9001, name: 'Potion', accuracy: true, basePower: 0, category: 'Status', pp: 64, priority: 6,
  flags: {}, target: 'adjacentAllyOrSelf', type: '???', secondary: null, desc: 'Bag item',
  onTry(source) {
    if (!this.vrBag || this.vrBag.potions <= 0) {
      this.add('-fail', source, 'move: Potion', '[msg]', '[from] bag: empty');
      return null;
    }
    this.vrBag.potions -= 1;
  },
  onHit(target) {
    if (target.hp >= target.maxhp) { this.add('-fail', target, 'move: Potion', '[from] bag: full HP'); return null; }
    this.heal(Math.floor(target.maxhp / 2), target, target, this.dex.conditions.get('potion'));
  },
  onAfterMove(source) {
    // A Choice item must not lock its holder into the bag.
    if (source.volatiles.choicelock && source.volatiles.choicelock.move === 'potion') source.removeVolatile('choicelock');
  },
};

// mulberry32, matching public/vr/vr-core.js. Separate streams (from the battle seed) for the
// champion's team configuration, its strategy, chaos replacements and the simulator itself.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedString = (seed) => `sodium,${[seed, seed * 2654435761, seed ^ 0x9e3779b9, seed + 0x7f4a7c15].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('')}`;

// ---------- Team validation at the engine boundary ----------
export class TeamError extends Error {}
const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EXCLUDED_SETS = new Set(['CAP', 'Custom', 'LGPE', 'Gmax', 'Unobtainable', 'Future']);
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
// Fully evolved: no further ordinary evolution in the engine's data. Same rule as the
// fully-evolved flag in species.json (scripts/vr/build-catalog.mjs).
export const isFinal = (dex, sp) => !(sp.evos || []).some((e) => { const n = dex.species.get(e); return n.exists && !['CAP', 'Custom'].includes(n.isNonstandard); });
const SPECIAL_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'];

// learnsets: the parsed /vr/learnsets.json, or null to skip the learnset check (tests that build
// teams by hand). Everything else is checked against the engine's own data.
// options.randomTeam: the Random Team modifier's composition — exactly six, five fully evolved
// Pokémon that are neither legendary nor mythical and one fully evolved legendary or mythical.
export function validateTeam(team, dex, learnsets, options = {}) {
  if (!Array.isArray(team) || team.length < 2 || team.length > 6) throw new TeamError('A team has two to six Pokémon.');
  const nums = new Set();
  const items = new Set();
  let special = 0;
  const moveNames = learnsets ? learnsets.moves.map((m) => m[0]) : null;
  team.forEach((set, n) => {
    const where = `Pokémon ${n + 1}`;
    if (!set || typeof set !== 'object' || typeof set.species !== 'string' || set.species.length > 40) throw new TeamError(`${where}: missing species.`);
    const sp = dex.species.get(set.species);
    if (!sp.exists || sp.num <= 0 || sp.battleOnly || EXCLUDED_SETS.has(sp.isNonstandard)) throw new TeamError(`${where}: ${set.species} can't battle here.`);
    if (nums.has(sp.num)) throw new TeamError('Species Clause: one of each species.');
    nums.add(sp.num);
    const tags = (dex.species.get(sp.baseSpecies).tags || []).concat(sp.tags || []);
    if (tags.some((t) => SPECIAL_TAGS.includes(t))) special += 1;
    if (options.randomTeam && !isFinal(dex, sp)) throw new TeamError(`Random team: ${sp.name} isn't fully evolved.`);
    if (!Array.isArray(set.moves) || set.moves.length < 1 || set.moves.length > 4) throw new TeamError(`${sp.name}: one to four moves.`);
    const ids = set.moves.map(toId);
    if (new Set(ids).size !== ids.length) throw new TeamError(`${sp.name}: each move once.`);
    let legal = null;
    if (learnsets) {
      let k = 0;
      const text = learnsets.learnsets[sp.id];
      legal = new Set(text ? text.split('.').map((x) => toId(moveNames[(k += parseInt(x, 36))])) : []);
    }
    ids.forEach((id) => {
      const mv = dex.moves.get(id);
      if (!mv.exists || mv.isZ || mv.isMax || id === 'potion' || id === 'struggle' || EXCLUDED_SETS.has(mv.isNonstandard)) throw new TeamError(`${sp.name}: ${id} isn't a usable move.`);
      if (legal && !legal.has(id)) throw new TeamError(`${sp.name} can't learn ${mv.name}.`);
    });
    const abilities = Object.values(sp.abilities).map(toId);
    if (!abilities.includes(toId(set.ability))) throw new TeamError(`${sp.name} can't have ${set.ability}.`);
    if (set.item) {
      const it = dex.items.get(set.item);
      if (!it.exists || it.zMove || (it.isNonstandard !== 'Future' && EXCLUDED_SETS.has(it.isNonstandard))) throw new TeamError(`${sp.name}: ${set.item} isn't a held item here.`);
      const users = it.itemUser || (it.megaStone ? [it.megaEvolves] : null);
      if (users && !users.includes(sp.name) && !users.includes(sp.baseSpecies)) throw new TeamError(`${it.name} only works for ${users[0]}.`);
      if (items.has(it.id)) throw new TeamError(`Item Clause: one ${it.name} per team.`);
      items.add(it.id);
    }
    if (set.nature && !dex.natures.get(set.nature).exists) throw new TeamError(`${sp.name}: unknown nature.`);
    const evs = set.evs || {};
    let total = 0;
    STAT_KEYS.forEach((k) => {
      const v = evs[k] || 0;
      if (!Number.isInteger(v) || v < 0 || v > 32) throw new TeamError(`${sp.name}: stat points must be 0-32.`);
      total += v;
    });
    if (total > 66) throw new TeamError(`${sp.name}: 66 stat points at most.`);
  });
  if (special > 1) throw new TeamError('Only one legendary or mythical Pokémon per team.');
  if (options.randomTeam && (team.length !== 6 || special !== 1)) throw new TeamError('Random team: six Pokémon, exactly one of them legendary or mythical.');
}

export function createEngine(config, emit) {
  const seed = (config.seed >>> 0) || 1;
  const rules = config.rules || {};
  const aiRand = rng(seed ^ 0xa5a5a5a5);
  const chaosRand = rng(seed ^ 0x5a5a5a5a);
  const champ = championTeam(rng(seed ^ 0x3c3c3c3c));
  const potionsStart = rules.noPotions ? 0 : (config.potions ?? 2);
  const viewP1 = createView('p1');
  const viewP2 = createView('p2');
  const dex = Dex.forFormat(FORMAT_ID);
  validateTeam(config.player && config.player.team, dex, config.learnsets || null, { randomTeam: !!rules.randomTeam });
  const ai = createAI(dex, aiRand, 50, config.difficulty || 'hard');
  const escalationOn = rules.escalation !== false;
  let pending = { p1: null, p2: null };
  let logBuffer = [];
  let ended = null;
  let p1Request = null;
  let rqid = 0;
  // Replay record: faints (in order), the escalation and the revivals.
  const record = { seed, templateVersion: TEMPLATE_VERSION, variants: champ.variants, faints: [], escalation: null };
  let paused = null; // { id } while the championship escalation plays
  const faintedP2 = [];

  const battle = new Battle({
    formatid: FORMAT_ID,
    seed: seedString(seed),
    send(type, data) {
      if (type === 'update') {
        const text = Array.isArray(data) ? data.join('\n') : data;
        const ch = extractChannelMessages(text, [1, 2]);
        viewP1.feed(ch[1]);
        viewP2.feed(ch[2]);
        logBuffer.push(...ch[1]);
      } else if (type === 'sideupdate') {
        const nl = data.indexOf('\n');
        const side = data.slice(0, nl);
        const body = data.slice(nl + 1);
        if (body.startsWith('|request|')) pending[side] = JSON.parse(body.slice(9));
        else if (body.startsWith('|error|') && side === 'p1') emit({ t: 'error', message: body.slice(7).replace(/^\[\w+ choice\] /, '') });
      } else if (type === 'end') {
        const log = JSON.parse(data);
        ended = { winner: log.winner === config.player.name ? 'p1' : log.winner === CHAMPION.name ? 'p2' : '' };
      }
    },
  });
  battle.dex.data.Moves.potion = POTION;
  battle.dex.data.Conditions.potion = { name: 'Potion' };
  battle.vrBag = { potions: potionsStart };

  const level = rules.levelCap ? 45 : 50;
  const playerTeam = config.player.team.map((set) => ({ ...set, name: set.name || set.species, level }));
  battle.setPlayer('p1', { name: config.player.name, team: playerTeam });
  battle.setPlayer('p2', { name: CHAMPION.name, team: champ.team.map((set) => ({ ...set, name: set.species.split('-')[0], level: 50, gender: set.gender || '' })) });

  // The bag as a hidden 5th move on every player Pokémon; removed once the bag is empty.
  function syncBag() {
    for (const p of battle.sides[0].pokemon) {
      const has = p.baseMoveSlots.some((m) => m.id === 'potion');
      if (battle.vrBag.potions > 0 && !has) {
        const slot = { id: 'potion', move: 'Potion', pp: 64, maxpp: 64, target: 'adjacentAllyOrSelf', disabled: false, used: false };
        p.baseMoveSlots.push(slot);
        if (!p.transformed) p.moveSlots.push({ ...slot });
      } else if (battle.vrBag.potions <= 0 && has) {
        p.baseMoveSlots = p.baseMoveSlots.filter((m) => m.id !== 'potion');
        p.moveSlots = p.moveSlots.filter((m) => m.id !== 'potion');
      }
    }
  }
  syncBag();
  battle.sendUpdates();

  // Faint order, from the battle state (both sides, for the replay record).
  function noteFaints() {
    battle.sides.forEach((side, s) => side.pokemon.forEach((p) => {
      if (p.fainted && !p.vrFaintNoted) {
        p.vrFaintNoted = true;
        record.faints.push({ side: s ? 'p2' : 'p1', species: p.species.name, turn: battle.turn });
        if (s === 1) faintedP2.push(p);
      }
      if (!p.fainted && p.vrFaintNoted) p.vrFaintNoted = false;
    }));
  }
  // End of resolution: a fresh move request, or the end-of-turn replacement request after residuals
  // (the turn's queue is empty). Mid-turn requests (U-turn, Eject Button) wait for the next boundary.
  const atBoundary = () => battle.requestState === 'move' || (battle.requestState === 'switch' && battle.queue.list.length === 0);
  // Distinct Pokémon (objects, not names: a Mega keeps its identity).
  const distinctFainted = () => new Set(faintedP2).size;

  function startEscalation() {
    const id = `${seed.toString(16)}-esc`;
    paused = { id };
    record.escalation = { id, turn: battle.turn, revived: [], resumed: false };
    logBuffer.push('|vr-escalation|');
    emit({ t: 'log', lines: logBuffer });
    logBuffer = [];
    emit({ t: 'escalation', id, fainted: faintedP2.slice(0, REVIVE_COUNT).map((p) => p.name) });
  }

  function resume(id) {
    if (!paused || id !== paused.id || ended) return false; // duplicate, stale or unknown
    paused = null;
    const side = battle.sides[1];
    for (const p of faintedP2.slice(0, REVIVE_COUNT)) {
      if (!p.fainted || p.vrRevived) continue;
      p.vrRevived = true;
      side.pokemonLeft += 1;
      p.fainted = false;
      p.faintQueued = false;
      p.subFainted = false;
      p.status = '';
      p.hp = 1; // sethp needs a living Pokémon
      p.sethp(p.maxhp / 2);
      // A revived Pokémon still in its fainted slot keeps switchFlag: a teammate replaces it and
      // it goes back to the bench. (Showdown runs switch-out events on it then; none of the
      // champion's abilities or items have any — checked by the tests.)
      battle.add('-heal', p, p.getHealth, '[from] vr: championship');
      record.escalation.revived.push(p.species.name);
    }
    record.escalation.resumed = true;
    pending = { p1: null, p2: null };
    p1Request = null;
    battle.makeRequest(battle.requestState);
    battle.sendUpdates();
    settle();
    return true;
  }

  // Runs the AI and any automatic player choices until the player has a real decision to make.
  function settle() {
    for (let guard = 0; guard < 50 && !ended; guard += 1) {
      noteFaints();
      if (escalationOn && !record.escalation && distinctFainted() >= 2 && atBoundary()) {
        startEscalation();
        return;
      }
      if (pending.p2) {
        const req = pending.p2;
        pending.p2 = null;
        let choice = null;
        try { choice = ai.decide(req, viewP2); } catch (_) { choice = 'default'; }
        if (choice && !battle.choose('p2', choice)) battle.choose('p2', 'default');
        battle.sendUpdates();
        continue;
      }
      if (pending.p1 && rules.chaos && pending.p1.forceSwitch) {
        const req = pending.p1;
        pending.p1 = null;
        const taken = new Set();
        const choice = req.forceSwitch.map((must) => {
          if (!must) return 'pass';
          const bench = req.side.pokemon.map((p, n) => ({ p, n: n + 1 })).filter(({ p, n }) => !p.active && !p.condition.endsWith(' fnt') && !taken.has(n));
          if (!bench.length) return 'pass';
          const pick = bench[Math.floor(chaosRand() * bench.length)];
          taken.add(pick.n);
          return `switch ${pick.n}`;
        }).join(', ');
        logBuffer.push('|vr-chaos|');
        battle.choose('p1', choice);
        battle.sendUpdates();
        continue;
      }
      break;
    }
    noteFaints();
    syncBag();
    if (pending.p1) {
      p1Request = pending.p1;
      pending.p1 = null;
      rqid += 1;
      p1Request.rqid = rqid;
      // Keep the request's move list in step with the bag (the sim built it before syncBag).
      p1Request.vr = { potions: battle.vrBag.potions, noSwitch: !!rules.noSwitch, chaos: !!rules.chaos, level };
      // Move details for the Fight menu (public game data).
      const moveInfo = {};
      (p1Request.active || []).forEach((act) => act.moves.forEach((m) => {
        const mv = battle.dex.moves.get(m.id);
        moveInfo[m.id] = { type: mv.type, category: mv.category, power: mv.basePower || 0, accuracy: mv.accuracy === true ? 0 : mv.accuracy, priority: mv.priority || 0 };
      }));
      p1Request.vr.moves = moveInfo;
    }
    const lines = logBuffer;
    logBuffer = [];
    if (lines.length) emit({ t: 'log', lines });
    if (ended) emit({ t: 'end', winner: ended.winner, champion: champ.team.map((s) => ({ species: s.species, item: s.item, ability: s.ability, nature: s.nature, moves: s.moves.slice() })), record });
    else if (p1Request) emit({ t: 'request', request: p1Request });
  }

  // rqid: the request the choice answers. A missing one is accepted (tests, simple callers);
  // a stale one is ignored.
  function choose(choice, forRqid) {
    if (ended || paused) return false;
    if (!p1Request || (forRqid != null && forRqid !== p1Request.rqid)) return false;
    if (rules.noSwitch && !p1Request.forceSwitch && !p1Request.teamPreview && /(^|,\s*)switch /.test(choice)) {
      emit({ t: 'error', message: 'No switching is on: your Pokémon stay in until they faint.' });
      emit({ t: 'request', request: p1Request });
      return false;
    }
    const before = p1Request;
    p1Request = null;
    const ok = battle.choose('p1', choice);
    battle.sendUpdates();
    if (!ok) {
      p1Request = before;
      emit({ t: 'request', request: before });
      return false;
    }
    settle();
    return true;
  }

  settle();
  return {
    choose,
    resume,
    state: () => ({ turn: battle.turn, ended, potions: battle.vrBag.potions, paused: !!paused, rqid: p1Request ? p1Request.rqid : null, record }),
    // For tests only: the AI's inputs, to prove it never holds the opponent's private data.
    _aiInputs: () => ({ view: viewP2 }),
    _battle: config.exposeBattle ? battle : undefined,
  };
}

// Battle is exported for the tests' fixed scenarios (no AI); the page never uses it.
export { CHAMPION, VARIANTS, championTeam, Dex, createView, createAI, Battle };
