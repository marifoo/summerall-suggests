const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');
const W = require('./app-modules.cjs').loadModule('watchability-module');

function alternatingPlays(changes = 5) {
    let home = 3, away = 0;
    const plays = [{ homeScore: home, awayScore: away, period: { number: 3 } }];
    for (let i = 0; i < changes; i++) {
        if (i % 2 === 0) away = home + 3;
        else home = away + 3;
        plays.push({ homeScore: home, awayScore: away, period: { number: 3 } });
    }
    return plays;
}

test('missing period metadata does not discard a fully observable lead-change count', () => {
    const plays = alternatingPlays();
    delete plays[2].period;
    const extracted = W.extractPlayMetrics({ drives: [{ plays }] });
    assert.equal(extracted.leadChangesLowerBound, 5);
    assert.equal(extracted.q4TyingOrGoAhead, null);
});

