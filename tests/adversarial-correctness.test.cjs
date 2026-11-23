const {test} = require('node:test');
const assert = require('node:assert/strict');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const source = plays => ({header:{competitions:[{competitors:[{id:'1',homeAway:'home'},{id:'12',homeAway:'away'}]}]},drives:{previous:[{plays}]}});
const play = (home,away,period,clock,extra={}) => ({homeScore:home,awayScore:away,period:{number:period},clock:{displayValue:clock},...extra});

test('an independently marked tying score at five minutes establishes upper drama without earlier history', () => {
 const tiedScore=play(7,7,4,'5:00',{scoringPlay:true,scoringType:{name:'touchdown'},pointAfterAttempt:{value:1},start:{down:3,team:{id:'12'}}});
 const facts=W.extractPlayMetrics(source([tiedScore]));
 assert.equal(facts.q4TyingOrGoAhead,true);
 assert.ok(facts.q4ScoreClockUpperBound <=300);
 const m={...W.extractMetrics({competitions:[]},facts),completed:true};
 assert.equal(W.evaluate(m).rules.find(r=>r.id==='late-drama').points,2);
});

test('a verified tying score at five minutes is not timed to an earlier scoreless play', () => {
 const facts=W.extractPlayMetrics(source([
  play(0,7,4,'5:30',{scoringPlay:false}),
  play(7,7,4,'5:00',{scoringPlay:true,scoringType:{name:'touchdown'},pointAfterAttempt:{value:1},start:{down:3,team:{id:'1'}}})
 ]));
 assert.ok(facts.q4ScoreClockUpperBound <=300);
});

test('missing scores between known opposing leaders do not erase a verified lead switch', () => {
 const facts=W.extractPlayMetrics(source([
  play(7,0,1,'10:00'),play(null,null,1,'9:30'),play(7,10,1,'9:00')
 ]));
 assert.equal(facts.leadChanges,null);
 assert.equal(facts.leadChangesLowerBound,1);
});

test('a reconstructed scoring transition independently locates a Q4 eight-point recovery', () => {
 const facts=W.extractPlayMetrics(source([
  play(16,16,4,'5:00',{scoringPlay:true,scoringType:{name:'touchdown'},pointAfterAttempt:{value:2},type:{id:'67'},start:{down:3,team:{id:'1'}}})
 ]));
 assert.equal(facts.erasedDeficitFourthQuarter,8);
 assert.equal(facts.erasedDeficitSecondHalf,8);
});

test('recorded scoring logs prove attached conversions and independently recover the entering deficit', () => {
 const recorded=require('./fixtures/espn-eight-point-recovery.json');
 const actual=W.extractPlayMetrics(recorded);
 assert.equal(actual.erasedDeficitFourthQuarter,8);
 assert.equal(actual.q4TyingOrGoAhead,true);
 assert.equal(actual.q4ScoreClockUpperBound,315);
 for (const [clock,bound] of [['5:01',301],['5:00',300],['4:59',299],['0:00',0]]) {
  const data=structuredClone(recorded);
  data.drives.previous[0].plays[0].clock.displayValue=clock;
  data.scoringPlays[0].clock.displayValue=clock;
  const facts=W.extractPlayMetrics(data);
  assert.equal(facts.q4ScoreClockUpperBound,bound);
  assert.equal(facts.dramaEvidence.exactClock,bound);
 }
});

test('recorded scoring-team identity proves a go-ahead field goal without crediting a lead extension', () => {
 const recorded=require('./fixtures/espn-scoring-evidence.json');
 const data=structuredClone(recorded), fieldGoal=data.drives.previous[0].plays.at(-1);
 data.drives.previous[0].plays=[fieldGoal];
 fieldGoal.period.number=4; fieldGoal.clock.displayValue='5:00';
 const facts=W.extractPlayMetrics(data);
 assert.equal(facts.q4TyingOrGoAhead,true);
 assert.equal(facts.q4ScoreClockUpperBound,300);
 fieldGoal.homeScore=7;
 assert.equal(W.extractPlayMetrics(data).q4TyingOrGoAhead,null);
});

test('a retained scoring log proves a tying score even when its drive play is missing', () => {
 const recorded=structuredClone(require('./fixtures/espn-eight-point-recovery.json'));
 delete recorded.drives;
 recorded.scoringPlays[0].clock.displayValue='5:00';
 const facts=W.extractPlayMetrics(recorded);
 assert.equal(facts.q4TyingOrGoAhead,true);
 assert.equal(facts.q4ScoreClockUpperBound,300);
});

test('missing possession team IDs cannot accidentally map to a missing competitor ID', () => {
 const data={header:{competitions:[{competitors:[{homeAway:'home'}]}]},drives:{previous:[{plays:[
  play(7,14,4,'3:00',{scoringPlay:false,end:{down:1,team:{}}})
 ]}]}};
 assert.deepEqual(W.extractPlayMetrics(data).possessionEvidence,[]);
});

test('interval evidence projects score endpoints without retaining normalized plays or raw drives', () => {
 const raw=source([
  play(10,17,4,'4:50',{text:'RAW_DRIVE_SENTINEL'}),play(17,17,4,'4:00')
 ]);
 const facts=W.extractPlayMetrics(raw);
 assert.deepEqual(Object.keys(facts.dramaEvidence.before).sort(),['away','home']);
 assert.doesNotMatch(JSON.stringify(facts),/RAW_DRIVE_SENTINEL|"plays"|"drive"/);
});

test('unmatched scoring logs are not appended as a fabricated chronology when no common ordering exists', () => {
 const data=source([play(7,10,4,undefined,{id:'later',sequenceNumber:3000})]);
 data.scoringPlays=[{...play(14,10,3,'10:00'),id:'earlier',team:{id:'1'},scoringType:{name:'touchdown'}}];
 const facts=W.extractPlayMetrics(data);
 assert.equal(facts.leadChangesLowerBound,0);
 assert.equal(facts.q4TyingOrGoAhead,null);
});
