const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, scoreboard, summary, jsonResponse } = require('./app-harness.cjs');
const W = require('./app-modules.cjs').loadModule('watchability-module');

test('clearing a cached discovery before its load continuation prevents new persistent writes', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    await page.run('loadGames()');
    const before = page.calls.length;
    const old = page.run('weekResults.load(null, null, null)');
    page.run('weekResults.clear()');
    await old.catch(error => assert.match(error.message, /Request superseded/));
    assert.equal(page.storage.size, 0);
    assert.equal(page.calls.length, before);
});

