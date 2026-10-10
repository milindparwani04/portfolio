// The Very Best audio: original synthesised sound effects and music on the Web Audio clock, with
// separate Music, Effects and Crowd levels under a master mute. Nothing plays before the player
// clicks Insert cartridge (the AudioContext is created on that gesture or later).
//
// AUDIO_MANIFEST lists the four music roles. Every role has an original synthesised fallback, which
// is what ships today. A role's `src` stays null until a recording is cleared for game use: the
// requested tracks are recorded here as references with status 'blocked', not as shipped audio
// (see docs/victory-road-build.md, "Audio and rights"). A cleared file would be fetched,
// decoded and scheduled on the same clock; the escalation role's resumeCueSeconds marks its drop.
(function () {
  'use strict';

  const AUDIO_MANIFEST = Object.freeze({
    version: 1,
    menu: { src: null, status: 'blocked', reference: 'Glimmering Pallet Lights (Pixabay) — licence certificate and provenance not yet verified', fallback: 'original synth: menu loop', loop: true },
    battle: { src: null, status: 'blocked', reference: 'Sword and Shield Trailer Theme (Remix), GlitchxCity — not licensed for game use', fallback: 'original synth: battle loop', loop: true },
    escalation: { src: null, status: 'blocked', reference: 'Marnie Battle Theme, GlitchxCity & Scottay — not licensed for game use', fallback: 'original synth: 38 s build and drop', resumeCueSeconds: 38, loop: false },
    crowd: { src: null, status: 'original', reference: 'original synthesised crowd', fallback: 'original synth: crowd', loop: true }
  });

  const store = {
    get(key, fallback) { try { const v = window.localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch (_) { /* private mode or full */ } }
  };
  const level = (key, fallback) => { const v = Number(store.get(key, '')); return store.get(key, null) !== null && v >= 0 && v <= 1 ? v : fallback; };
  const settings = {
    muted: store.get('pdosVrMuted', '0') === '1',
    music: level('pdosTvbMusic', store.get('pdosVrMusic', '1') === '0' ? 0 : 0.7),
    sfx: level('pdosTvbSfx', level('pdosVrVolume', 0.7)),
    crowd: level('pdosTvbCrowd', 0.6)
  };

  let ctx = null;
  let master = null;
  const bus = {};
  function ensure() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      try { ctx = new A(); } catch (_) { return null; }
      master = ctx.createGain();
      master.gain.value = settings.muted ? 0 : 1;
      master.connect(ctx.destination);
      ['music', 'sfx', 'crowd'].forEach((k) => { bus[k] = ctx.createGain(); bus[k].gain.value = settings[k]; bus[k].connect(master); });
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return ctx;
  }

  // ---------- Voices ----------
  function tone(dest, freq, dur, { type = 'square', vol = 0.06, slide = 0, at = null, attack = 0.005 } = {}) {
    const a = ensure();
    if (!a) return;
    const t = at ?? a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noiseBuffer() {
    const a = ensure();
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function noise(dest, dur, { vol = 0.08, at = null, filter = null, freq = 1000, q = 1, decay = true } = {}) {
    const a = ensure();
    if (!a) return;
    const t = at ?? a.currentTime;
    const s = a.createBufferSource();
    s.buffer = noiseBuffer();
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = s;
    if (filter) { const f = a.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; }
    node.connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }
  const N = (name) => { const m = /^([A-G]#?)(\d)$/.exec(name); if (!m) return 0; const i = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(m[1]); return 440 * 2 ** ((i + 12 * (Number(m[2]) + 1) - 69) / 12); };

  // ---------- Effects (navigation beeps on every menu, battle sounds) ----------
  const fx = {
    move: (d) => tone(d, 660, 0.035, { vol: 0.025 }),
    select: (d) => tone(d, 880, 0.05, { vol: 0.04 }),
    confirm: (d) => { tone(d, 660, 0.06); tone(d, 990, 0.08, { at: ctx.currentTime + 0.06 }); },
    back: (d) => tone(d, 440, 0.06, { slide: -120, vol: 0.04 }),
    error: (d) => { tone(d, 196, 0.09, { type: 'square', vol: 0.05 }); tone(d, 165, 0.12, { type: 'square', vol: 0.05, at: ctx.currentTime + 0.09 }); },
    hit: (d) => { noise(d, 0.12, { vol: 0.09 }); tone(d, 160, 0.1, { type: 'triangle', slide: -80 }); },
    superHit: (d) => { noise(d, 0.18, { vol: 0.12 }); tone(d, 220, 0.16, { type: 'sawtooth', slide: -150, vol: 0.05 }); },
    faint: (d) => tone(d, 520, 0.5, { type: 'triangle', slide: -460, vol: 0.07 }),
    heal: (d) => [523, 659, 784].forEach((f, i) => tone(d, f, 0.09, { type: 'triangle', at: ctx.currentTime + i * 0.08 })),
    mega: (d) => [392, 523, 659, 784, 1047].forEach((f, i) => tone(d, f, 0.12, { at: ctx.currentTime + i * 0.07 })),
    throw: (d) => { tone(d, 300, 0.25, { type: 'triangle', slide: 500, vol: 0.05 }); noise(d, 0.2, { vol: 0.04, filter: 'highpass', freq: 3000, at: ctx.currentTime + 0.28 }); },
    boot: (d) => [262, 330, 392, 523, 659].forEach((f, i) => tone(d, f, 0.14, { vol: 0.05, at: ctx.currentTime + i * 0.09 })),
    revive: (d) => [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone(d, f, 0.3, { type: 'triangle', vol: 0.06, at: ctx.currentTime + i * 0.05 })),
    win: (d) => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(d, f, 0.16, { at: ctx.currentTime + i * 0.13 })),
    lose: (d) => [392, 349, 311, 262].forEach((f, i) => tone(d, f, 0.28, { type: 'triangle', at: ctx.currentTime + i * 0.24 }))
  };
  function play(name) {
    if (settings.muted || !settings.sfx) return;
    try { if (ensure() && fx[name]) fx[name](bus.sfx); } catch (_) { /* audio is optional */ }
  }

  // ---------- Music: original loops, scheduled 250 ms ahead on the audio clock ----------
  const SONGS = {
    // Menu: a calm original arpeggio over a slow pad (A minor -> F -> C -> G), 104 bpm.
    menu: {
      step: 60 / 104 / 2,
      steps: 64,
      voice(d, n, t, s) {
        const chords = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C3', 'E3', 'G3'], ['G3', 'B3', 'D4']];
        const ch = chords[Math.floor(n / 16) % 4];
        const arp = [0, 1, 2, 1, 2, 0, 1, 2];
        const note = ch[arp[n % 8]].replace(/\d/, (o) => String(Number(o) + 1));
        tone(d, N(note), s * 0.9, { vol: 0.022, at: t });
        if (n % 16 === 0) ch.forEach((x) => tone(d, N(x), s * 15.5, { type: 'triangle', vol: 0.03, at: t, attack: 0.4 }));
        if (n % 4 === 0) tone(d, 90, 0.12, { type: 'sine', slide: -50, vol: 0.06, at: t });
        if (n % 8 === 4) noise(d, 0.05, { vol: 0.012, at: t, filter: 'highpass', freq: 6000 });
      }
    },
    // Battle: an original 8-bar boss loop (E minor, 150 bpm: square lead, triangle bass, noise
    // hats, sine kick).
    battle: (() => {
      const LEAD = ('E5 E5 B4 E5 G5 F#5 E5 D5 E5 E5 B4 E5 A5 G5 F#5 G5 C5 C5 G4 C5 E5 D5 C5 B4 D5 D5 A4 D5 F#5 E5 D5 F#5 '
        + 'E5 G5 B5 G5 E5 G5 B5 C6 B5 A5 G5 F#5 E5 F#5 G5 A5 C6 B5 A5 G5 A5 G5 F#5 E5 D#5 E5 F#5 B4 D#5 F#5 B5 -').split(' ');
      const BASS = 'E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 C2 C3 D2 D3 D2 D3 E2 E3 E2 E3 E2 E3 E2 E3 A1 A2 A1 A2 B1 B2 B1 B2'.split(' ');
      return {
        step: 60 / 150 / 2,
        steps: LEAD.length,
        voice(d, n, t, s) {
          const lead = LEAD[n % LEAD.length];
          if (lead !== '-') tone(d, N(lead), s * 0.9, { vol: 0.035, at: t });
          if (n % 2 === 0) tone(d, N(BASS[(n / 2) % BASS.length]), s * 1.8, { type: 'triangle', vol: 0.09, at: t });
          if (n % 2 === 1) noise(d, 0.03, { vol: 0.025, at: t });
          if (n % 4 === 0) tone(d, 110, 0.12, { type: 'sine', slide: -70, vol: 0.12, at: t });
        }
      };
    })(),
    // Phase two (after the drop): the battle loop a tone higher, doubled kick and an octave lead.
    finale: (() => {
      const LEAD = 'F#5 F#5 C#5 F#5 A5 G#5 F#5 E5 F#5 A5 C#6 A5 F#5 A5 C#6 D6 C#6 B5 A5 G#5 F#5 G#5 A5 B5 D6 C#6 B5 A5 B5 A5 G#5 F#5'.split(' ');
      const BASS = 'F#2 F#3 F#2 F#3 D2 D3 D2 D3 E2 E3 E2 E3 C#2 C#3 C#2 C#3'.split(' ');
      return {
        step: 60 / 160 / 2,
        steps: LEAD.length,
        voice(d, n, t, s) {
          tone(d, N(LEAD[n % LEAD.length]), s * 0.85, { vol: 0.032, at: t });
          tone(d, N(LEAD[n % LEAD.length]) * 2, s * 0.5, { vol: 0.012, at: t });
          if (n % 2 === 0) tone(d, N(BASS[(n / 2) % BASS.length]), s * 1.8, { type: 'sawtooth', vol: 0.04, at: t });
          noise(d, 0.025, { vol: 0.02, at: t, filter: 'highpass', freq: 7000 });
          if (n % 2 === 0) tone(d, 110, 0.12, { type: 'sine', slide: -70, vol: 0.13, at: t });
          if (n % 4 === 2) noise(d, 0.12, { vol: 0.06, at: t, filter: 'bandpass', freq: 1800, q: 0.7 });
        }
      };
    })()
  };
  let song = null; // { name, n, next, timer }
  function schedule() {
    if (!song || !ctx) return;
    const s = SONGS[song.name];
    while (song.next < ctx.currentTime + 0.25) {
      s.voice(bus.music, song.n, song.next, s.step);
      song.next += s.step;
      song.n = (song.n + 1) % s.steps;
    }
  }
  let wanted = null; // the role the game wants playing (kept when muted, resumed when unmuted)
  function startMusic(name, at) {
    wanted = name;
    stopSong();
    if (settings.muted || !settings.music) return;
    const a = ensure();
    if (!a || !SONGS[name]) return;
    song = { name, n: 0, next: Math.max(at || 0, a.currentTime + 0.08) };
    schedule();
    song.timer = window.setInterval(schedule, 100);
  }
  function stopSong() {
    if (song) window.clearInterval(song.timer);
    song = null;
  }
  function stopMusic() { wanted = null; stopSong(); }

  // ---------- Crowd: filtered noise with swells and cheers (original) ----------
  let crowd = null;
  function startCrowd(intensity = 0.5) {
    const a = ensure();
    if (!a || settings.muted) return;
    if (!crowd) {
      const s = a.createBufferSource();
      s.buffer = noiseBuffer();
      s.loop = true;
      const f = a.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      const g = a.createGain();
      g.gain.value = 0.0001;
      s.connect(f).connect(g).connect(bus.crowd);
      s.start();
      crowd = { s, g, f, cheer: 0 };
      crowd.cheer = window.setInterval(() => {
        if (!crowd || document.hidden) return;
        noise(bus.crowd, 0.6 + Math.random() * 0.8, { vol: 0.03 + crowd.level * 0.05, filter: 'bandpass', freq: 1200 + Math.random() * 1400, q: 1.2 });
      }, 700);
    }
    crowd.level = intensity;
    crowd.g.gain.cancelScheduledValues(a.currentTime);
    crowd.g.gain.setTargetAtTime(0.02 + intensity * 0.12, a.currentTime, 0.8);
  }
  function stopCrowd() {
    if (!crowd) return;
    window.clearInterval(crowd.cheer);
    try { crowd.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); crowd.s.stop(ctx.currentTime + 1.2); } catch (_) { /* already stopped */ }
    crowd = null;
  }

  // ---------- The 38-second escalation score ----------
  // An original build: a low drone and a rising pulse in 20 bars of 1.9 s (126.3 bpm), a filtered
  // noise riser over the last eight seconds and a snare roll over the last four, then the drop on
  // the resume cue, where the finale loop starts. Scheduled from `t0` (audio clock seconds) so the
  // visuals, which read the same clock, unlock on the drop. Returns { drop, cancel } (cancel fades
  // the build out, for Skip), or false if audio is unavailable, so the cinematic uses its own clock.
  const BAR = AUDIO_MANIFEST.escalation.resumeCueSeconds / 20;
  function escalationScore(t0, fromSec = 0) {
    const a = ensure();
    if (!a || settings.muted || !settings.music) return false;
    const d = a.createGain();
    d.connect(bus.music);
    const end = AUDIO_MANIFEST.escalation.resumeCueSeconds;
    const beat = BAR / 4;
    const roots = ['E2', 'E2', 'C2', 'D2'];
    for (let b = 0; b < 20; b += 1) {
      const barAt = b * BAR;
      if (barAt + BAR < fromSec) continue;
      const lift = b / 20;
      // Drone (one long note per bar), then the pulse: quarter notes, eighths after bar 8,
      // sixteenths after bar 14.
      tone(d, N(roots[Math.floor(b / 2) % 4]), BAR, { type: 'triangle', vol: 0.05 + lift * 0.04, at: t0 + barAt - fromSec, attack: 0.3 });
      const div = b < 8 ? 4 : b < 14 ? 8 : 16;
      for (let k = 0; k < div; k += 1) {
        const at = barAt + (k * BAR) / div;
        if (at < fromSec || at >= end) continue;
        tone(d, N(roots[Math.floor(b / 2) % 4].replace('2', b < 12 ? '4' : '5')), 0.08, { vol: 0.012 + lift * 0.02, at: t0 + at - fromSec });
      }
      if (b >= 10) for (let k = 0; k < 4; k += 1) { const at = barAt + k * beat; if (at >= fromSec) tone(d, 100, 0.14, { type: 'sine', slide: -60, vol: 0.06 + lift * 0.05, at: t0 + at - fromSec }); }
    }
    // Riser (30-38 s) and snare roll (34-38 s).
    if (fromSec < end) {
      const rStart = Math.max(30, fromSec);
      const s = a.createBufferSource();
      s.buffer = noiseBuffer();
      s.loop = true;
      const f = a.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 2;
      const g = a.createGain();
      const t1 = t0 + rStart - fromSec;
      const t2 = t0 + end - fromSec;
      f.frequency.setValueAtTime(400, t1);
      f.frequency.exponentialRampToValueAtTime(6000, t2);
      g.gain.setValueAtTime(0.0001, t1);
      g.gain.exponentialRampToValueAtTime(0.05, t2 - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t2);
      s.connect(f).connect(g).connect(d);
      s.start(t1);
      s.stop(t2 + 0.05);
      for (let at = Math.max(34, fromSec); at < end; ) {
        const left = end - at;
        noise(d, 0.06, { vol: 0.04 + (1 - left / 4) * 0.05, at: t0 + at - fromSec, filter: 'bandpass', freq: 2000, q: 0.8 });
        at += Math.max(0.05, left / 16);
      }
    }
    const drop = t0 + end - fromSec;
    return {
      drop,
      cancel() { try { d.gain.setTargetAtTime(0.0001, a.currentTime, 0.05); window.setTimeout(() => d.disconnect(), 400); } catch (_) { /* closed */ } }
    };
  }
  // The drop: a crash and a low hit on the cue (the finale loop follows).
  function dropHit(at) {
    const a = ensure();
    if (!a || settings.muted || !settings.music) return;
    noise(bus.music, 1.6, { vol: 0.14, at, filter: 'highpass', freq: 2500 });
    tone(bus.music, 55, 0.9, { type: 'sine', slide: -20, vol: 0.2, at });
  }

  // Background tabs: suspend the clock (music, crowd and anything reading it pause together) and
  // resume on return. Muting is separate and doesn't suspend.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });

  const api = {
    MANIFEST: AUDIO_MANIFEST,
    ensure: () => !!ensure(),
    now: () => (ctx && ctx.state === 'running' ? ctx.currentTime : null),
    running: () => !!ctx && ctx.state === 'running' && !settings.muted,
    outputLatency: () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0),
    play,
    music: { start: startMusic, stop: stopMusic, get wanted() { return wanted; } },
    crowd: { start: startCrowd, stop: stopCrowd },
    escalationScore,
    dropHit,
    settings,
    setMuted(on) {
      settings.muted = !!on;
      store.set('pdosVrMuted', on ? '1' : '0');
      if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.02);
      if (on) { const w = wanted; stopSong(); stopCrowd(); wanted = w; } else if (wanted) startMusic(wanted);
    },
    setLevel(kind, v) {
      if (!['music', 'sfx', 'crowd'].includes(kind)) return;
      settings[kind] = Math.max(0, Math.min(1, Number(v) || 0));
      store.set({ music: 'pdosTvbMusic', sfx: 'pdosTvbSfx', crowd: 'pdosTvbCrowd' }[kind], String(settings[kind]));
      if (bus[kind] && ctx) bus[kind].gain.setTargetAtTime(settings[kind], ctx.currentTime, 0.02);
      if (kind === 'music' && settings.music > 0 && wanted && !song && !settings.muted) startMusic(wanted);
    },
    close() {
      stopMusic();
      stopCrowd();
      if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; noiseBuf = null; }
    }
  };
  window.TVBAudio = api;
}());
