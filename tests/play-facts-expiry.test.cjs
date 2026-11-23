const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, game, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');
const scoringPlay = (homeScore, awayScore, period = 4) => ({ homeScore, awayScore, period: { number: period } });

test('in-memory weeks cannot outlive the cached play facts used for their decisions', async () => {
    let now = 0;
    const month = 30 * 24 * 60 * 60 * 1000;
    const response = () => ({ ...summary(), drives: { previous: [{ plays: now < month ?
        [scoringPlay(7, 0)] : [scoringPlay(7, 0), scoringPlay(7, 10)] }] } });
    const page = app(url => jsonResponse(url.includes('/summary?') ? response() : scoreboard()), { now: () => now });
    await page.run(`fetchGameFacts(${JSON.stringify(game())})`);
    now = month - 60 * 1000;
    const first = await page.run('weekResults.load(11, 2, 2026)');
    assert.equal(first.analyses[0].metrics.leadChangesLowerBound, 0);
    assert.equal(page.calls.filter(call => call.url.includes('/summary?')).length, 1);
    now = month + 60 * 1000;
    const refreshed = await page.run('weekResults.load(11, 2, 2026)');
    assert.equal(page.calls.filter(call => call.url.includes('/summary?')).length, 2);
    assert.equal(refreshed.analyses[0].metrics.leadChangesLowerBound, 1);
});
