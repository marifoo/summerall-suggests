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
    { homeAway: 'home', score: String(home), linescores: id.startsWith('great-') ? [7,7,7,16].map(value => ({value})) : undefined, team: { abbreviation: 'HOME', displayName: 'Home Team' }, records: [{ type: 'total', summary: '7-3' }] },
    { homeAway: 'away', score: String(away), linescores: id.startsWith('great-') ? [7,10,9,10].map(value => ({value})) : undefined, team: { abbreviation: 'AWAY', displayName: 'Away Team' }, records: [{ type: 'total', summary: '6-4' }] }
] }] });
// Coherent quarter totals and separate TD/conversion states exercise real
// score, clock, possession and ranking contracts without live ESPN requests.
function gameSummary(id) {
    const result = { header: { competitions: [{ status: { type: { state: 'post' } },
        competitors: [{id:'h',homeAway:'home'}, {id:'a',homeAway:'away'}] }] }, drives: { previous: [] } };
    if (!id.startsWith('great-')) return result;
    const states = [
        [0,0,1,'15:00'], [7,0,1,'11:00'], [7,7,1,'5:00'],
        [7,10,2,'14:00'], [14,10,2,'9:00'], [14,17,2,'1:00'],
        [21,17,3,'10:00'], [21,23,3,'4:00'], [21,26,3,'0:00'],
        [27,26,4,'10:00'], [28,26,4,'9:59'], [28,29,4,'6:00'],
        [34,29,4,'4:30'], [35,29,4,'4:29'], [35,35,4,'2:00'],
        [35,36,4,'1:59'], [35,36,4,'1:00'], [37,36,4,'0:02']
    ];
    result.drives.previous = [{ plays: states.map(([homeScore,awayScore,period,time],i) => ({
        id:`${id}-${i}`, sequenceNumber:i+1, homeScore, awayScore,
        period:{number:period}, clock:{displayValue:time}, scoringPlay:i > 0 && i !== 16,
        ...(i === 16 ? {type:{id:'5'},start:{down:1,team:{id:'h'}},end:{down:2,team:{id:'h'}}} : {})
    })) }];
    return result;
}
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
                    const data = url.pathname.endsWith('/summary') ? gameSummary(url.searchParams.get('event')) : { season: { year: 2026, type: 2 }, week: { number: week }, events: [game('great-' + week, 37, 36), game('blowout-' + week, 40, 3), game('scheduled-' + week, 0, 0, 'pre')] };
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
                assert.deepEqual(await page.locator('#developer-content [data-game-id]').first().locator('[data-rule-id]').evaluateAll(rows => rows.map(row => row.dataset.ruleId)), ['general-scoring', 'close-finish', 'overtime', 'comeback', 'late-drama', 'lead-changes', 'shootout', 'team-quality', 'playoff-significance']);
                assert.equal(await page.locator('#developer-section').isVisible(), true);
                const decision = await page.evaluate(() => JSON.parse(localStorage.getItem('summerall:decision_great-11')).data);
                assert.equal(decision.evaluation.points, 10, mode.label + ': policy total');
                assert.equal(decision.evaluation.rules.find(rule => rule.id === 'late-drama').points, 2);
                assert.ok(decision.metrics.possessionEvidence.some(e => e.deficit === 1 && e.endClock <= 180));
                assert.equal((await page.locator('#watchable-games').innerText()).match(/⭐/g).length, 3);

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
