// Timed championship dialogue. The engine alone owns revival and battle resumption.
(function () {
  'use strict';
  const names = { floetteeternal: 'Floette', basculegion: 'Basculegion', kingambit: 'Kingambit', dragonite: 'Dragonite', garchomp: 'Garchomp', sneasler: 'Sneasler' };
  function select(event) {
    const first = event && Array.isArray(event.fainted) && event.fainted[0];
    const key = String(typeof first === 'string' ? first : first && first.species || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return { name: names[key] || 'partner' };
  }
  function caption(t, name) {
    if (t < 8) return 'You earned those knockouts. I can see the work behind your team.';
    if (t < 16) return 'But a championship is decided by how we finish. Let’s give this battle the stage it deserves.';
    if (t < 24) return 'Hear them? Every trainer in these stands knows what it takes to get here.';
    if (t < 32) return 'I still believe in my team. We have one more round in us.';
    return `${name}, back on your feet. Let’s give them a finish to remember.`;
  }
  function play(frame, event, audio, done) {
    const clip = select(event);
    const track = audio.recording.prepare();
    const previousFocus = document.activeElement;
    const layer = document.createElement('div');
    layer.className = 'tvb-cinematic tvb-dialogue-sequence';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Ren’s championship dialogue');
    const scene = document.createElement('div'); scene.className = 'tvb-dialogue-scene';
    scene.innerHTML = window.TVBArt.arena('court');
    const portrait = window.TVBArt.trainer('tvb-dialogue-ren');
    const box = document.createElement('div'); box.className = 'tvb-dialogue-box';
    const name = document.createElement('strong'); name.textContent = 'REN KESTREL';
    const status = document.createElement('p'); status.className = 'tvb-dialogue-text'; status.setAttribute('aria-live', 'polite');
    const progress = document.createElement('progress'); progress.max = 38; progress.value = 0; progress.setAttribute('aria-label', 'Championship build');
    const controls = document.createElement('div'); controls.className = 'tvb-cinematic-controls';
    // Pixel buttons in the dialogue box's colours: an icon, a label and (Skip) its key.
    function button(cls, icon, label, action, key) {
      const b = document.createElement('button'); b.type = 'button'; b.className = `tvb-cine-btn ${cls}`; b.onclick = action;
      const i = document.createElement('span'); i.className = 'tvb-cine-icon'; i.setAttribute('aria-hidden', 'true'); i.textContent = icon;
      const l = document.createElement('span'); l.className = 'tvb-cine-label'; l.textContent = label;
      b.append(i, l);
      if (key) { const k = document.createElement('kbd'); k.className = 'tvb-cine-key'; k.setAttribute('aria-hidden', 'true'); k.textContent = key; b.append(k); }
      controls.append(b); return b;
    }
    const sound = button('tvb-cine-btn--sound', '♪', 'Sound', () => { audio.setMuted(!audio.settings.muted); syncAudio(); });
    const skip = button('tvb-cine-btn--skip', '»', 'Skip', () => finish('skipped'), 'Esc');
    skip.setAttribute('aria-label', 'Skip dialogue');
    box.append(name, status, progress); layer.append(scene, portrait, box, controls); frame.append(layer); skip.focus();
    let finished = false, elapsed = 0, lastTick = performance.now(), stadium = false, mediaFailed = false;
    function syncAudio() {
      track.muted = !!audio.settings.muted;
      track.volume = Math.max(0, Math.min(1, Number(audio.settings.music) || 0));
      sound.querySelector('.tvb-cine-icon').textContent = track.muted ? '×' : '♪';
      sound.querySelector('.tvb-cine-label').textContent = track.muted ? 'Muted' : 'Sound';
      sound.setAttribute('aria-label', track.muted ? 'Sound: off' : 'Sound: on');
      sound.setAttribute('aria-pressed', String(!track.muted));
    }
    function attemptAudio() { if (!finished && !document.hidden && !mediaFailed) track.play().catch(() => { /* silent timeline remains usable after autoplay denial */ }); }
    function failure() { mediaFailed = true; }
    function visibility() { lastTick = performance.now(); if (document.hidden) track.pause(); else attemptAudio(); }
    function keydown(e) {
      if (e.key !== 'Tab') return;
      e.preventDefault(); (document.activeElement === sound ? skip : sound).focus();
    }
    function cleanup() {
      clearInterval(clock); document.removeEventListener('visibilitychange', visibility);
      track.removeEventListener('error', failure); layer.removeEventListener('keydown', keydown); layer.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    }
    function finish(reason) {
      if (finished) return; finished = true; cleanup();
      if (reason === 'skipped') { try { track.currentTime = 38; } catch (_) { /* unavailable media */ } track.play().catch(() => {}); }
      done(reason);
    }
    function tick() {
      const now = performance.now(); const delta = Math.max(0, (now - lastTick) / 1000); lastTick = now;
      if (finished || document.hidden) return;
      syncAudio();
      // Music is the cue clock when playing; a silent active-time clock handles failed/blocked media.
      elapsed = !mediaFailed && !track.paused && track.currentTime > 0 ? track.currentTime : elapsed + delta;
      if (elapsed >= 16 && !stadium) { stadium = true; scene.innerHTML = window.TVBArt.arena('stadium'); audio.crowd.start(); }
      const text = caption(elapsed, clip.name); if (status.textContent !== text) status.textContent = text;
      progress.value = Math.min(38, elapsed);
      if (elapsed >= 38) finish('ended');
    }
    track.addEventListener('error', failure); document.addEventListener('visibilitychange', visibility); layer.addEventListener('keydown', keydown);
    syncAudio(); status.textContent = caption(0, clip.name); attemptAudio();
    const clock = window.setInterval(tick, 50);
    return { skip: () => finish('skipped'), cancel: () => { if (finished) return; finished = true; cleanup(); audio.recording.stop(); audio.crowd.stop(); } };
  }
  window.TVBCinematic = { select, play };
}());