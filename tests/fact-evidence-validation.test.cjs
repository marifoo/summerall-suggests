const {test} = require('node:test');
const assert = require('node:assert/strict');
const W = require('./app-modules.cjs').loadModule('watchability-module');
test('cached positive temporal claims require internally consistent supporting evidence',()=>{
 const empty=W.extractPlayMetrics(null);
 assert.equal(W.isPlayMetrics({...empty,q4TyingOrGoAhead:true}),false);
 assert.equal(W.isPlayMetrics({...empty,erasedDeficitFourthQuarter:8}),false);
 const recovered=W.extractPlayMetrics({drives:[{plays:[{homeScore:0,awayScore:8,period:{number:4}},{homeScore:8,awayScore:8,period:{number:4}}]}]});
 assert.equal(W.isPlayMetrics(recovered),true);
 recovered.comebackFacts.home.erasedFourthQuarterDeficit=9;
 assert.equal(W.isPlayMetrics(recovered),false);
});
