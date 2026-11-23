const assert = require('node:assert/strict');
const { test } = require('node:test');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const { game } = require('./app-harness.cjs');
const category = (id, metrics) => W.evaluate(metrics).rules.find(rule => rule.id === id);
const withQuarters = values => values.map(value => ({ value }));

for (const homeValues of [null, [0, 7, 7, 0]]) {
    test(`away overtime period survives normalization when home quarters are ${homeValues ? 'regulation-only' : 'unavailable'}`, () => {
        const raw = game('ot-tie', 'post', '14', '14');
        const [home, away] = raw.competitions[0].competitors;
        if (homeValues) home.linescores = withQuarters(homeValues);
        away.linescores = withQuarters([0, 7, 7, 0, 0]);
        const metrics = W.extractMetrics(W.normalizeGame(raw));
        assert.equal(metrics.overtime, true);
        assert.equal(category('overtime', metrics).points, 1);
    });
}

test('pregame record boundaries reverse wins and losses for both independent team categories', () => {
    for (const homeBefore of [1, 2, 6, 7]) {
        for (const awayBefore of [1, 2, 6, 7]) {
            const raw = game('records', 'post', '17', '14');
            const [home, away] = raw.competitions[0].competitors;
            home.records[0].summary = `${homeBefore + 2}-1`;
            away.records[0].summary = `${awayBefore + 1}-2`;
            const metrics = W.extractMetrics(W.normalizeGame(raw));
            assert.equal(metrics.homeRecordDifferential, homeBefore);
            assert.equal(metrics.awayRecordDifferential, awayBefore);
            assert.equal(category('team-quality', metrics).points, Number(homeBefore >= 2 && awayBefore >= 2));
            assert.equal(category('playoff-significance', metrics).points, Number(homeBefore >= 7 && awayBefore >= 7));
        }
    }
});

test('missing initial, middle or final drives preserve proved facts without inventing exact coverage', () => {
    const states = [[7, 0], [7, 10], [14, 10], [14, 17], [20, 17], [20, 24]];
    const drives = states.map(([homeScore, awayScore], i) => ({ plays: [{
        id: `play-${i}`, sequenceNumber: i + 1, homeScore, awayScore,
        period: { number: 4 }, clock: { displayValue: `4:0${5 - i}` }
    }] }));
    for (const omit of [0, 2, 5]) {
        const facts = W.extractPlayMetrics({ drives: { previous: drives.filter((_, i) => i !== omit) } });
        assert.equal(facts.leadChanges, null);
        assert.equal(facts.q4TyingOrGoAhead, true);
        assert.ok(facts.leadChangesLowerBound >= 3);
        assert.equal(category('lead-changes', { completed: true, ...facts }).points, 1);
    }
});

test('cached late-drama scalar claims need matching representative temporal evidence', async () => {
    const { app, summary, jsonResponse } = require('./app-harness.cjs');
    const page = app(() => jsonResponse(summary()));
    const raw = game();
    await page.run(`fetchGameFacts(${JSON.stringify(raw)})`);
    const key = 'summerall:facts_123';
    const saved = JSON.parse(page.storage.get(key));
    Object.assign(saved.data.playMetrics, { q4TyingOrGoAhead: true, q4ScoreClockUpperBound: 240, dramaEvidence: null });
    page.storage.set(key, JSON.stringify(saved));
    await page.run(`fetchGameFacts(${JSON.stringify(raw)})`);
    assert.equal(page.calls.length, 2, 'unsupported cached positive drama claims must be discarded and refetched');
});

test('live possession extraction respects clock, deficit, period and owning-team boundaries', () => {
    for (const clock of ['3:01', '3:00', '2:59']) for (const deficit of [0, 1, 8, 9]) {
        for (const possessor of ['h', 'a']) for (const period of [3, 4, 5]) {
            const source = { header: { competitions: [{ competitors: [
                { id: 'h', homeAway: 'home' }, { id: 'a', homeAway: 'away' }
            ] }] }, drives: { previous: [{ plays: [{
                homeScore: 10, awayScore: 10 + deficit, scoringPlay: false,
                period: { number: period }, clock: { displayValue: clock },
                start: { down: 1, team: { id: possessor } }, end: { down: 2, team: { id: possessor } }
            }] }] } };
            const facts = W.extractPlayMetrics(source);
            const metrics = { ...W.extractMetrics({ competitions: [] }, facts), completed: true };
            assert.equal(category('late-drama', metrics).points,
                Number(period === 4 && possessor === 'h' && deficit >= 1 && deficit <= 8 && clock !== '3:01'),
                JSON.stringify({ clock, deficit, possessor, period }));
        }
    }
});

