// AI strength benchmark (not part of the test suite). Run: node tests/vr/bench.mjs [seeds]
// Plays the fixed sample team against Ren with two player policies over the same seeds:
//   naive      Showdown's first legal option every time
//   strategic  the champion's own heuristic, driving the player from the player's own view
//              (both bring the same four, team 1234: the AI's team preview is Ren's random pick)
// with and without the championship escalation. Reports win counts and average turns.
import { createRequire } from 'node:module';
import { loadEngine, SAMPLE_TEAM } from './harness.mjs';

const require = createRequire(import.meta.url);
const C = require('../../public/vr/vr-core.js');
const E = loadEngine();
const D = E.Dex.forFormat(E.FORMAT_ID);
const N = Number(process.argv[2]) || 60;

function battle(seed, strategic, escalation) {
  const view = E.createView('p1');
  const ai = E.createAI(D, C.rng(seed ^ 0x77777777), 50, 'hard');
  const events = [];
  let request = null; let esc = null; let winner = null; let fed = 0;
  const engine = E.createEngine({ seed, rules: { escalation }, player: { name: 'You', team: SAMPLE_TEAM } }, (ev) => {
    events.push(ev);
    if (ev.t === 'request') request = ev.request;
    if (ev.t === 'escalation') esc = ev;
    if (ev.t === 'end') winner = ev.winner;
  });
  for (let i = 0; i < 600 && winner === null; i += 1) {
    if (esc) { engine.resume(esc.id); esc = null; continue; }
    if (!request) break;
    const req = request; request = null;
    let choice = 'default';
    if (strategic) {
      const lines = events.filter((e) => e.t === 'log').flatMap((e) => e.lines);
      view.feed(lines.slice(fed));
      fed = lines.length;
      try { choice = req.teamPreview ? 'team 1234' : ai.decide(req, view) || 'default'; } catch (_) { choice = 'default'; }
    }
    if (!engine.choose(choice, req.rqid) && !request) engine.choose('default', req.rqid);
  }
  return { won: winner === 'p1', turns: engine.state().turn };
}

const started = Date.now();
for (const escalation of [true, false]) {
  for (const strategic of [false, true]) {
    let wins = 0; let turns = 0;
    for (let seed = 1; seed <= N; seed += 1) { const r = battle(seed, strategic, escalation); wins += r.won ? 1 : 0; turns += r.turns; }
    console.log(`${strategic ? 'strategic' : 'naive    '} · escalation ${escalation ? 'on ' : 'off'} · player wins ${wins}/${N} · avg turns ${(turns / N).toFixed(1)}`);
  }
}
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
