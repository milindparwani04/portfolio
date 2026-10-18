// Journal grid + reader and the Toolbox toggle, at desktop and phone widths (Edge, headless).
// Run: node tests/journal-browser.cjs   (JOURNAL_BASE=https://milindparwani.com to check production)
const fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
const { chromium } = require('C:/Users/milin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.resolve(root, '.' + decodeURIComponent(url === '/' ? '/index.html' : url));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = process.env.JOURNAL_BASE || `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    for (const [width, height] of [[1280, 900], [800, 560], [390, 844]]) {
      const phone = width <= 720;
      const page = await browser.newPage({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/#v2-journal');
      const cards = page.locator('.pdos-journal-card');
      await cards.first().waitFor();
      await page.waitForTimeout(700);
      const locked = () => page.locator('html').evaluate((e) => e.classList.contains('pdos-locked'));
      const visibleEntries = () => page.locator('.pdos-journal-entry:visible').count();

      // Index: three cards with headline + byline, nothing open, three columns on desktop.
      assert.equal(await cards.count(), 3);
      for (const card of await cards.all()) {
        assert.ok((await card.locator('.pdos-journal-card-title').innerText()).length > 0);
        assert.ok((await card.locator('.pdos-journal-card-byline').innerText()).length > 20);
      }
      assert.equal(await visibleEntries(), 0);
      const cols = await page.locator('.pdos-journal-grid').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      assert.equal(cols, phone ? 1 : 3);

      // Keyboard open: reader shows the entry, page locks, focus moves to the entry title.
      await cards.first().focus();
      await cards.first().press('Enter');
      await page.waitForTimeout(650);
      assert.equal(await visibleEntries(), 1);
      assert.ok(await page.locator('#pdosJournal1').isVisible());
      assert.equal(await locked(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'pdosJournalTitle1');
      const box = await page.locator('#pdosJournalReader').boundingBox();
      assert.ok(box.x + box.width <= width + 1, 'reader stays inside the viewport');
      if (phone) assert.ok(box.width >= width - 1 && box.y <= 1, 'reader covers the phone screen');

      // Switch entries (desktop: the grid stays clickable), then press the open card again to close.
      if (!phone) {
        await cards.nth(1).click();
        assert.ok(await page.locator('#pdosJournal2').isVisible());
        await cards.nth(1).click();
        await page.waitForTimeout(650);
        assert.equal(await visibleEntries(), 0);
        assert.equal(await locked(), false);
        assert.equal(await cards.nth(1).evaluate((e) => e === document.activeElement), true);
        await cards.nth(2).click();
        await page.waitForTimeout(650);
      }

      // Escape closes; ✕ closes; on phones the back gesture closes without leaving the page.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(650);
      assert.equal(await visibleEntries(), 0);
      assert.equal(await locked(), false);
      await cards.first().click();
      await page.getByRole('button', { name: 'Close entry', exact: true }).click();
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.pdos-journal.is-open').count(), 0);
      if (phone) {
        const url = page.url();
        await cards.nth(2).click();
        await page.waitForTimeout(500);
        await page.goBack();
        await page.waitForTimeout(650);
        assert.equal(await page.locator('.pdos-journal.is-open').count(), 0);
        assert.equal(page.url(), url);
        assert.equal(await locked(), false);
      }

      // Toolbox: pressing the open tool again closes it and returns the borrowed tool.
      await page.locator('#v2-tools').evaluate((e) => e.scrollIntoView());
      await page.waitForTimeout(800);
      const tool = page.locator('.pdos-tool[data-tool="qrGenModal"]');
      await tool.evaluate((e) => e.click());
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.pdos-toolbox.is-open').count(), 1);
      assert.equal(await page.locator('#pdosToolSlot #qrGenModal').count(), 1);
      await tool.evaluate((e) => e.click());
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.pdos-toolbox.is-open').count(), 0);
      assert.equal(await page.locator('#pdosToolSlot').evaluate((e) => e.children.length), 0);
      assert.equal(await locked(), false);

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: journal grid, open/switch/toggle/Esc/✕${phone ? '/back' : ''}, lock, focus; toolbox toggle; no overflow or page errors`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
