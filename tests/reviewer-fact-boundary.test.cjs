const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');

test('cached play facts cannot override completion, scores, or records owned by scoreboard metrics', async () => {
    const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    await first.run('loadGames(11, 2, 2026)');
    const key = 'summerall:facts_123';
    const saved = JSON.parse(first.storage.get(key));
    Object.assign(saved.data.playMetrics, { completed: false, homeScore: 999, homeRecord: 'wrong source' });
    first.storage.set(key, JSON.stringify(saved));
    const reloaded = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: first.storage });
    const result = await reloaded.run('weekResults.load(11, 2, 2026)');
    assert.equal(reloaded.calls.length, 0); // Valid play facts can be reused without another request.
    assert.equal(result.analyses[0].metrics.completed, true);
    assert.equal(result.analyses[0].metrics.homeScore, 37);
    assert.equal(result.analyses[0].metrics.homeRecord, '6-3');
    assert.equal(result.analyses[0].evaluation.watchable, true);
});
