const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCache } = require('./app-modules.cjs').loadModule('compact-cache-module');
function storage(map = new Map(), quota = Infinity) {
    return { map, get length() { return map.size; }, key(i) { return [...map.keys()][i] ?? null; },
        getItem: key => map.get(key) ?? null,
        setItem(key, value) { if (value.length + [...map].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0) > quota) throw new Error('Quota'); map.set(key, value); },
        removeItem: key => map.delete(key) };
}
const options = s => ({ storage: () => s, schemaVersion: 1, extractionVersion: 1, rulesVersion: 1 });

test('expiration, bounds, and LRU eviction preserve recently used compact entries', () => {
    const s = storage(); let now = 100;
    const cache = createCache({ ...options(s), now: () => now, maxEntries: 2, maxBytes: 10000 });
    cache.set('a', { score: 21 }, 1000); cache.set('b', { score: 24 }, 1000);
    cache.get('a'); cache.set('c', { score: 30 }, 1000);
    assert.equal(cache.get('b'), null);
    assert.equal(cache.get('a').score, 21);
    assert.equal(s.length, 2);
    now += 1000;
    assert.equal(cache.get('a'), null);
    assert.equal(cache.get('c'), null);
    assert.equal(s.length, 0);
});

test('schema and extraction changes remove owned incompatible data, preserving unrelated storage', () => {
    const s = storage(new Map([['nfl_summary_1', 'legacy'], ['nfl_scoreboard_v2_2026_2_1', 'legacy'], ['unrelated', 'keep']]));
    const cache = createCache(options(s)); cache.set('facts', { leadChanges: 5 }, 1000);
    assert.equal(s.map.has('nfl_summary_1'), false);
    assert.equal(s.map.get('unrelated'), 'keep');
    const next = createCache({ ...options(s), extractionVersion: 2 });
    assert.equal(next.get('facts'), null);
    next.set('facts', {}, 1000);
    assert.equal(createCache({ ...options(s), schemaVersion: 2 }).get('facts'), null);
});

test('rules-only changes recalculate and persist decisions from cached metrics', () => {
    const s = storage();
    createCache(options(s)).set('decision', { metrics: { finalMargin: 2 }, evaluation: { points: 1 } }, 1000);
    let calls = 0;
    const next = createCache({ ...options(s), rulesVersion: 2, evaluate: metrics => { calls++; return { points: metrics.finalMargin + 1 }; } });
    assert.equal(next.get('decision').evaluation.points, 3);
    assert.equal(calls, 1);
    assert.equal(next.get('decision').evaluation.points, 3);
    assert.equal(calls, 1);
    assert.equal(JSON.parse(s.map.get('summerall:decision')).rulesVersion, 2);
});

test('quota pressure evicts old entries and blocked storage is a cache miss', () => {
    const s = storage(new Map(), 500);
    const cache = createCache(options(s));
    cache.set('a', 'a'.repeat(200), 1000); cache.set('b', 'b'.repeat(200), 1000);
    assert.equal(cache.get('b'), 'b'.repeat(200));
    assert.equal(cache.get('a'), null);
    const blocked = createCache({ ...options(s), storage: () => { throw new Error('Denied'); } });
    assert.equal(blocked.get('b'), null);
    assert.doesNotThrow(() => { blocked.set('b', {}, 100); blocked.clear(); });
});

test('oversized and corrupt entries are discarded, and clear only removes app-owned entries', () => {
    const s = storage(new Map([['summerall:corrupt', '{'], ['other', 'keep']]));
    const cache = createCache({ ...options(s), maxBytes: 1000 });
    cache.set('huge', 'x'.repeat(1000), 1000);
    assert.equal(cache.get('huge'), null);
    cache.set('small', { metrics: {} }, 1000); cache.clear();
    assert.deepEqual([...s.map], [['other', 'keep']]);
});
