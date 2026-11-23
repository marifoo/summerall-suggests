const assert = require('node:assert/strict');
const { test } = require('node:test');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const play = (homeScore, awayScore, period) => ({ homeScore, awayScore, period: { number: period } });
const facts = plays => W.extractPlayMetrics({ drives: { previous: [{ plays }] } });
const metrics = overrides => ({ completed: true, finalMargin: 1, combinedScore: 47, overtime: false,
    homeRecordDifferential: -4, awayRecordDifferential: -4, ...facts([play(24, 23, 4)]), ...overrides });

test('every rule traces its inputs, thresholds, applicability, and awarded points', () => {
    const input = metrics();
    const result = W.evaluate(input);
    assert.equal(result.rules.length, 9);
    assert.equal(new Set(result.rules.map(rule => rule.id)).size, 9);
    for (const rule of result.rules) {
        assert.ok(Object.keys(rule.inputs).length > 0);
        assert.ok(Object.keys(rule.threshold).length > 0);
        assert.ok(Array.isArray(rule.tiers));
        assert.equal(rule.points, rule.tiers.find(t => t.id === rule.selectedTier)?.points ?? 0);
    }
    assert.ok(!result.rules.some(rule => rule.id === 'losing-teams'));
    assert.equal(result.rules.find(rule => rule.id === 'shootout').points, 0);
    assert.equal(result.points, result.rules.reduce((sum, rule) => sum + rule.points, 0));
    assert.deepEqual(result.recommendation, { eligible: true, threshold: 3, points: 3, decision: true });
    assert.deepEqual(W.evaluate(input), result);
    assert.equal(input.rules, undefined);
});

test('unavailable scores, records, linescores and plays remain explicit nulls', () => {
    const game = W.normalizeGame({ id: 'unknown', status: { type: { state: 'post' } }, competitions: [{ competitors: [
        { homeAway: 'home' }, { homeAway: 'away', score: '' }
    ] }] });
    const extracted = W.extractMetrics(game);
    for (const key of ['homeScore', 'awayScore', 'finalMargin', 'combinedScore', 'overtime',
        'leadChanges', 'lateLeadChange', 'homeRecordDifferential', 'awayRecordDifferential']) assert.equal(extracted[key], null, key);
    const evaluation = W.evaluate(extracted);
    assert.equal(evaluation.points, 0);
    assert.ok(evaluation.rules.every(rule => !rule.applicable && rule.matched === null && rule.points === 0));
    assert.equal(facts([]).leadChanges, null);
    assert.equal(facts([{ period: { number: 4 }, homeScore: 7 }]).lateLeadChange, null);
});

test('extraction stores threshold-independent comeback facts and final Q4 score evidence', () => {
    const result = facts([play(0, 16, 3), play(16, 16, 3), play(16, 25, 4), play(26, 25, 4)]);
    assert.equal(result.erasedDeficitSecondHalf, 16);
    assert.equal(result.erasedDeficitFourthQuarter, 9);
    assert.equal(result.comebackFacts.home.secondHalfDeficit, 16);
    assert.deepEqual(result.lastQ4Score, { before: { home: 16, away: 25 }, after: { home: 26, away: 25 }, previousLeader: 'away', newLeader: 'home' });
    assert.equal(result.lateLeadChange, true);
    assert.equal(result.leadChangesLowerBound, 1);
    assert.deepEqual(W.extractPlayMetrics({ drives: { 0: { plays: [play(0, 16, 3), play(16, 16, 3), play(16, 25, 4), play(26, 25, 4)] } } }), result);
});

test('ranking is independent of evaluation, handles all ties and leaves inputs untouched', () => {
    const items = [2, 4, 5, 5, 3].map((points, id) => ({ id, metrics: { completed: true }, evaluation: { points, watchable: points >= 3 } }));
    const ranked = W.rankWeek(items);
    assert.deepEqual(ranked.map(item => item.id), [2, 3, 1, 4, 0]);
    assert.deepEqual(ranked.map(item => item.ranking.stars), [3, 3, 0, 0, 0]);
    assert.deepEqual(ranked.map(item => item.ranking.rank), [1, 1, 3, 4, 5]);
    assert.ok(items.every(item => item.ranking === undefined));
    assert.deepEqual(W.rankWeek(items.slice(0, 2)).map(item => item.ranking.stars), [3, 0]);
    assert.deepEqual(W.rankWeek([]), []);
    const pending = W.rankWeek([{ metrics: { completed: false }, evaluation: { points: 0, watchable: false } }])[0];
    assert.equal(pending.ranking.rank, null);
    assert.equal(pending.ranking.weeklyMaximum, null);
});

test('normalization allowlists rendering metadata and actual scores, excluding ESPN payload bulk', () => {
    const data = W.normalizeGame({ id: 'g', junk: 'large', competitions: [{ competitors: [{ homeAway: 'home', score: '21',
        team: { displayName: 'Example', athletes: ['large'] }, statistics: ['large'], linescores: [{ value: 7, junk: 'large' }] }] }] });
    assert.equal(data.competitions[0].competitors[0].score, 21);
    assert.ok(!JSON.stringify(data).includes('large'));
});
