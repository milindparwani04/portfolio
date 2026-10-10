// The Very Best artwork: all original, drawn here as SVG (no traced or extracted game art).
//   champion()  Ren Kestrel, the fictional champion: a flat cel-shaded illustration (two tones
//               per material, hard shadow edges, ink outline), sporty windbreaker, confident pose
//               with a capsule raised
//   capsule()   the original battle capsule Ren throws: a rounded bar, amber and graphite halves,
//               a teal band and a diamond catch
//   crowd(seed) stadium stands with rows of silhouettes, for the championship escalation
//   drawTrainer(canvas)  Ren as a 22 x 34 pixel sprite, for the title screen
// Markup is fixed strings and numbers only; nothing user-supplied reaches it.
(function () {
  'use strict';

  const INK = '#15151c';
  const P = {
    skin: '#e9b48c', skinShade: '#c98d68', hair: '#2a2550', hairShade: '#1b1838', hairHi: '#5048a0',
    jacket: '#1f6f78', jacketShade: '#154d54', white: '#f4f3ef', whiteShade: '#cfcabd', accent: '#ff7a45', accentShade: '#cf5426',
    pants: '#2f3340', pantsShade: '#20232c', glove: '#2b2b33'
  };
  const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
  const shade = (d, fill) => `<path d="${d}" fill="${fill}"/>`;

  function capsule(cls = '') {
    return `<svg class="${cls}" viewBox="0 0 40 24" aria-hidden="true" focusable="false">`
      + `<path d="M20 2H8a10 10 0 0 0 0 20h12z" fill="#f7c947" stroke="${INK}" stroke-width="2"/>`
      + `<path d="M20 2h12a10 10 0 0 1 0 20H20z" fill="#3a3a46" stroke="${INK}" stroke-width="2"/>`
      + `<path d="M8 5a7 7 0 0 0-4 6" fill="none" stroke="#fff3c4" stroke-width="2" stroke-linecap="round"/>`
      + `<rect x="16.5" y="1.5" width="7" height="21" fill="#2bb3a3" stroke="${INK}" stroke-width="2"/>`
      + `<path d="M20 8l3.6 4-3.6 4-3.6-4z" fill="#f4f3ef" stroke="${INK}" stroke-width="1.6"/></svg>`;
  }

  function champion(cls = '') {
    return `<svg class="${cls}" viewBox="0 0 200 320" aria-hidden="true" focusable="false">`
      // legs
      + path('M80 204 L74 292 L96 292 L106 212 Z', P.pants) + shade('M92 214 L104 212 L96 292 L88 292 Z', P.pantsShade)
      + path('M110 212 L120 292 L142 292 L146 204 Z', P.pants) + shade('M130 206 L146 204 L142 292 L132 292 Z', P.pantsShade)
      // shoes
      + path('M70 288 L98 288 L100 302 L66 302 Q64 294 70 288 Z', P.white) + shade('M66 298 L100 298 L100 302 L66 302 Z', P.accent)
      + path('M118 288 L144 288 Q152 294 150 302 L116 302 Z', P.white) + shade('M116 298 L150 298 L150 302 L116 302 Z', P.accent)
      // far arm (fist on hip)
      + path('M138 114 L162 150 L150 158 L130 124 Z', P.jacket) + shade('M146 132 L162 150 L154 156 Z', P.jacketShade)
      + path('M162 150 L142 182 L132 174 L150 148 Z', P.jacket) + shade('M150 160 L142 182 L136 178 Z', P.jacketShade)
      + path('M128 172 a9 9 0 1 0 18 4 a9 9 0 1 0 -18 -4 Z', P.glove)
      // torso
      + path('M74 112 C86 103 132 103 144 112 L152 150 L148 208 L70 208 L66 150 Z', P.jacket)
      + shade('M120 106 C132 106 140 109 144 112 L152 150 L148 208 L124 208 Z', P.jacketShade)
      + path('M97 106 L109 134 L121 106 Z', P.white) + shade('M103 118 L115 118 L112 124 L106 124 Z', P.accent)
      + path('M90 106 L104 130 L94 112 Z', P.white) + path('M128 106 L114 130 L124 112 Z', P.whiteShade)
      + `<path d="M109 134 L109 204" stroke="${INK}" stroke-width="2"/>`
      + path('M70 194 L148 194 L148 208 L70 208 Z', P.accent) + shade('M124 194 L148 194 L148 208 L124 208 Z', P.accentShade)
      + shade('M76 150 L84 150 L82 190 L74 190 Z', P.white)
      // neck and head
      + path('M100 90 L118 90 L118 108 L100 108 Z', P.skinShade)
      + path('M86 48 C86 30 130 30 132 50 L131 72 C130 86 118 97 108 97 C97 97 88 86 87 74 Z', P.skin)
      + shade('M120 44 C128 46 131 50 132 52 L131 72 C130 84 122 93 114 96 C122 86 124 70 120 44 Z', P.skinShade)
      + path('M84 60 a5 8 0 1 0 6 14 Z', P.skin)
      // face: determined brows, bright eyes, an easy smile
      + `<path d="M92 57 L105 54" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M113 54 L126 57" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`
      + `<path d="M93 62 L105 61 L104 68 L95 68 Z" fill="${INK}"/><path d="M113 61 L125 62 L123 68 L114 68 Z" fill="${INK}"/>`
      + `<rect x="99" y="62" width="3" height="3" fill="#f4f3ef"/><rect x="119" y="62" width="3" height="3" fill="#f4f3ef"/>`
      + `<rect x="96" y="65" width="3" height="2" fill="#2bb3a3"/><rect x="116" y="65" width="3" height="2" fill="#2bb3a3"/>`
      + `<path d="M108 70 L106 77 L110 77" fill="none" stroke="${P.skinShade}" stroke-width="2" stroke-linejoin="round"/>`
      + `<path d="M101 82 Q109 88 117 81" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
      // hair: swept back with sharp spikes
      + path('M82 60 C74 34 92 14 116 14 C134 14 146 26 142 46 L150 40 L140 58 L134 50 C128 40 118 36 106 40 L102 30 L96 44 L90 40 L88 60 Z', P.hair)
      // back-swept spikes (pointing behind the head, not up)
      + path('M126 20 L166 18 L144 36 Z', P.hair) + path('M134 32 L170 42 L146 50 Z', P.hair) + path('M104 14 L126 2 L122 18 Z', P.hair)
      + shade('M124 18 C136 20 144 30 142 44 L136 48 C134 34 128 24 118 20 Z', P.hairShade)
      + `<path d="M98 24 C108 18 122 18 130 24" fill="none" stroke="${P.hairHi}" stroke-width="3" stroke-linecap="round"/>`
      // near arm, raised with the capsule
      + path('M80 112 L58 150 L44 142 L70 108 Z', P.jacket) + shade('M66 130 L58 150 L52 146 Z', P.jacketShade)
      + path('M58 150 L40 118 L28 124 L44 148 Z', P.jacket) + shade('M44 132 L40 118 L34 121 Z', P.jacketShade)
      + path('M34 120 L46 116 L44 124 L36 128 Z', P.accent)
      + path('M22 112 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z', P.glove)
      + `<g transform="translate(12 82) rotate(-18)">${capsule().replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`
      + `</svg>`;
  }

  // Seeded stands: rows of heads and shoulders in muted team colours, nearer rows larger.
  function crowd(seed = 7) {
    let a = seed >>> 0;
    const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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

  // Ren as a 22 x 34 pixel sprite for the title screen (design handoff "Retro Main Menu", option
  // 1b, 2026-10-10). One character per pixel, '.' transparent; rows are padded to 22 on the right.
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

  window.TVBArt = { champion, capsule, crowd, drawTrainer };
}());
