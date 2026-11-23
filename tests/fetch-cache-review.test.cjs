const {test} = require('node:test');
const assert = require('node:assert/strict');
const {app, game, scoreboard, summary, jsonResponse} = require('./app-harness.cjs');

test('cached discovery cannot install a latest week beyond the NFL calendar', async()=>{
 const first=app(url=>jsonResponse(url.includes('/summary?')?summary():scoreboard()));
 await first.run('loadGames()');
 const key='summerall:scoreboard';
 const saved=JSON.parse(first.storage.get(key));
 saved.data.latest.week=99;
 first.storage.set(key,JSON.stringify(saved));
 const reload=app(url=>jsonResponse(url.includes('/summary?')?summary():scoreboard()),{storage:first.storage});
 await reload.run('loadGames()');
 assert.equal(reload.run('latestWeek'),11);
 assert.equal(reload.calls.filter(call=>!call.url.includes('/summary?')).length,1);
});

test('a summary for another game must not be cached as the requested game', async()=>{
 const incorrect={...summary(),header:{...summary().header,id:'different-game'}};
 const page=app(()=>jsonResponse(incorrect));
 await assert.rejects(page.run(`fetchGameFacts(${JSON.stringify(game())})`),/different|unexpected|game/i);
 assert.equal(page.storage.has('summerall:facts_123'),false);
});

test('summary competition identity must agree with the requested event', async()=>{
 const incorrect=summary();
 incorrect.header.competitions[0].id='different-game';
 const page=app(()=>jsonResponse(incorrect));
 await assert.rejects(page.run(`fetchGameFacts(${JSON.stringify(game())})`),/different|unexpected|game/i);
 assert.equal(page.storage.has('summerall:facts_123'),false);
});

test('cached facts for another event are removed and refetched',async()=>{
 const page=app(()=>jsonResponse(summary()));
 await page.run(`fetchGameFacts(${JSON.stringify(game())})`);
 const key='summerall:facts_123';
 const saved=JSON.parse(page.storage.get(key));
 saved.data.gameId='different-game';
 page.storage.set(key,JSON.stringify(saved));
 await page.run(`fetchGameFacts(${JSON.stringify(game())})`);
 assert.equal(page.calls.length,2);
});

test('malformed cached season calendar cannot poison navigation arithmetic',async()=>{
 const first=app(url=>jsonResponse(url.includes('/summary?')?summary():scoreboard()));
 await first.run('loadGames(11,2,2026)');
 const key='summerall:scoreboard_2026_2_11';
 const saved=JSON.parse(first.storage.get(key));
 saved.data.leagues[0].calendar[0].entries[0].value='not-a-week';
 first.storage.set(key,JSON.stringify(saved));
 const page=app(url=>jsonResponse(url.includes('/summary?')?summary():scoreboard()),{storage:first.storage});
 await page.run('loadGames(11,2,2026)');
 assert.equal(page.run('getLastWeek(2,2026)'),18);
 assert.equal(page.run('getPreviousWeek(1,3,2026).week'),18);
});

test('malformed live calendar shape cannot poison subsequent healthy week requests',async()=>{
 const bad=scoreboard();
 bad.leagues[0].calendar={unsupported:'calendar-object'};
 let attempts=0;
 const page=app(()=>jsonResponse(++attempts===1?bad:scoreboard()));
 await page.run('fetchScoreboardForWeek(11,2,2026)').catch(()=>{});
 const healthy=await page.run('fetchScoreboardForWeek(11,2,2026,true)');
 assert.equal(healthy.week.number,11);
 assert.equal(page.run('getLastWeek(2,2026)'),18);
});
