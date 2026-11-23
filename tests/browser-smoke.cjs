// Optional browser checks; the dependency-free suite remains tests/*.test.cjs.
const { chromium } = require(process.env.SUMMERALL_PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'summerall-standalone-'));
const standalone = path.join(directory, 'index.html');
fs.copyFileSync(path.join(__dirname, '../index.html'), standalone);
const game = (id, home, away, state = 'post') => ({ id, date: '2026-11-22T18:00Z', status: { type: { state, completed: state === 'post', shortDetail: state === 'post' ? 'Final' : 'Scheduled' } }, competitions: [{ competitors: [
    { homeAway: 'home', score: String(home), team: { abbreviation: 'HOME', displayName: 'Home Team' }, records: [{ type: 'total', summary: '7-3' }] },
    { homeAway: 'away', score: String(away), team: { abbreviation: 'AWAY', displayName: 'Away Team' }, records: [{ type: 'total', summary: '6-4' }] }
] }] });
const server = http.createServer((req, res) => {
    if (!['/', '/Summerall-Suggests/', '/Summerall-Suggests/index.html'].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(fs.readFileSync(standalone));
});
(async () => {
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ executablePath: process.env.SUMMERALL_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
        const base = `http://127.0.0.1:${server.address().port}`;
        const modes = [
            { label: 'static root', url: base + '/' },
            { label: 'GitHub Pages repository subpath', url: base + '/Summerall-Suggests/' },
            { label: 'copied local file with styling CDN blocked', url: pathToFileURL(standalone).href, blockCDN: true }
        ];
        for (const mode of modes) {
            const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
            try {
                const page = await context.newPage();
                const errors = []; page.on('pageerror', error => errors.push(String(error)));
                if (mode.blockCDN) await page.route('https://cdn.tailwindcss.com/**', route => route.abort());
                await page.route('https://site.api.espn.com/**', async route => {
                    const url = new URL(route.request().url());
                    const week = Number(url.searchParams.get('week') || 11);
                    const data = url.pathname.endsWith('/summary') ? { header: { competitions: [{ status: { type: { state: 'post' } } }] }, drives: { previous: [{ plays: [
                        { homeScore: 0, awayScore: 15, period: { number: 3 } }, { homeScore: 37, awayScore: 36, period: { number: 4 } }
                    ] }] } } : { season: { year: 2026, type: 2 }, week: { number: week }, events: [game('great-' + week, 37, 36), game('blowout-' + week, 40, 3), game('scheduled-' + week, 0, 0, 'pre')] };
                    await route.fulfill({ json: data });
                });
                await page.goto(mode.url);
                await page.waitForFunction(() => document.querySelector('#week-display').textContent === '2026 Week 11');
                assert.equal(await page.locator('#developer-toggle').isChecked(), false, mode.label);
                assert.equal(await page.locator('#developer-content').innerHTML(), '', mode.label);
                assert.equal(await page.locator('#spoiler-content').isVisible(), false, mode.label + ': spoiler scores must stay hidden');
                assert.equal(await page.locator('#developer-section').isVisible(), false, mode.label);
                assert.doesNotMatch(await page.locator('#watchable-games').innerText(), /37|36|points|Final/);
                await page.locator('#developer-toggle').check();
                assert.equal(await page.locator('#developer-content [data-game-id]').count(), 3);
                assert.equal(await page.locator('#developer-content [data-rule-id]').count(), 39);
                assert.equal(await page.locator('#developer-section').isVisible(), true);
                if (!mode.blockCDN) {
                    await page.setViewportSize({ width: 390, height: 844 });
                    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
                }
                await page.locator('#developer-toggle').uncheck();
                assert.equal(await page.locator('#developer-content').innerHTML(), '');
                await page.locator('#clear-cache-btn').click();
                assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('summerall:')).length), 0);
                await page.reload();
                await page.waitForFunction(() => document.querySelector('#week-display').textContent === '2026 Week 11');
                assert.equal(await page.locator('#developer-toggle').isChecked(), false);
                assert.deepEqual(errors, []);
                console.log('Browser smoke passed: ' + mode.label);
            } finally { await context.close(); }
        }
    } finally {
        if (browser) await browser.close();
        server.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
