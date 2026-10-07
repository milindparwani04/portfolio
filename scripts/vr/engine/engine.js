// Victory Road battle runner: one Showdown Battle, the player on p1, the champion's AI on p2.
//
// createEngine(config, emit) starts a battle and returns { choose(choice), state() }.
// emit() receives, in order for each step:
//   { t: 'log', lines }       p1's channel of the battle log (what the player may see)
//   { t: 'request', request } p1's next decision (team preview, moves, forced switch) — or nothing
//   { t: 'end', winner }      'p1' | 'p2' | '' (tie)
//   { t: 'error', message }   an invalid choice; the same request stands
//
// Victory Road additions on top of Showdown (documented in docs/victory-road-build.md):
//   - Bag: `potions` Potions (heal 50% of max HP) used instead of a move, as a hidden 5th move
//     "Potion" with priority +6 (bag items act first) targeting the user or its partner. A Potion
//     is a status action, so Taunt and Assault Vest block it. No Potions sets the bag to 0.
//   - noSwitch: the player's voluntary switches are refused (forced replacements still work).
//   - chaos: when the player must replace a fainted Pokémon, the engine picks one at random.
import { Battle, extractChannelMessages } from 'ps-sim/sim/battle';
import { Dex } from 'ps-sim/sim/dex';
import { CHAMPION } from './champion.js';
import { createView } from './view.js';
import { createAI } from './ai.js';

export const FORMAT_ID = 'gen9championsvictoryroad';
const POTION = {
  num: -9001, name: 'Potion', accuracy: true, basePower: 0, category: 'Status', pp: 64, priority: 6,
  flags: {}, target: 'adjacentAllyOrSelf', type: '???', secondary: null, desc: 'Victory Road bag item',
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

// mulberry32, matching public/vr/vr-core.js, for the AI's and chaos replacement's own randomness.
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

export function createEngine(config, emit) {
  const seed = (config.seed >>> 0) || 1;
  const rules = config.rules || {};
  const aiRand = rng(seed ^ 0xa5a5a5a5);
  const chaosRand = rng(seed ^ 0x5a5a5a5a);
  const potionsStart = rules.noPotions ? 0 : (config.potions ?? 2);
  const viewP1 = createView('p1');
  const viewP2 = createView('p2');
  const dex = Dex.forFormat(FORMAT_ID);
  const ai = createAI(dex, aiRand, 50);
  let pending = { p1: null, p2: null };
  let logBuffer = [];
  let ended = null;
  let p1Request = null;

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
  battle.setPlayer('p2', { name: CHAMPION.name, team: CHAMPION.team.map((set) => ({ ...set, name: set.species.split('-')[0], level: 50, gender: set.gender || '' })) });

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

  // Runs the AI and any automatic player choices until the player has a real decision to make.
  function settle() {
    for (let guard = 0; guard < 50 && !ended; guard += 1) {
      if (pending.p2) {
        const req = pending.p2;
        pending.p2 = null;
        const choice = ai.decide(req, viewP2);
        if (choice) battle.choose('p2', choice);
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
    syncBag();
    if (pending.p1) {
      p1Request = pending.p1;
      pending.p1 = null;
      // Keep the request's move list in step with the bag (the sim built it before syncBag).
      p1Request.vr = { potions: battle.vrBag.potions, noSwitch: !!rules.noSwitch, chaos: !!rules.chaos, level };
      // Move types for the Fight menu (public game data).
      const moveTypes = {};
      (p1Request.active || []).forEach((act) => act.moves.forEach((m) => { moveTypes[m.id] = battle.dex.moves.get(m.id).type; }));
      p1Request.vr.moveTypes = moveTypes;
    }
    const lines = logBuffer;
    logBuffer = [];
    if (lines.length) emit({ t: 'log', lines });
    if (ended) emit({ t: 'end', winner: ended.winner });
    else if (p1Request) emit({ t: 'request', request: p1Request });
  }

  function choose(choice) {
    if (ended) return;
    if (rules.noSwitch && p1Request && !p1Request.forceSwitch && !p1Request.teamPreview && /(^|,\s*)switch /.test(choice)) {
      emit({ t: 'error', message: 'No switching is on: your Pokémon stay in until they faint.' });
      return;
    }
    const before = p1Request;
    p1Request = null;
    const ok = battle.choose('p1', choice);
    battle.sendUpdates();
    if (!ok) {
      p1Request = before;
      emit({ t: 'request', request: before });
      return;
    }
    settle();
  }

  settle();
  return {
    choose,
    state: () => ({ turn: battle.turn, ended, potions: battle.vrBag.potions }),
    // For tests only: the AI's inputs, to prove it never holds the opponent's private data.
    _aiInputs: () => ({ view: viewP2 }),
    _battle: config.exposeBattle ? battle : undefined,
  };
}

export { CHAMPION, Dex, createView, createAI };
