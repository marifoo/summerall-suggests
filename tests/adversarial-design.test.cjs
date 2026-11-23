const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('./app-modules.cjs').loadModule('watchability-module');

test('possession summaries retain the latest observation for each positive deficit', () => {
    const play = (home, away, clock) => ({homeScore:home, awayScore:away, period:{number:4},
        clock:{displayValue:clock}, scoringPlay:false, start:{down:1, team:{id:'home'}}, end:{down:2, team:{id:'home'}}});
    const facts = W.extractPlayMetrics({header:{competitions:[{competitors:[{id:'home',homeAway:'home'}]}]},
        drives:{previous:[{plays:[play(0,8,'3:00'),play(7,8,'2:00')]}]}});
    assert.deepEqual(facts.possessionEvidence.map(e => [e.deficit,e.endClock]), [[8,180],[1,120]]);
});

test('mutating an evaluation trace cannot change future policy evaluations', () => {
    const metrics = {completed:true, q4TyingOrGoAhead:false,
        possessionEvidence:[{period:4,deficit:7,endClock:500,endInclusive:true}]};
    const before = W.evaluate(metrics);
    const category = before.rules.find(rule => rule.id === 'late-drama');
    const threshold = category.tiers[0].threshold;
    const originalClock = threshold.maxPossessionClock;
    const originalDeficit = threshold.possessionDeficit[1];
    try {
        threshold.maxPossessionClock = 900;
        threshold.possessionDeficit[1] = 20;
        assert.equal(W.evaluate(metrics).rules.find(rule => rule.id === 'late-drama').points, 0);
    } finally {
        // Before the fix these references point to policy state. Restore it so
        // this regression cannot contaminate other tests in the same process.
        threshold.maxPossessionClock = originalClock;
        threshold.possessionDeficit[1] = originalDeficit;
    }
});

test('facts and metrics expose only the current category evidence contract', () => {
    const facts = W.extractPlayMetrics(null);
    const metrics = W.extractMetrics({competitions:[]}, facts);
    for (const oldName of ['lateLeadChange', 'lastQ4Score', 'latePossessionChance']) {
        assert.equal(Object.hasOwn(facts, oldName), false, oldName);
        assert.equal(Object.hasOwn(metrics, oldName), false, oldName);
    }
});
