const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');
const W = require('./app-modules.cjs').loadModule('watchability-module');

test('a corrupt compact scoreboard is discarded and refetched rather than poisoning navigation', async () => {
    const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    await first.run('loadGames(11, 2, 2026)');
    const key = 'summerall:scoreboard_2026_2_11';
    const saved = JSON.parse(first.storage.get(key));
    saved.data.events = null;
    first.storage.set(key, JSON.stringify(saved));
    const reload = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: first.storage });
    await reload.run('loadGames(11, 2, 2026)');
    assert.equal(reload.element('week-display').textContent, '2026 Week 11');
    assert.equal(reload.calls.length, 1);
});

test('malformed cached play facts are refetched instead of used as scoring inputs', async () => {
    const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    await first.run('loadGames(11, 2, 2026)');
    const key = 'summerall:facts_123';
    const saved = JSON.parse(first.storage.get(key));
    saved.data.playMetrics.leadChanges = 'not a count';
    first.storage.set(key, JSON.stringify(saved));
    const reload = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: first.storage });
    const data = await reload.run('weekResults.load(11, 2, 2026)');
    assert.equal(reload.calls.length, 1);
    assert.equal(data.analyses[0].metrics.leadChanges, null);
});

for (const corruption of ['scoreboard events', 'latest boundary']) {
    test(`a malformed cached discovery ${corruption} is discarded before it can affect week loading`, async () => {
        const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
        await first.run('loadGames()');
        const key = 'summerall:scoreboard';
        const saved = JSON.parse(first.storage.get(key));
        if (corruption === 'scoreboard events') saved.data.scoreboard.events = null;
        else saved.data.latest.week = 'eleven';
        first.storage.set(key, JSON.stringify(saved));
        const reload = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: first.storage });
        await reload.run('loadGames()');
        assert.equal(reload.element('week-display').textContent, '2026 Week 11');
        assert.equal(reload.run('latestWeek'), 11);
        assert.equal(reload.calls.length, 1);
    });
}

for (const wrongField of ['week', 'year', 'season type']) {
    test(`a cached scoreboard for the wrong ${wrongField} is refetched for the requested period`, async () => {
        const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
        await first.run('loadGames(11, 2, 2026)');
        const key = 'summerall:scoreboard_2026_2_11';
        const saved = JSON.parse(first.storage.get(key));
        if (wrongField === 'week') saved.data.week.number = 10;
        if (wrongField === 'year') saved.data.season.year = 2025;
        if (wrongField === 'season type') saved.data.season.type = 3;
        first.storage.set(key, JSON.stringify(saved));
        const reload = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: first.storage });
        await reload.run('loadGames(11, 2, 2026)');
        assert.equal(reload.element('week-display').textContent, '2026 Week 11');
        assert.equal(reload.calls.length, 1);
    });
}
