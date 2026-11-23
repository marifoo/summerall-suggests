const {test} = require('node:test');
const assert = require('node:assert/strict');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const summary = plays => ({header:{competitions:[{competitors:[{id:'h',homeAway:'home'},{id:'a',homeAway:'away'}]}]},drives:{previous:[{plays}]}});
const play = (clock, start, end, extra = {}) => ({homeScore:10,awayScore:17,period:{number:4},clock:{displayValue:clock},scoringPlay:false,start:{down:1,team:{id:start}},end:{down:1,team:{id:end}},...extra});
const points = plays => W.evaluate({...W.extractMetrics({competitions:[]}, W.extractPlayMetrics(summary(plays))),completed:true}).rules.find(r=>r.id==='late-drama').points;
test('turnover at three minutes uses the team holding post-play possession',()=>{
 assert.equal(points([play('3:00','h','a',{isTurnover:true,type:{id:'26'}})]),0);
 assert.equal(points([play('3:00','a','h',{isTurnover:true,type:{id:'26'}})]),1);
});
test('terminal post-play ownership does not establish a live zero-clock possession',()=>{
 assert.equal(points([play('0:00','h','h',{type:{id:'66'}})]),0);
 assert.equal(points([play('0:00','h','h',{type:{id:'2'}})]),0);
});
test('a drive ending exclusively at three minutes leaves the lost possession outside the cutoff',()=>{
 assert.equal(points([play('3:10','h','h'),play('3:00','h','a',{isTurnover:true})]),0);
 assert.equal(points([play('3:10','h','h'),play('2:59','h','a',{isTurnover:true})]),0);
});
test('an explicitly described live untimed down is distinct from a terminal zero clock',()=>{
 assert.equal(points([play('0:00','h','h',{text:'Untimed down: pass incomplete',type:{id:'3'}})]),1);
 assert.equal(points([play('0:00','h','h',{text:'End of game',type:{id:'66'}})]),0);
});
