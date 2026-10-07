// Loads the shipped engine bundle (public/vr/vr-engine.js) in a sandbox, without a Worker, so the
// tests exercise exactly the file the browser runs.
import fs from 'node:fs';
import vm from 'node:vm';

export function loadEngine() {
  const code = fs.readFileSync(new URL('../../public/vr/vr-engine.js', import.meta.url), 'utf8');
  const self = {};
  const context = vm.createContext({ self, console, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, DataView, Math, JSON, Date, Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet, Symbol, Promise, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, isFinite, BigInt, setTimeout, clearTimeout, queueMicrotask });
  context.globalThis = context;
  vm.runInContext(code, context, { filename: 'vr-engine.js' });
  return self.VREngine;
}

// A fixed player team for engine tests (six common Pokémon with ordinary sets).
export const SAMPLE_TEAM = [
  { species: 'Incineroar', ability: 'Intimidate', item: 'Sitrus Berry', nature: 'Careful', moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'], evs: { hp: 32, atk: 2, def: 16, spa: 0, spd: 16, spe: 0 } },
  { species: 'Rillaboom', ability: 'Grassy Surge', item: 'Choice Band', nature: 'Adamant', moves: ['Grassy Glide', 'Wood Hammer', 'U-turn', 'High Horsepower'], evs: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 } },
  { species: 'Gholdengo', ability: 'Good as Gold', item: 'Choice Specs', nature: 'Modest', moves: ['Make It Rain', 'Shadow Ball', 'Power Gem', 'Trick'], evs: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 } },
  { species: 'Amoonguss', ability: 'Regenerator', item: 'Rocky Helmet', nature: 'Relaxed', moves: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect'], evs: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
  { species: 'Dragonite', ability: 'Inner Focus', item: 'Lum Berry', nature: 'Adamant', moves: ['Extreme Speed', 'Scale Shot', 'Fire Punch', 'Protect'], evs: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } },
  { species: 'Pikachu', ability: 'Lightning Rod', item: 'Light Ball', nature: 'Timid', moves: ['Thunderbolt', 'Fake Out', 'Protect', 'Volt Switch'], evs: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 } },
];

// Plays a whole battle with a simple player policy: `pick(request)` returns a choice string, or
// 'default' for Showdown's first legal option. Returns { events, winner, turns }.
export function playBattle(E, config, pick = () => 'default', maxSteps = 400) {
  const events = [];
  let request = null;
  let winner = null;
  const engine = E.createEngine({ player: { name: 'You', team: SAMPLE_TEAM }, ...config }, (ev) => {
    events.push(ev);
    if (ev.t === 'request') request = ev.request;
    if (ev.t === 'end') winner = ev.winner;
  });
  for (let step = 0; step < maxSteps && winner === null; step += 1) {
    if (!request) break;
    const r = request;
    request = null;
    engine.choose(pick(r, engine));
  }
  return { events, winner, turns: engine.state().turn, engine };
}
