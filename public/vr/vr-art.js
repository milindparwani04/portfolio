// The Very Best artwork: all original, drawn here in code (no traced or extracted game art).
//   trainer(cls)        Ren Kestrel, the fictional champion, as the title screen's 22 x 34 pixel
//                       sprite: one canvas, scaled by CSS in whole pixels wherever Ren appears
//   drawTrainer(canvas) draws that sprite at 1:1
//   arena(phase, seed)  the battle backdrop: 'court' (an outdoor battle court, the first stage) or
//                       'stadium' (the dark championship stadium after the escalation)
//   crowd(seed)         stadium stands with rows of silhouettes, for the championship escalation
// Markup is fixed strings and numbers only; nothing user-supplied reaches it.
(function () {
  'use strict';

  // mulberry32, as everywhere else in the game.
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  // Seeded stands: rows of heads and shoulders in muted team colours, nearer rows larger.
  function crowd(seed = 7) {
    const rand = seeded(seed);
    const cols = ['#3b3f58', '#4b3a52', '#2f4a4f', '#504438', '#3e4a3a', '#52364a', '#33405a'];
    const rows = [];
    for (let r = 0; r < 5; r += 1) {
      const y = 22 + r * 18;
      const size = 5 + r * 1.6;
      const parts = [];
      for (let x = -4 + (r % 2) * 6; x < 404; x += size * 2.2 + rand() * 3) {
        const c = cols[Math.floor(rand() * cols.length)];
        const lift = rand() * 3;
        parts.push(`<rect x="${(x - size).toFixed(1)}" y="${(y + size * 0.6 - lift).toFixed(1)}" width="${(size * 2).toFixed(1)}" height="${(size * 2).toFixed(1)}" rx="${(size * 0.7).toFixed(1)}" fill="${c}"/>`);
        parts.push(`<circle cx="${x.toFixed(1)}" cy="${(y - lift).toFixed(1)}" r="${(size * 0.62).toFixed(1)}" fill="${c}"/>`);
      }
      rows.push(`<g class="tvb-crowd-row" style="--r:${r}">${parts.join('')}</g>`);
    }
    return `<svg class="tvb-crowd" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">`
      + `<rect x="0" y="0" width="400" height="120" fill="#14151f"/>${rows.join('')}`
      + `<rect x="0" y="108" width="400" height="12" fill="#0d0e15"/></svg>`;
  }

  // Ren as a 22 x 34 pixel sprite (design handoff "Retro Main Menu", option 1b, 2026-10-10): the one
  // picture of Ren, used on the title, the battle intro and the championship escalation. One
  // character per pixel, '.' transparent; rows are padded to 22 on the right.
  const TRAINER_ROWS = [
    '........K...K', '.......KHK.KHK..K', '....K.KHHHKHHHKKHK', '...KHKHHhHHHhHHHHK', '...KHHHhhHHhhHHHHHK', '...KHHHHHHHHHHHHHHK',
    '...KHHHHHHHHHHHHHHK', '...KHHSSHHSSSHHSHHK', '...KHSSSSSSSSSSSSHK', '...KHSKKKSSSSKKKSHK', '...KSSWKSSSSSSWKSSK', '..KsSSWKSSSSSSWKSSsK',
    '...KSSSSSSsSSSSSSSK', '...KSSSSSSSSSSSSSSK', '....KSSSKKKKKSSSSK', '.....KSSSSSSSSSSK', '......KKsSSSSsKK', '.....KTTKWWWWKTTK',
    '...KTTTTTKWWKTTTTTK', '..KTTKTTTKWWKTTTKTTK', '..KTtKTTTKOOKTTTKtTK', '..KTtKTWTKWWKTTTKtTK', '..KTtKTWTKOOKTTTKtTK', '..KTtKTWTTKKTTTTKtTK',
    '..KTtKTTTTTTTTTTKtTK', '..KSSKOOOOOOOOOOKSSK', '...KKKPPPPPPPPPPKKK', '.....KPPPPPPPPPPK', '.....KPPPpKKpPPPK', '.....KPPPpKKpPPPK',
    '.....KPPPpKKpPPPK', '.....KWWWWKKWWWWK', '....KOOWWWKKWWWOOK', '....KKKKKKKKKKKKKK'
  ];
  const TRAINER_PAL = { K: '#16121f', H: '#4a3aa6', h: '#7d6cf0', S: '#f3c39c', s: '#d48a62', W: '#f5f1e8', T: '#1f8f8c', t: '#13605e', O: '#f06a36', P: '#2b3048', p: '#1b1f31' };
  // Draws the sprite at 1:1 into a 22 x 34 canvas; CSS scales it by an integer, pixelated.
  function drawTrainer(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 22, 34);
    TRAINER_ROWS.forEach((row, y) => [...row].forEach((ch, x) => {
      if (TRAINER_PAL[ch]) { ctx.fillStyle = TRAINER_PAL[ch]; ctx.fillRect(x, y, 1, 1); }
    }));
  }
  // A fresh canvas with Ren drawn on it. CSS sizes it in whole multiples of 22 x 34 (--px) with
  // pixelated scaling, so the edges stay crisp at every size; the background stays transparent.
  function trainer(cls = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 22;
    canvas.height = 34;
    canvas.className = `tvb-ren ${cls}`.trim();
    canvas.setAttribute('aria-hidden', 'true');
    drawTrainer(canvas);
    return canvas;
  }

  // ---------- Battle backdrops ----------
  // Low-resolution SVG (320 x 180, crisp edges) that covers the arena. Platforms, Pokémon and the
  // HUD sit on top as page elements, so both phases share one layout.
  const rect = (x, y, w, hgt, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" fill="${fill}"/>`;
  const poly = (points, fill) => `<polygon points="${points}" fill="${fill}"/>`;
  // Floor stripes that get taller towards the viewer (a cheap perspective).
  const stripes = (top, a, b) => {
    const out = [];
    for (let y = top, band = 4, alt = 0; y < 180; y += band, band += 2, alt ^= 1) out.push(rect(0, y, 320, band, alt ? a : b));
    return out.join('');
  };
  // Painted court lines in perspective: outline, half-way line, centre circle.
  const courtLines = (top, colour) => {
    const line = `fill="none" stroke="${colour}" stroke-width="1.6"`;
    const mid = Math.round((top + 178) / 2);
    return `<polygon points="52,${top} 268,${top} 316,178 4,178" ${line}/><path d="M28 ${mid} H292" ${line}/><ellipse cx="160" cy="${mid}" rx="35" ry="9" ${line}/>`;
  };

  // The court: sky bands and two clouds, stepped far hills, nearer hills, a tree line and a fence on
  // the horizon, then a mown court with painted lines.
  function court(rand) {
    const out = [rect(0, 0, 320, 30, '#7cc4e8'), rect(0, 30, 320, 22, '#93d0ee'), rect(0, 52, 320, 20, '#b2def2')];
    [[38, 14], [214, 24]].forEach(([x, y]) => out.push(rect(x, y, 34, 6, '#eef8fc'), rect(x + 6, y - 4, 18, 4, '#eef8fc'), rect(x + 2, y + 6, 30, 2, '#d3ecf7')));
    let far = '0,72';
    for (let x = 0; x <= 320; x += 16) { const top = 60 - Math.round(rand() * 9); far += ` ${x},${top} ${x + 16},${top}`; }
    out.push(poly(`${far} 320,72`, '#8fbfa0'));
    let near = '0,76';
    for (let x = 0; x <= 320; x += 8) { const top = 69 - Math.round(rand() * 5); near += ` ${x},${top} ${x + 8},${top}`; }
    out.push(poly(`${near} 320,76`, '#6fa784'));
    for (let x = 0; x < 320; x += 6) out.push(rect(x, 71 - Math.round(rand() * 3), 6, 9, rand() < 0.5 ? '#3f7f57' : '#4a8c60'));
    out.push(rect(0, 78, 320, 6, '#e3dcc6'), rect(0, 84, 320, 2, '#b9b09a'));
    for (let x = 4; x < 320; x += 20) out.push(rect(x, 76, 3, 10, '#9c927c'));
    out.push(stripes(86, '#93c46a', '#a3d17a'), courtLines(92, '#f4f3ef'));
    for (let i = 0; i < 26; i += 1) {
      const tx = Math.round(rand() * 316);
      const ty = 90 + Math.round(rand() * 86);
      out.push(rect(tx, ty, 2, 1, '#7fb257'), rect(tx + 1, ty - 1, 1, 1, '#7fb257'));
    }
    return out.join('');
  }
  // The championship stadium: a night roof with trusses and floodlight banks, soft beams, four tiers
  // of stands with a seeded crowd, an amber-and-red LED barrier, and a dark competition floor with
  // amber markings and a warm glow at its edges.
  function stadium(rand) {
    const out = [rect(0, 0, 320, 180, '#0b0a12'), rect(0, 0, 320, 14, '#17131f')];
    for (let x = -10; x < 330; x += 24) out.push(`<path d="M${x} 14 L${x + 12} 1 L${x + 24} 14" fill="none" stroke="#2a2338" stroke-width="2"/>`);
    const tiers = [[16, 12, 3], [28, 14, 4], [42, 16, 5], [58, 20, 6]];
    const shirts = ['#3b3f58', '#4b3a52', '#2f4a4f', '#504438', '#52364a', '#33405a', '#6a3a2c', '#7a5a22'];
    tiers.forEach(([ty, th, size], r) => {
      out.push(rect(0, ty, 320, th, r % 2 ? '#1c1828' : '#221d31'), rect(0, ty + th - 1, 320, 1, '#120f1a'));
      const fans = [];
      for (let x = (r % 2) * 3; x < 320; x += size + 1 + Math.round(rand() * 2)) {
        const c = shirts[Math.floor(rand() * shirts.length)];
        fans.push(rect(x, ty + th - size, size, size - 1, c), rect(x + 1, ty + th - size - 2, Math.max(1, size - 2), 2, '#8a7a6c'));
      }
      out.push(`<g class="tvb-arena-fans" style="--r:${r}">${fans.join('')}</g>`);
    });
    [26, 104, 196, 274].forEach((x) => {
      out.push(poly(`${x + 6},17 ${x + 14},17 ${x + 60},180 ${x - 40},180`, 'rgba(255, 228, 160, 0.07)'));
      out.push(rect(x, 9, 20, 8, '#3a3346'), rect(x + 2, 11, 4, 4, '#fff3c4'), rect(x + 8, 11, 4, 4, '#fff3c4'), rect(x + 14, 11, 4, 4, '#fff3c4'));
    });
    out.push(rect(0, 78, 320, 10, '#1a0c10'));
    for (let x = 0; x < 320; x += 16) out.push(rect(x + 1, 80, 14, 6, (x / 16) % 3 === 1 ? '#d9342b' : '#ff8a3d'), rect(x + 1, 80, 14, 1, '#ffd08a'));
    out.push(stripes(88, '#23273a', '#1c1f2f'), courtLines(94, '#f0a73a'));
    out.push(poly('160,128 172,136 160,144 148,136', 'rgba(240, 120, 50, 0.55)'));
    out.push(poly('0,118 0,180 44,180', 'rgba(255, 106, 26, 0.2)'), poly('320,118 320,180 276,180', 'rgba(255, 106, 26, 0.2)'));
    return out.join('');
  }
  function arena(phase, seed = 7) {
    const rand = seeded(seed);
    return `<svg class="tvb-arena-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${phase === 'stadium' ? stadium(rand) : court(rand)}</svg>`;
  }

  window.TVBArt = { trainer, drawTrainer, arena, crowd };
}());
