const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');
const scoringPlay = (homeScore, awayScore, period = 4) => ({ homeScore, awayScore, period: { number: period } });

for (const corruption of ['null', 'missing rules', 'wrong total', 'wrong rule points']) {
    test(`a saved decision with ${corruption} is recomputed without refetching source data`, async () => {
        const first = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
        await first.run('loadGames(11, 2, 2026)');
        const key = 'summerall:decision_123';
        const saved = JSON.parse(first.storage.get(key));
        if (corruption === 'null') saved.data.evaluation = null;
        if (corruption === 'missing rules') delete saved.data.evaluation.rules;
        if (corruption === 'wrong total') { saved.data.evaluation.points = 999; saved.data.evaluation.watchable = false; }
        if (corruption === 'wrong rule points') saved.data.evaluation.rules[0].points = 999;
        first.storage.set(key, JSON.stringify(saved));
        const reloaded = app(() => { throw new Error('Unexpired scores and facts should remain reusable'); }, { storage: first.storage });
        await reloaded.run('loadGames(11, 2, 2026)');
        assert.equal(reloaded.calls.length, 0);
        assert.equal(reloaded.element('week-display').textContent, '2026 Week 11');
        assert.match(reloaded.element('watchable-games').innerHTML, /Home Team/);
        const repaired = JSON.parse(reloaded.storage.get(key));
        assert.equal(repaired.data.evaluation.rules.length, 9);
        assert.equal(repaired.data.evaluation.points, 6);
        assert.equal(repaired.data.evaluation.rules[0].points, 1);
    });
}
