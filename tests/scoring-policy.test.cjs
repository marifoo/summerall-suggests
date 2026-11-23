const assert = require('node:assert/strict');
const { test } = require('node:test');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const base = { completed: true, combinedScore: 28, finalMargin: 9, overtime: false,
 erasedDeficitSecondHalf: 0, erasedDeficitFourthQuarter: 0, leadChanges: 0,
 q4TyingOrGoAhead: false, q4ScoreClockUpperBound: null, latePossessionChance: false,
 minQ4Margin: 20, endQ3Margin: 20, homeRecordDifferential: 0, awayRecordDifferential: 0 };
const category = (id, m) => W.evaluate({...base,...m}).rules.find(r=>r.id===id);
test('nine capped categories implement score, margin, OT, comeback and record boundaries',()=>{
 assert.equal(W.evaluate(base).rules.length,9);
 for(const n of [28,29]) assert.equal(category('general-scoring',{combinedScore:n}).points,n>28?1:0);
 for(const n of [0,2,3,8,9]) assert.equal(category('close-finish',{finalMargin:n}).points,n<=2?2:n<=8?1:0);
 assert.equal(category('overtime',{overtime:true,finalMargin:0}).points,1);
 assert.equal(category('comeback',{erasedDeficitSecondHalf:15,erasedDeficitFourthQuarter:8}).points,2);
 assert.equal(category('comeback',{erasedDeficitSecondHalf:0,erasedDeficitFourthQuarter:8}).points,2);
 assert.equal(W.evaluate({...base,homeRecordDifferential:7,awayRecordDifferential:7}).points,2);
});
test('partial lead evidence awards supported minimum and retains unresolved upper tier',()=>{
 for(const n of [0,2,3,4,5,7,10]) assert.equal(category('lead-changes',{leadChanges:n}).points,n>=5?2:n>=3?1:0);
 const r=category('lead-changes',{leadChanges:null,leadChangesLowerBound:3});
 assert.equal(r.points,1); assert.equal(r.tiers[1].matched,null);
 assert.equal(category('lead-changes',{leadChanges:null,leadChangesLowerBound:5}).points,2);
});
test('drama alternatives and shootout tiers preserve known evidence',()=>{
 for(const seconds of [301,300,299]) assert.equal(category('late-drama',{q4TyingOrGoAhead:true,q4ScoreClockUpperBound:seconds}).points,seconds<=300?2:1);
 assert.equal(category('late-drama',{q4TyingOrGoAhead:null,possessionEvidence:[{period:4,deficit:7,endClock:180,endInclusive:true}]}).points,1);
 for(const total of [54,55,64,65]) assert.equal(category('shootout',{combinedScore:total,finalMargin:10}).points,total>=65?2:total>=55?1:0);
 assert.equal(category('shootout',{combinedScore:65,finalMargin:30,minQ4Margin:7}).points,2);
 assert.equal(category('shootout',{combinedScore:55,finalMargin:30,minQ4Margin:7}).points,1);
 assert.equal(category('shootout',{combinedScore:65,finalMargin:30,endQ3Margin:10}).points,2);
});
test('winner-first stars and independent immutable ranking',()=>{
 for(const [scores,stars] of [[[8,6,5,3,2],[3,1,0,0,0]],[[4,4,3],[3,3,0]],[[6,6,5],[3,3,0]],[[3],[3]],[[2,1],[0,0]]]){
 const items=scores.map(points=>({metrics:{completed:true},evaluation:{points,watchable:points>=3}}));
 assert.deepEqual(W.rankWeek(items).map(x=>x.ranking.stars),stars); assert.ok(items.every(x=>!x.ranking));
 }
});

test('a proved drama clock upper bound cannot disprove the five-minute tier', () => {
 const rule = category('late-drama', { q4TyingOrGoAhead: true, q4ScoreClockUpperBound: 310 });
 assert.equal(rule.points, 1);
 assert.equal(rule.tiers[1].matched, null);
 assert.match(rule.explanation, /higher tier unresolved/);
});

test('category totals remain capped, deterministic and restricted to completed games', () => {
 const allFacts = {...base, combinedScore: 65, finalMargin: 0, overtime: true,
  erasedDeficitSecondHalf: 15, erasedDeficitFourthQuarter: 8, q4TyingOrGoAhead: true,
  q4ScoreClockUpperBound: 300, leadChanges: 10, homeRecordDifferential: 7, awayRecordDifferential: 7};
 const result = W.evaluate(allFacts);
 assert.equal(result.points, 14);
 assert.equal(result.points, result.rules.reduce((sum, rule) => sum + rule.points, 0));
 assert.deepEqual(result, W.evaluate(allFacts));
 for (const completed of [false, null, undefined]) {
  const ineligible = W.evaluate({...allFacts, completed});
  assert.equal(ineligible.points, 0);
  assert.equal(ineligible.watchable, false);
 }
});

test('partial comeback and competitiveness bounds retain unresolved higher tiers', () => {
 const comeback = category('comeback', {erasedDeficitSecondHalf: 15, erasedDeficitFourthQuarter: 7});
 assert.equal(comeback.points, 1);
 assert.equal(comeback.tiers[1].matched, null);
 const shootout = category('shootout', {combinedScore: 65, finalMargin: 20, minQ4Margin: 11, endQ3Margin: 20});
 assert.equal(shootout.points, 0);
 assert.equal(shootout.tiers[0].matched, null);
 assert.equal(shootout.tiers[1].matched, null);
});

test('possession drama is reevaluated from compact evidence rather than a saved policy decision', () => {
 const evidence = {period:4, deficit:8, startClock:190, endClock:180, endInclusive:true};
 assert.equal(category('late-drama', {q4TyingOrGoAhead:false, latePossessionChance:false, possessionEvidence:[evidence]}).points,1);
 assert.equal(category('late-drama', {q4TyingOrGoAhead:false, latePossessionChance:true, possessionEvidence:[]}).points,0);
 for (const patch of [{deficit:9},{deficit:0},{endInclusive:false},{period:5}]) {
  assert.equal(category('late-drama', {q4TyingOrGoAhead:false, latePossessionChance:true, possessionEvidence:[{...evidence,...patch}]}).points,0);
 }
});