test('Q4 entry competitiveness remains available when summary fetching is unavailable', () => {
    const raw = game('shootout', 'post', '45', '20');
    const [home, away] = raw.competitions[0].competitors;
    home.linescores = withQuarters([7, 7, 6, 25]);
    away.linescores = withQuarters([7, 7, 6, 0]);
    const metrics = W.extractMetrics(W.normalizeGame(raw));
    assert.equal(metrics.minQ4Margin, 0);
    assert.equal(metrics.endQ3Margin, 0);
    assert.equal(category('shootout', metrics).points, 2);
});

test('recorded ESPN overtime tie confirms fifth-quarter evidence and excludes OT-only drama', () => {
    const recorded = require('./fixtures/espn-401437880-ot-tie.json');
    const metrics = W.extractMetrics(W.normalizeGame(recorded.game));
    assert.equal(metrics.homeScore, 20);
    assert.equal(metrics.awayScore, 20);
    assert.equal(metrics.overtime, true);
    assert.equal(category('overtime', metrics).points, 1);
    const summaryFacts = W.extractPlayMetrics(recorded.summary, W.sourceContext(W.normalizeGame(recorded.game)));
    assert.equal(summaryFacts.erasedDeficitFourthQuarter, null);
    assert.equal(summaryFacts.q4TyingOrGoAhead, null);
});

for (const terminal of [false, true]) {
    test(terminal ? 'end-of-game pseudo-play at 0:00 does not establish live possession' :
        'turnover ending at 3:00 does not award a possession chance to the team that lost the ball', () => {
        const play = { homeScore:10, awayScore:17, period:{number:4},
            clock:{displayValue:terminal ? '0:00' : '3:00'}, scoringPlay:false,
            type:{id:terminal ? '66' : '5'}, isTurnover:!terminal,
            start:{down:1,team:{id:'h'}}, end:{down:1,team:{id:terminal ? 'h' : 'a'}} };
        const source = { header:{competitions:[{competitors:[{id:'h',homeAway:'home'},{id:'a',homeAway:'away'}]}]},
            drives:{previous:[{plays:[play]}]} };
        const facts = W.extractPlayMetrics(source);
        assert.equal(category('late-drama', {...W.extractMetrics({competitions:[]}, facts),completed:true}).points, 0);
    });
}

test('verified scoreboard OT period remains available when quarter-score arrays are missing', () => {
    const recorded = require('./fixtures/espn-401437880-ot-tie.json');
    const raw = structuredClone(recorded.game);
    raw.competitions[0].competitors.forEach(team => { delete team.linescores; });
    assert.equal(W.extractMetrics(W.normalizeGame(raw)).overtime, true);
});

test('a turnover play finishing below 3:00 cannot prove the former owner possessed below 3:00', () => {
    const source = { header:{competitions:[{competitors:[{id:'h',homeAway:'home'},{id:'a',homeAway:'away'}]}]},
        drives:{previous:[{plays:[
            {homeScore:10,awayScore:17,period:{number:4},clock:{displayValue:'3:01'},scoringPlay:false,type:{id:'5'},
                start:{down:1,team:{id:'h'}},end:{down:2,team:{id:'h'}}},
            {homeScore:10,awayScore:17,period:{number:4},clock:{displayValue:'2:59'},scoringPlay:false,type:{id:'5'},isTurnover:true,
                start:{down:2,team:{id:'h'}},end:{down:1,team:{id:'a'}}}
        ]}]} };
    const facts = W.extractPlayMetrics(source);
    const metrics = {...W.extractMetrics({competitions:[]},facts),completed:true};
    assert.equal(category('late-drama',metrics).points,0);
});
