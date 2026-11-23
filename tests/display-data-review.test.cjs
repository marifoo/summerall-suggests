const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, game } = require('./app-harness.cjs');
const render = (home, away) => {
    const fixture = game('quarters', 'post', '10', '13');
    const teams = fixture.competitions[0].competitors;
    if (home !== null) teams[0].linescores = home.map(value => ({ value }));
    if (away !== null) teams[1].linescores = away.map(value => ({ value }));
    return app(() => {}).run(`renderSpoilerGame(${JSON.stringify(fixture)})`);
};
const rows = markup => [...markup.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match =>
    [...match[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map(cell => cell[1].trim()));

test('spoiler table preserves away-only quarter and overtime evidence with unavailable home cells', () => {
    assert.deepEqual(rows(render(null, [0, 7, 3, 0, 3])), [
        ['Team', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'F'],
        ['AWAY', '0', '7', '3', '0', '3', '13'],
        ['HOME', '—', '—', '—', '—', '—', '10']
    ]);
});

test('spoiler table aligns asymmetric overtime rows and labels every overtime period', () => {
    assert.deepEqual(rows(render([0, 7, 3, 0], [0, 7, 3, 0, 0, 3])), [
        ['Team', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT', 'F'],
        ['AWAY', '0', '7', '3', '0', '0', '3', '13'],
        ['HOME', '0', '7', '3', '0', '—', '—', '10']
    ]);
});

test('a clock beyond the quarter duration stays unknown without invalidating observed scoring facts', () => {
    const W = require('./app-modules.cjs').loadModule('watchability-module');
    const facts = W.extractPlayMetrics({drives:[{plays:[{
        homeScore:17, awayScore:17, period:{number:4}, clock:{displayValue:'15:01'}, scoringPlay:true
    }]}]});
    assert.equal(facts.q4TyingOrGoAhead, true);
    assert.equal(facts.q4ScoreClockUpperBound, null);
    assert.equal(facts.dramaEvidence.exactClock, null);
    assert.equal(W.isPlayMetrics(facts), true);
});

test('a known preceding Q4 clock bounds a later tying score whose own clock is missing', () => {
    const W = require('./app-modules.cjs').loadModule('watchability-module');
    for (const scoringPlay of [true, false]) {
        const facts = W.extractPlayMetrics({drives:[{plays:[
            {id:'before',sequenceNumber:1,homeScore:10,awayScore:17,period:{number:4},clock:{displayValue:'4:50'}},
            {id:'after',sequenceNumber:2,homeScore:17,awayScore:17,period:{number:4},scoringPlay}
        ]}]});
        assert.equal(facts.q4TyingOrGoAhead, true);
        assert.equal(facts.q4ScoreClockUpperBound, 290);
        assert.equal(facts.dramaEvidence.exactClock, null);
        assert.deepEqual(facts.dramaEvidence.clockRange, [0,290]);
        assert.equal(W.evaluate({completed:true,...facts}).rules.find(rule=>rule.id==='late-drama').points,2);
    }
});

test('an unavailable score between verified Q4 states does not discard a proved scoring interval', () => {
    const W = require('./app-modules.cjs').loadModule('watchability-module');
    const facts = W.extractPlayMetrics({drives:[{plays:[
        {sequenceNumber:1,homeScore:10,awayScore:17,period:{number:4},clock:{displayValue:'4:50'}},
        {sequenceNumber:2,period:{number:4},clock:{displayValue:'4:20'}},
        {sequenceNumber:3,homeScore:17,awayScore:17,period:{number:4},clock:{displayValue:'4:00'},scoringPlay:false}
    ]}]});
    assert.equal(facts.q4TyingOrGoAhead, true);
    assert.equal(facts.q4ScoreClockUpperBound, 290);
    assert.deepEqual(facts.dramaEvidence.clockRange, [240,290]);
});

test('a lower selected tier does not misstate the category maximum in developer explanations', () => {
    const W = require('./app-modules.cjs').loadModule('watchability-module');
    const comeback = W.evaluate({completed:true,erasedDeficitSecondHalf:15,erasedDeficitFourthQuarter:null})
        .rules.find(rule=>rule.id==='comeback');
    assert.equal(comeback.points,1);
    assert.equal(comeback.weight,2);
    assert.doesNotMatch(comeback.explanation,/capped at 1/);
    assert.match(comeback.explanation,/higher tier unresolved/);
});
