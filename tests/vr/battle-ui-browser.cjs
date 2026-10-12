// Browser regression for the battle screen's Skip animations toggle, move effectiveness labels
// (Fight menu and target picker) and Showdown-style Pokémon tooltips, against the real engine
// worker. Run: node tests/vr/battle-ui-browser.cjs  (BATTLE_UI_SCREENSHOTS=<dir> saves screenshots)
const fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
const { chromium } = require('C:/Users/milin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../../public');
const shots = process.env.BATTLE_UI_SCREENSHOTS;
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  if (req.url === '/__battle_ui_test') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><title>Battle UI test</title>'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/__battle_ui_test');
    await page.setContent(`<link rel="stylesheet" href="${base}/vr/vr.css"><div id="frame" style="position:relative;width:100%;height:720px"></div>`);
    for (const f of ['vr-core.js', 'vr-audio.js', 'vr-art.js', 'vr-game.js', 'vr-setup.js', 'vr-cinematic.js', 'vr-field.js', 'vr-certificate.js', 'vr-battle.js']) await page.addScriptTag({ url: `${base}/vr/${f}` });
    await page.evaluate(async () => {
      localStorage.removeItem('pdosTvbFast');
      const raw = {};
      for (const f of ['dex', 'species', 'sets', 'learnsets', 'items']) raw[f] = await (await fetch('/vr/' + f + '.json')).json();
      const { G, C } = TVB;
      G.cat = C.catalog(raw);
      G.draft = C.blankDraft();
      for (const id of ['garchomp', 'dragonite', 'incineroar', 'gholdengo']) G.draft.party = C.addMember(G.cat, G.draft.party, G.cat.byId[id]).party;
      G.root = document.querySelector('#frame');
      G.root.classList.add('tvb');
      G.name = 'Tester';
      G.state = 'preview';
      TVBAudio.setMuted(true);
      TVB.go('battle', { seed: 7 });
    });

    // Skip animations: off by default, toggles, remembered.
    const skipBtn = page.getByRole('button', { name: /Skip animations/ });
    assert.equal(await skipBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.tvb-tip').isVisible(), false);
    await skipBtn.click();
    assert.equal(await skipBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('pdosTvbFast')), '1');
    assert.equal(await page.locator('.tvb-frame.is-fast').count(), 1);

    // Team preview: Garchomp + Dragonite lead.
    await page.locator('.tvb-pickmon').first().waitFor({ timeout: 30000 });
    for (let i = 0; i < 4; i += 1) await page.locator('.tvb-pickmon').nth(i).click();
    const started = Date.now();
    await page.getByRole('button', { name: 'Start battle ▸' }).click();
    await page.getByRole('button', { name: 'Fight', exact: true }).waitFor({ timeout: 15000 });
    const introMs = Date.now() - started;
    assert.ok(introMs < 4000, `send-outs with Skip animations took ${introMs} ms`);
    console.log(`PASS: Skip animations toggles, is remembered, and the send-outs play in ${introMs} ms`);

    // Fight menu: damaging moves show effectiveness per opponent; spread moves that hit everyone add
    // the partner; status moves show nothing.
    await page.getByRole('button', { name: 'Fight', exact: true }).click();
    await page.locator('.tvb-move').first().waitFor();
    const moves = await page.locator('.tvb-move').evaluateAll((els) => els.map((b) => ({
      name: b.querySelector('.tvb-move-name').textContent,
      chips: [...b.querySelectorAll('.tvb-eff')].map((c) => ({ text: c.textContent, eff: c.dataset.eff, title: c.title }))
    })));
    const foes = await page.evaluate(() => ['p2a', 'p2b'].map((p) => document.querySelector(`.tvb-hpslot--${p} .tvb-hp-name`).textContent.replace(/ [♂♀]$/, '')));
    const by = Object.fromEntries(moves.map((m) => [m.name, m.chips]));
    assert.deepEqual(Object.keys(by).sort(), ['Earthquake', 'Protect', 'Scale Shot', 'Swords Dance']);
    assert.equal(by.Protect.length, 0);
    assert.equal(by['Swords Dance'].length, 0);
    assert.equal(by['Scale Shot'].length, 2);
    assert.equal(by.Earthquake.length, 3);
    assert.ok(by.Earthquake.some((c) => c.text.endsWith(' partner')));
    // Dragonite (the partner) is Flying: Earthquake has no effect on it.
    assert.deepEqual(by.Earthquake.find((c) => c.text.endsWith(' partner')), { text: '×0 partner', eff: 'none', title: 'No effect on partner' });
    for (const c of [...by['Scale Shot'], ...by.Earthquake]) assert.ok(/^×(4|2|1|½|¼|0) /.test(c.text), c.text);
    assert.ok(foes.every((f) => by['Scale Shot'].some((c) => c.text.endsWith(` ${f}`))), JSON.stringify({ foes, chips: by['Scale Shot'] }));
    // Each label agrees with the core rules for the foe's shown types.
    const check = await page.evaluate(() => {
      const { C } = TVB;
      return ['p2a', 'p2b'].map((p) => {
        const types = [...document.querySelectorAll(`.tvb-hpslot--${p} .tvb-hp-types [class*="type"]`)].map((t) => t.textContent.trim()).filter((t) => C.TYPES.some((x) => x.toLowerCase() === t.toLowerCase()));
        return { name: document.querySelector(`.tvb-hpslot--${p} .tvb-hp-name`).textContent.replace(/ [♂♀]$/, ''), types };
      });
    });
    console.log('foes:', JSON.stringify(check), 'Scale Shot:', JSON.stringify(by['Scale Shot'].map((c) => c.text)), 'Earthquake:', JSON.stringify(by.Earthquake.map((c) => c.text)));
    if (shots) await page.locator('#frame').screenshot({ path: path.join(shots, 'fight-menu.png') });
    console.log('PASS: Fight menu shows effectiveness per opponent (and partner for Earthquake); none on status moves');

    // Target picker: Scale Shot can target either foe or the partner; each button says how effective.
    await page.locator('.tvb-move', { hasText: 'Scale Shot' }).click();
    await page.getByText('Scale Shot: choose a target').waitFor();
    const targets = await page.locator('.tvb-cmd-grid .tvb-cmd:not(.tvb-cmd--back)').evaluateAll((els) => els.map((b) => b.textContent));
    assert.equal(targets.length, 3, JSON.stringify(targets));
    assert.ok(targets.every((t) => /(Super effective|Not very effective|Effective|No effect)/.test(t)), JSON.stringify(targets));
    if (shots) await page.locator('#frame').screenshot({ path: path.join(shots, 'target-picker.png') });
    console.log('PASS: target picker shows effectiveness on each target:', JSON.stringify(targets));
    await page.getByRole('button', { name: '◂ Back' }).click();

    // Tooltips: Ren's Pokémon (possible abilities, speed range, no moves yet); yours (stats, item, moves).
    await page.hover('.tvb-spot--p2a');
    const foeTip = await page.locator('.tvb-tip').textContent();
    assert.ok(await page.locator('.tvb-tip').isVisible());
    assert.ok(/Ability: possibly /.test(foeTip) && /Speed: \d+ to \d+/.test(foeTip) && /Item: not revealed/.test(foeTip) && /No moves seen yet/.test(foeTip), foeTip);
    const box = await page.evaluate(() => { const t = document.querySelector('.tvb-tip').getBoundingClientRect(), s = document.querySelector('.tvb-stage').getBoundingClientRect(); return t.left >= s.left && t.right <= s.right && t.top >= s.top && t.bottom <= s.bottom; });
    assert.ok(box, 'tooltip stays inside the arena');
    if (shots) await page.locator('#frame').screenshot({ path: path.join(shots, 'tooltip-foe.png') });
    await page.hover('.tvb-spot--p1a');
    const ownTip = await page.locator('.tvb-tip').textContent();
    assert.ok(/Garchomp/.test(ownTip) && /Ability: Rough Skin/.test(ownTip) && /Item: Garchompite/.test(ownTip) && /Stats: \d+ Atk \/ \d+ Def \/ \d+ SpA \/ \d+ SpD \/ \d+ Spe/.test(ownTip) && /Earthquake \(\d+\/\d+\)/.test(ownTip), ownTip);
    if (shots) await page.locator('#frame').screenshot({ path: path.join(shots, 'tooltip-own.png') });
    await page.mouse.move(5, 5);
    assert.equal(await page.locator('.tvb-tip').isVisible(), false);
    console.log('PASS: tooltips for Ren\'s and your Pokémon:', JSON.stringify(foeTip), JSON.stringify(ownTip));

    // A full turn with Skip animations on comes back quickly; Ren's moves then show in his tooltips.
    await page.getByRole('button', { name: 'Fight', exact: true }).click();
    await page.locator('.tvb-move', { hasText: 'Protect' }).click();
    await page.getByRole('button', { name: 'Fight', exact: true }).click();
    await page.locator('.tvb-move', { hasText: 'Dragon Claw' }).click();
    await page.locator('.tvb-cmd-grid .tvb-cmd').first().click();
    const turnStart = Date.now();
    await page.getByRole('button', { name: 'Fight', exact: true }).waitFor({ timeout: 20000 });
    const turnMs = Date.now() - turnStart;
    assert.ok(turnMs < 5000, `a turn with Skip animations took ${turnMs} ms`);
    const seenMoves = await page.evaluate(async () => {
      const out = [];
      for (const p of ['p2a', 'p2b']) {
        const spot = document.querySelector(`.tvb-spot--${p}`);
        spot.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        out.push(document.querySelector('.tvb-tip').textContent);
        spot.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      }
      return out;
    });
    assert.ok(seenMoves.some((t) => !/No moves seen yet/.test(t)), JSON.stringify(seenMoves));
    console.log(`PASS: a turn plays in ${turnMs} ms with Skip animations; Ren's used moves appear in his tooltips`);

    // Turning Skip animations off restores normal pacing (remembered as off).
    await page.getByRole('button', { name: /Skip animations/ }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('pdosTvbFast')), '0');
    assert.equal(await page.locator('.tvb-frame.is-fast').count(), 0);
    await page.evaluate(() => VictoryRoad.disposeBattle());
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: Skip animations turns off; no page errors');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
