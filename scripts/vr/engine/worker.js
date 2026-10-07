// Web Worker entry for public/vr/vr-engine.js. The page posts { t: 'start', config } and then
// { t: 'choose', choice }; the worker posts back the engine's events (see engine.js). Also exposes
// self.VREngine so tests can drive the same bundle without a worker.
import { createEngine, CHAMPION, Dex, FORMAT_ID } from './engine.js';

self.VREngine = { createEngine, CHAMPION, Dex, FORMAT_ID };

if (typeof self.importScripts === 'function') {
  let engine = null;
  self.onmessage = (event) => {
    const msg = event.data || {};
    try {
      if (msg.t === 'start') {
        engine = createEngine(msg.config, (out) => self.postMessage(out));
      } else if (msg.t === 'choose' && engine) {
        engine.choose(String(msg.choice));
      }
    } catch (error) {
      self.postMessage({ t: 'fatal', message: String(error && error.message || error) });
    }
  };
  self.postMessage({ t: 'ready' });
}
