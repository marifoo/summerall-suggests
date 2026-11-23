const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, game, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');

const { loadModule } = require('./app-modules.cjs');
const W = loadModule('watchability-module');
const { createCache } = loadModule('compact-cache-module');
const scoringPlay = (homeScore, awayScore, period = 4) => ({ homeScore, awayScore, period: { number: period } });

test('normalization preserves competition status when event status omits its type', async () => {
    const fixture = game();
    fixture.status = {};
    // The shipped isCompletedGame contract falls back to competition.type here.
    assert.equal(W.extractMetrics(fixture).completed, true);
    assert.equal(W.extractMetrics(W.normalizeGame(fixture)).completed, true);
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({ events: [fixture] })));
    await page.run('loadGames(11, 2, 2026)');
    assert.match(page.element('watchable-games').innerHTML, /Home Team/);
});


test('away-team comeback facts are symmetric and do not require a final win', () => {
    const home = W.extractPlayMetrics({ drives: [{ plays: [scoringPlay(0, 15, 3), scoringPlay(15, 15, 3), scoringPlay(15, 23), scoringPlay(23, 23, 5), scoringPlay(23, 26, 5)] }] });
    const away = W.extractPlayMetrics({ drives: [{ plays: [scoringPlay(15, 0, 3), scoringPlay(15, 15, 3), scoringPlay(23, 15), scoringPlay(23, 23, 5), scoringPlay(26, 23, 5)] }] });
    assert.equal(home.erasedDeficitSecondHalf, 15);
    assert.equal(home.erasedDeficitFourthQuarter, null);
    assert.equal(away.erasedDeficitSecondHalf, 15);
    assert.equal(away.erasedDeficitFourthQuarter, null);
    assert.deepEqual(away.comebackFacts.away, home.comebackFacts.home);
    assert.equal(away.leadChanges, home.leadChanges);
});

test('five-point games below a higher weekly winner have no stars', () => {
    const ranked = W.rankWeek([6, 5, 4].map(points => ({ metrics: { completed: true }, evaluation: { points, watchable: true } })));
    assert.deepEqual(ranked.map(item => item.ranking.stars), [3, 0, 0]);
    assert.deepEqual(ranked.map(item => item.ranking.tiedForFirst), [true, false, false]);
});

test('rules-only recalculation and repeated reads preserve the original metric expiry', () => {
    let now = 100;
    const map = new Map();
    const storage = { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
    const settings = { storage: () => storage, extractionVersion: 1, rulesVersion: 1, now: () => now };
    createCache(settings).set('decision', { metrics: { finalMargin: 2 }, evaluation: { points: 0 } }, 1000);
    now = 1000;
    const cache = createCache({ ...settings, rulesVersion: 2, evaluate: () => ({ points: 3 }) });
    assert.equal(cache.getEntry('decision').expiresAt, 1100);
    assert.equal(cache.get('decision').evaluation.points, 3);
    now = 1100;
    assert.equal(cache.get('decision'), null);
});

