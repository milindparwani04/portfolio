/* [CRACK] game logic for the Crack overlay on the home page.
   CrackGame.mount(root) wires up the markup inside root (found by data-ck attributes) and returns
   { dispose } — dispose stops every timer and removes the key listener, so closing the overlay
   leaves nothing running. The rules are unchanged from the original game. */
(function(){
  /* LEVEL_RATE is solved, not guessed: it places the final digit of the final
     level at exactly MIN, so the curve peaks at FINAL rather than clipping early. */
  var SLOTS = 5, BASE = 260, MIN = 70, DECAY = 0.87, LEVEL_RATE = 0.961, FINAL = 20, MAX_LIVES = 3;

  function mount(root){
    var q = function(name){ return root.querySelector('[data-ck="' + name + '"]'); };
    var readout = q('readout');
    var targetEl = q('target');
    var statusEl = q('status');
    var lockBtn = q('lock');
    var logEl = q('log');
    var sLevel = q('level');
    var sSpeed = q('speed');
    var sLives = q('lives');
    var sBest = q('best');

    var slots = [], state = {}, runStart = 0;
    var cycleTimer = null, pendingTimer = null, gen = 0;
    readout.textContent = '';
    for (var i=0;i<SLOTS;i++){
      var d = document.createElement('div');
      d.className = 'slot';
      d.textContent = '·';
      readout.appendChild(d);
      slots.push(d);
    }

    var best = 0;
    try { best = parseInt(localStorage.getItem('crack_best'),10) || 0; } catch(e){}
    sBest.textContent = best ? best : '—';

    function log(msg){
      var d = document.createElement('div');
      d.innerHTML = '<span>&gt;</span> ' + msg;
      logEl.insertBefore(d, logEl.firstChild);
      while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
    }

    function fresh(level){
      var code = [];
      for (var i=0;i<SLOTS;i++) code.push(Math.floor(Math.random()*10));
      return {
        running: true, paused: false, level: level, code: code, pos: 0, digit: 0,
        speed: Math.max(MIN, Math.round(BASE * Math.pow(LEVEL_RATE, level-1))),
        lives: state.lives === undefined ? MAX_LIVES : state.lives
      };
    }

    function render(){
      for (var i=0;i<SLOTS;i++){
        var s = slots[i];
        s.className = 'slot';
        if (i < state.pos){ s.className = 'slot locked'; s.textContent = state.code[i]; }
        else if (i === state.pos && state.running){ s.className = 'slot active'; s.textContent = state.digit; }
        else { s.textContent = '·'; }
      }
      sLevel.textContent = state.level + ' / ' + FINAL;
      sSpeed.textContent = state.speed + 'ms';
      sLives.innerHTML = '';
      for (var L=0; L<MAX_LIVES; L++){
        var b = document.createElement('span');
        var held = L < state.lives;
        b.className = 'life' + (held ? (state.lives === 1 ? ' last' : '') : ' spent');
        sLives.appendChild(b);
      }
      targetEl.textContent = state.code.join(' ');
    }

    /* Every cycle chain carries the generation it was born in. stopTimer() bumps the
       generation, so any chain still in flight — including one whose timer handle was
       overwritten by a second chain — sees the mismatch on its next hop and dies.
       Without this, two overlapping chains step the same digit and it appears to
       count 1,3,5,7,9 at double speed while the interval is unchanged. */
    function tick(myGen){
      if (myGen !== gen) return;
      state.digit = (state.digit + 1) % 10;
      render();
      cycleTimer = setTimeout(function(){ tick(myGen); }, state.speed);
    }

    function run(){
      stopTimer();
      var g = gen;
      cycleTimer = setTimeout(function(){ tick(g); }, state.speed);
    }

    function stopTimer(){
      if (cycleTimer){ clearTimeout(cycleTimer); cycleTimer = null; }
      if (pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; }
      gen++;
    }

    function start(level){
      stopTimer();
      level = level || 1;
      /* a run always begins with a full set of lives — otherwise "try again"
         after a lockout inherits the 0 lives that caused it */
      if (level === 1){ runStart = Date.now(); state.lives = MAX_LIVES; }
      state = fresh(level);
      statusEl.className = 'ck-status';
      statusEl.textContent = 'Cracking… lock on ' + state.code[0];
      lockBtn.textContent = 'Lock';
      log('LEVEL ' + state.level + ' — code ' + state.code.join('') + ' — ' + state.speed + 'ms');
      render();
      run();
    }

    function attempt(){
      if (!state.running){ start(1); return; }
      /* the dial is frozen between a miss and its restart — input here would both
         double-decrement lives and spawn a second cycle chain */
      if (state.paused) return;
      if (state.digit === state.code[state.pos]){
        stopTimer();
        state.pos++;
        state.speed = Math.max(MIN, Math.round(state.speed * DECAY));
        log('position ' + state.pos + ' locked — ' + state.speed + 'ms');
        if (state.pos === SLOTS){ win(); return; }
        statusEl.className = 'ck-status good';
        statusEl.textContent = 'Locked. Next target ' + state.code[state.pos];
        state.digit = Math.floor(Math.random()*10);
        render();
        run();
        return;
      }
      miss();
    }

    function miss(){
      stopTimer();
      state.lives--;
      var s = slots[state.pos];
      s.className = 'slot miss';
      log('miss at position ' + (state.pos+1) + ' — wanted ' + state.code[state.pos] + ', got ' + state.digit);
      if (state.lives <= 0){
        state.running = false;
        statusEl.className = 'ck-status';
        statusEl.textContent = 'Lockout — reached level ' + state.level;
        lockBtn.textContent = 'Try again';
        log('LOCKOUT at level ' + state.level);
        render();
        return;
      }
      state.paused = true;
      render();
      statusEl.className = 'ck-status';
      statusEl.textContent = 'Miss — ' + state.lives + ' ' + (state.lives===1?'life':'lives') + ' left';
      pendingTimer = setTimeout(function(){
        pendingTimer = null;
        if (!state.running) return;
        state.paused = false;
        state.digit = Math.floor(Math.random()*10);
        statusEl.textContent = 'Lock on ' + state.code[state.pos];
        render(); run();
      }, 700);
    }

    function fmt(ms){
      var t = Math.round(ms/1000);
      return Math.floor(t/60) + 'm ' + ('0' + (t%60)).slice(-2) + 's';
    }

    function win(){
      var lvl = state.level;
      if (lvl > best){ best = lvl; sBest.textContent = best; try{ localStorage.setItem('crack_best', best); }catch(e){} }
      render();

      if (lvl === FINAL){ complete(); return; }

      state.paused = true;
      statusEl.className = 'ck-status good';
      statusEl.textContent = 'Vault open — level ' + lvl + ' cleared';
      log('VAULT OPEN — level ' + lvl + ' cleared');
      var carry = state.lives;
      pendingTimer = setTimeout(function(){
        pendingTimer = null;
        state.lives = carry;
        start(lvl + 1);
      }, 1200);
    }

    function complete(){
      stopTimer();
      state.running = false;
      var elapsed = Date.now() - runStart;
      var bt = 0;
      try { bt = parseInt(localStorage.getItem('crack_best_time'),10) || 0; } catch(e){}
      var record = !bt || elapsed < bt;
      if (record){ try{ localStorage.setItem('crack_best_time', elapsed); }catch(e){} }
      statusEl.className = 'ck-status good';
      statusEl.textContent = 'Vault open — all ' + FINAL + ' cracked · ' + fmt(elapsed) + (record ? ' · new record' : '');
      lockBtn.textContent = 'Play again';
      log('ALL ' + FINAL + ' LEVELS CRACKED — ' + fmt(elapsed) + (record ? ' (record)' : ''));
    }

    /* Space or Enter locks from anywhere — except on another button or link (the overlay's ✕),
       which keeps its own Enter/Space. On the lock button itself the key is taken here, and the
       native click it would also fire is cancelled, so one press is one attempt. */
    function onKey(e){
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      var t = e.target instanceof Element ? e.target.closest('button, a, input, textarea, select') : null;
      if (t && t !== lockBtn) return;
      e.preventDefault();
      attempt();
    }

    lockBtn.addEventListener('click', attempt);
    document.addEventListener('keydown', onKey);

    state = { lives:3, level:1, speed:BASE, code:[0,0,0,0,0], pos:0, digit:0, running:false };
    render();
    targetEl.innerHTML = '&#183; &#183; &#183; &#183; &#183;';
    statusEl.className = 'ck-status';
    statusEl.textContent = 'Press lock to begin';
    logEl.innerHTML = '<div><span>&gt;</span> awaiting input&#8230;</div>';

    return {
      dispose: function(){
        stopTimer();
        state.running = false;
        lockBtn.removeEventListener('click', attempt);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  window.CrackGame = { mount: mount };
})();
