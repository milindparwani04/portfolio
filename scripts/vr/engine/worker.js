// Web Worker entry for public/vr/vr-engine.js. Also exposes self.VREngine so tests can drive the
// same bundle without a worker.
//
// Messages in (anything else is ignored):
//   { t: 'start', battleId, config }          once; the team is validated against /vr/learnsets.json
//   { t: 'choose', battleId, rqid, choice }    an answer to request `rqid`
//   { t: 'resume', battleId, id }              the championship cinematic finished (once)
// Messages out carry the battleId, so the page can drop anything from an earlier battle:
//   { t: 'ready' }, { t: 'invalid', message }, { t: 'fatal', message }, and the engine's events.
import { createEngine, validateTeam, isFinal, TeamError, CHAMPION, VARIANTS, championTeam, Dex, FORMAT_ID, createView, createAI, Battle } from './engine.js';

const LEARNSETS_URL = '/vr/learnsets.json?v=1';
// A doubles choice is at most two short commands ("move 4 -2 mega, switch 6"), or a team order.
const CHOICE = /^(team [1-6]{1,6}|(move [1-5]( -?[12])?( mega)?|switch [1-6]|pass|default)(, (move [1-5]( -?[12])?( mega)?|switch [1-6]|pass|default))?)$/;
const ID = /^[a-z0-9-]{1,40}$/;

self.VREngine = { createEngine, validateTeam, isFinal, TeamError, CHAMPION, VARIANTS, championTeam, Dex, FORMAT_ID, createView, createAI, Battle, CHOICE };

if (typeof self.importScripts === 'function') {
  let engine = null;
  let battleId = null;
  let starting = false;
  const post = (msg) => self.postMessage({ ...msg, battleId });
  self.onmessage = async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      if (msg.t === 'start') {
        if (engine || starting || typeof msg.battleId !== 'string' || !ID.test(msg.battleId) || !msg.config || typeof msg.config !== 'object') return;
        starting = true;
        battleId = msg.battleId;
        const res = await fetch(LEARNSETS_URL, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('learnsets');
        const learnsets = await res.json();
        const config = msg.config;
        const cfg = {
          seed: Number(config.seed) >>> 0,
          rules: { noSwitch: config.rules?.noSwitch === true, chaos: config.rules?.chaos === true, noPotions: config.rules?.noPotions === true, levelCap: config.rules?.levelCap === true, randomTeam: config.rules?.randomTeam === true },
          player: { name: 'You', team: config.player?.team },
          learnsets,
        };
        try {
          engine = createEngine(cfg, post);
        } catch (error) {
          if (error instanceof TeamError) { post({ t: 'invalid', message: error.message }); return; }
          throw error;
        }
      } else if (msg.t === 'choose') {
        if (!engine || msg.battleId !== battleId || typeof msg.choice !== 'string' || msg.choice.length > 40 || !CHOICE.test(msg.choice) || !Number.isInteger(msg.rqid)) return;
        engine.choose(msg.choice, msg.rqid);
      } else if (msg.t === 'resume') {
        if (!engine || msg.battleId !== battleId || typeof msg.id !== 'string') return;
        engine.resume(msg.id);
      }
    } catch (error) {
      post({ t: 'fatal', message: String((error && error.message) || error).slice(0, 200) });
    }
  };
  self.postMessage({ t: 'ready' });
}
