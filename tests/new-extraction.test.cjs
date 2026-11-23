const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('./app-modules.cjs').loadModule('watchability-module');
const p=(h,a,q,t)=>({homeScore:h,awayScore:a,period:{number:q},clock:{displayValue:t}});
const extract=(plays,ctx)=>W.extractPlayMetrics({drives:{previous:[{plays}]}},ctx);
test('regulation comeback excludes OT recovery',()=>{
 assert.equal(extract([p(0,16,3),p(16,16,5)]).erasedDeficitSecondHalf,null);
});
test('Q4 entry anchor preserves first play recovery',()=>{
 const result=extract([p(16,16,4,'14:59')],{halftime:null,endQ3:{home:8,away:16},final:null});
 assert.equal(result.erasedDeficitFourthQuarter,8);
});
test('Q4 clock interval proves drama without assigning endpoint time',()=>{
 const result=extract([p(10,17,4,'4:50'),p(17,17,4,'4:00')]);
 assert.equal(result.q4TyingOrGoAhead,true);
 assert.equal(result.q4ScoreClockUpperBound,290);
 assert.deepEqual(result.dramaEvidence.clockRange,[240,290]);
});
test('unknown quarter boundary cannot time a Q4 recovery',()=>{
 const result=extract([p(0,16,3,'2:00'),p(16,16,4,'12:00')]);
 assert.equal(result.erasedDeficitFourthQuarter,null);
});
test('actual ESPN adapter orders and deduplicates previous/current collections',()=>{
 const source=require('./fixtures/espn-401671793.json');
 const original=W.extractPlayMetrics(source);
 const overlap=structuredClone(source); overlap.drives.current=overlap.drives.previous.at(-1);
 assert.deepEqual(W.extractPlayMetrics(overlap),original);
 assert.ok(original.leadChangesLowerBound>0);
 assert.equal(original.leadChanges,null);
 assert.equal(W.isPlayMetrics(original),true);
});
test('live scoreless observation at three minutes establishes trailing possession',()=>{
 const play={...p(10,17,4,'3:00'),scoringPlay:false,start:{down:1,team:{id:'h'}},end:{down:2,team:{id:'h'}}};
 const source={header:{competitions:[{competitors:[{id:'h',homeAway:'home'}]}]},drives:{previous:[{plays:[play]}]}};
 assert.equal(W.evaluate({...W.extractMetrics({competitions:[]},W.extractPlayMetrics(source)),completed:true}).rules.find(r=>r.id==='late-drama').points,1);
 play.end.down=0;
 assert.equal(W.evaluate({...W.extractMetrics({competitions:[]},W.extractPlayMetrics(source)),completed:true}).rules.find(r=>r.id==='late-drama').points,0);
});
test('contradictory final context cannot award temporal bonuses',()=>{
 const result=extract([p(10,17,4,'4:50'),p(17,17,4,'4:00')],{halftime:null,endQ3:null,final:{home:10,away:17}});
 assert.equal(result.q4TyingOrGoAhead,null);
 assert.equal(result.erasedDeficitFourthQuarter,null);
});
test('halftime contradiction prevents a fabricated Q4 comeback',()=>{
 const result=extract([p(0,16,4,'12:00'),p(16,16,4,'4:00')],{halftime:{home:7,away:16},endQ3:null,final:null});
 assert.equal(result.erasedDeficitFourthQuarter,null);
});
