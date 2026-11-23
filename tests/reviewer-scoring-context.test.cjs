const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, game, summary, jsonResponse, plain } = require('./app-harness.cjs');
const W = require('./app-modules.cjs').loadModule('watchability-module');
const fetchFacts = (a,g) => a.run(`fetchGameFacts(${JSON.stringify(g)})`);
const anchored = () => {
 const g = game();
 g.competitions[0].competitors.forEach(t => t.linescores = [0,7,7,0].map(value => ({value})));
 return g;
};
for (const correction of ['unknown anchors', 'final scores']) {
 test(`facts refetch on ${correction} correction and preserve matching cache reuse`, async () => {
  const a = app(() => jsonResponse(summary()));
  const original = correction === 'unknown anchors' ? game() : anchored();
  await fetchFacts(a,original);
  await fetchFacts(a,original);
  assert.equal(a.calls.length,1);
  const changed = correction === 'unknown anchors' ? anchored() : structuredClone(original);
  if (correction === 'final scores') changed.competitions[0].competitors[0].score = '40';
  const facts = await fetchFacts(a,changed);
  assert.equal(a.calls.length,2);
  assert.deepEqual(plain(facts.sourceContext),W.sourceContext(changed));
 });
}
test('overlapping different-context requests do not share facts or overwrite newer context', async () => {
 const resolves=[];
 const a=app(() => new Promise(resolve=>resolves.push(resolve)));
 const original=anchored(), changed=structuredClone(original);
 changed.competitions[0].competitors[0].score='40';
 const first=fetchFacts(a,original), second=fetchFacts(a,changed);
 assert.equal(a.calls.length,2);
 resolves[1](jsonResponse(summary()));
 const fresh=await second;
 resolves[0](jsonResponse(summary()));
 const older=await first;
 assert.deepEqual(plain(fresh.sourceContext),W.sourceContext(changed));
 assert.deepEqual(plain(older.sourceContext),W.sourceContext(original));
 assert.deepEqual(JSON.parse(a.storage.get('summerall:facts_123')).data.sourceContext,W.sourceContext(changed));
});
test('malformed new cached drama evidence triggers summary refetch', async () => {
 const a=app(() => jsonResponse(summary()));
 const g=anchored();
 await fetchFacts(a,g);
 const saved=JSON.parse(a.storage.get('summerall:facts_123'));
 saved.data.playMetrics.dramaEvidence={period:4,exactClock:null,clockRange:[290,240],before:{home:10,away:17},after:{home:17,away:17}};
 a.storage.set('summerall:facts_123',JSON.stringify(saved));
 await fetchFacts(a,g);
 assert.equal(a.calls.length,2);
});
