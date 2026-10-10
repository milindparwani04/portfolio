// Ren's pre-rendered cinematic. The engine owns revival; this player only acknowledges completion.
(function () {
  'use strict';
  const names = { floetteeternal: 'Floette', basculegion: 'Basculegion', kingambit: 'Kingambit', dragonite: 'Dragonite', garchomp: 'Garchomp', sneasler: 'Sneasler' };
  function select(event) {
    const first = event && Array.isArray(event.fainted) && event.fainted[0];
    const key = String(typeof first === 'string' ? first : first && first.species || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!Object.hasOwn(names, key)) return null;
    return { name: names[key], src: `/assets/vr/cinematics/ren-v1/ren-38-${key}.webm` };
  }
  function caption(t, name) {
    if (t < 5) return 'Ren: Two lucky knockouts. Don’t mistake that for a chance.';
    if (t < 9.1) return 'Ren: I have never lost. Not once.';
    if (t < 12) return 'Ren: And I am NOT starting with you.';
    if (t < 16.2) return 'The arena fades into a packed championship stadium. The crowd cheers.';
    if (t < 21) return 'Ren: Hear that? They know who owns this arena.';
    if (t < 26) return 'Ren: Louder. Let them hear who their champion is.';
    if (t < 31) return 'Ren: You haven’t beaten us. You’ve only made me angry.';
    if (t < 36.4) return `Ren: Get up, ${name}. We are not finished.`;
    return `${name} rises again. Ren: One last round. Try to survive it.`;
  }
  function play(frame, event, audio, done) {
    const clip = select(event);
    const track = audio.recording.prepare();
    const layer = document.createElement('div');
    layer.className = 'tvb-cinematic';
    layer.setAttribute('role', 'group');
    layer.setAttribute('aria-label', 'Ren’s championship cinematic');
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-label', clip ? `${clip.name} revives in Ren’s championship stadium` : 'Championship revival');
    const status = document.createElement('p');
    status.className = 'tvb-cinematic-caption';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Loading championship moment…';
    const controls = document.createElement('div');
    controls.className = 'tvb-cinematic-controls';
    function button(text, action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tvb-btn'; b.textContent = text; b.onclick = action; controls.append(b); return b; }
    const start = button('Play cutscene', tryPlay); start.hidden = true;
    const sound = button('Sound', () => { audio.setMuted(!audio.settings.muted); syncAudio(); });
    const skip = button('Skip ▸▸', () => finish('skipped'));
    layer.append(video, status, controls);
    frame.append(layer);
    skip.focus();
    let finished = false, clock = 0, lastTime = -1, stalled = 0, loading = 0, wasPlaying = false;
    function syncAudio() {
      video.muted = true;
      track.muted = !!audio.settings.muted;
      track.volume = Math.max(0, Math.min(1, Number(audio.settings.music) || 0));
      sound.textContent = track.muted ? 'Sound: off' : 'Sound: on';
      sound.setAttribute('aria-pressed', String(!track.muted));
    }
    function cleanup() {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', visibility);
      video.pause();
      video.removeAttribute('src');
      video.load();
      layer.remove();
    }
    function finish(reason) {
      if (finished) return;
      finished = true;
      cleanup();
      if (reason === 'skipped') { track.currentTime = 38; track.play().catch(() => {}); }
      if (reason === 'unavailable') audio.recording.stop();
      done(reason);
    }
    async function tryPlay() {
      if (finished || document.hidden) return;
      syncAudio();
      try { await Promise.all([track.play(), video.play()]); if (!finished) start.hidden = true; }
      catch (_) { video.pause(); track.pause(); if (!finished) { start.hidden = false; status.textContent = 'Press Play to watch, or Skip to continue the battle.'; } }
    }
    function visibility() {
      if (document.hidden) { wasPlaying = !video.paused; video.pause(); track.pause(); }
      else { stalled = 0; if (wasPlaying || (video.readyState && start.hidden)) tryPlay(); }
    }
    document.addEventListener('visibilitychange', visibility);
    track.addEventListener('error', () => finish('unavailable'), { once: true });
    video.addEventListener('error', () => finish('unavailable'));
    video.addEventListener('ended', () => { if (track.currentTime >= 38) finish('ended'); });
    video.addEventListener('canplay', () => { if (!finished && video.paused && start.hidden) tryPlay(); });
    syncAudio();
    if (!clip) { queueMicrotask(() => finish('unavailable')); }
    else {
      video.src = clip.src;
      clock = window.setInterval(() => {
        if (finished || document.hidden) return;
        syncAudio();
        if (track.currentTime >= 38) { finish('ended'); return; }
        if (!video.readyState) { if (++loading >= 150) finish('unavailable'); return; }
        if (!start.hidden) return;
        // The song is the master clock: network/media drift cannot shift the drop.
        if (!track.paused && Math.abs(video.currentTime - track.currentTime) > 0.15) video.currentTime = track.currentTime;
        if (video.currentTime === lastTime) { if (++stalled >= 150) { finish('unavailable'); return; } }
        else { stalled = 0; const text = caption(video.currentTime, clip.name); if (status.textContent !== text) status.textContent = text; }
        lastTime = video.currentTime;
      }, 100);
    }
    return { skip: () => finish('skipped'), cancel: () => { if (finished) return; finished = true; cleanup(); audio.recording.stop(); } };
  }
  window.TVBCinematic = { select, play };
}());
