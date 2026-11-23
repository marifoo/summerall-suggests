const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

// Exercise the actual single-file app without adding a browser/build dependency.
const html = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
const jsonResponse = data => ({ ok: true, json: async () => structuredClone(data) });
const plain = value => JSON.parse(JSON.stringify(value));

function game(id = '123', state = 'post', homeScore = '37', awayScore = '36') {
    const status = { type: { state, completed: state === 'post', shortDetail: 'Final' }, period: 4 };
    return {
        id, date: '2026-11-22T18:00Z', status,
        competitions: [{ status, competitors: [
            { homeAway: 'home', score: homeScore, team: { abbreviation: 'HOME', displayName: 'Home Team' }, records: [{ type: 'total', summary: '7-3' }] },
            { homeAway: 'away', score: awayScore, team: { abbreviation: 'AWAY', displayName: 'Away Team' }, records: [{ type: 'total', summary: '6-4' }] }
        ] }]
    };
}

function scoreboard({ week = 11, type = 2, year = 2026, events = [game()], playoffWeeks = 4 } = {}) {
    return {
        week: { number: week }, season: { type, year }, events,
        leagues: [{ season: { year }, calendar: [
            { value: '2', entries: [{ value: year >= 2021 ? '18' : '17' }] },
            { value: '3', entries: [{ value: String(playoffWeeks) }] }
        ] }]
    };
}

function summary(state = 'post') {
    return { header: { competitions: [{ status: { type: { state } } }] }, drives: { previous: [] } };
}

function app(fetchImpl, { storage = new Map(), storageBlocked = false, timers = {}, now = Date.now } = {}) {
    // Run background work explicitly so foreground assertions never depend on timing.
    const backgroundTimers = new Map();
    const requestTimers = { setTimeout, clearTimeout, ...timers };
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set(['hidden']);
            const label = { textContent: '' };
            elements.set(id, {
                innerHTML: '', textContent: '', disabled: false, handlers: {},
                classList: {
                    add: name => classes.add(name), remove: name => classes.delete(name),
                    contains: name => classes.has(name),
                    toggle: name => classes.has(name) ? classes.delete(name) : classes.add(name)
                },
                querySelector: () => label,
                addEventListener(name, callback) { this.handlers[name] = callback; }
            });
        }
        return elements.get(id);
    }
    const calls = [];
    const context = vm.createContext({
        Watchability: require('./app-modules.cjs').loadModule('watchability-module'), CompactCache: require('./app-modules.cjs').loadModule('compact-cache-module'), AbortController, TypeError,
        Date: class extends Date { static now() { return now(); } },
        setTimeout(callback, delay) {
            if (delay !== 0) return requestTimers.setTimeout(callback, delay);
            const token = {};
            backgroundTimers.set(token, callback);
            return token;
        },
        clearTimeout(token) {
            if (!backgroundTimers.delete(token)) requestTimers.clearTimeout(token);
        },
        console: { log() {}, warn() {}, error() {} },
        fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); },
        localStorage: {
            get length() { if (storageBlocked) throw new Error('Storage blocked'); return storage.size; },
            key(i) { return [...storage.keys()][i] ?? null; },
            getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
            setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value); },
            removeItem(key) { if (storageBlocked) throw new Error('Storage blocked'); storage.delete(key); }
        },
        document: { getElementById: element, addEventListener() {} }
    });
    vm.runInContext(script, context, { filename: 'index.html' });
    return {
        run: code => vm.runInContext(code, context), calls, storage, element,
        async runBackground() {
            for (const [token, callback] of [...backgroundTimers]) {
                backgroundTimers.delete(token);
                await callback();
            }
        }
    };
}

test('requests the full ESPN week directly, caches it, and bypasses it on refresh', async () => {
    const page = app(() => jsonResponse(scoreboard()));
    await page.run('fetchScoreboardForWeek(11, 2, 2026)');
    await page.run('fetchScoreboardForWeek(11, 2, 2026)');
    assert.equal(page.calls.length, 1);
    const url = new URL(page.calls[0].url);
    assert.equal(url.origin, 'https://site.api.espn.com');
    assert.equal(url.searchParams.get('week'), '11');
    assert.equal(url.searchParams.get('seasontype'), '2');
    assert.equal(url.searchParams.get('dates'), '2026');
    assert.equal(url.searchParams.get('limit'), '1000');
    assert.ok(page.calls[0].options.signal instanceof AbortSignal);
    await page.run('fetchScoreboardForWeek(11, 2, 2026, true)');
    assert.equal(page.calls.length, 2);
});

test('Monday discovery loads completed Sunday games from the same week', async () => {
    const page = app(url => jsonResponse(scoreboard({ events: url === ESPN + 'scoreboard' ? [game('monday', 'pre')] : [game('sunday')] })));
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.week.number, 11);
    assert.equal(data.events[0].id, 'sunday');
    assert.equal(page.calls.length, 2);
    assert.equal(new URL(page.calls[1].url).searchParams.get('week'), '11');
});

test('latest-week cache preserves the navigation boundary when showing the previous week', async () => {
    const page = app(url => {
        const week = Number(new URL(url).searchParams.get('week') || 11);
        return jsonResponse(scoreboard({ week, events: week === 11 ? [game('scheduled', 'pre')] : [game()] }));
    });
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.week.number, 10);
    const reload = app(() => { throw new Error('Should use cache'); }, { storage: page.storage });
    await reload.run('fetchScoreboard()');
    assert.equal(reload.run('latestWeek'), 11);
    assert.equal(reload.run('latestSeasonType'), 2);
    assert.equal(reload.run('latestSeasonYear'), 2026);
    assert.equal(reload.calls.length, 0);
});

test('first regular-season week falls back to the previous season postseason', async () => {
    const page = app(url => {
        const params = new URL(url).searchParams;
        const previous = params.get('dates') === '2025';
        return jsonResponse(scoreboard({ week: previous ? 5 : 1, year: previous ? 2025 : 2026, type: previous ? 3 : 2, events: previous ? [game()] : [], playoffWeeks: 5 }));
    });
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.season.year, 2025);
    assert.equal(data.season.type, 3);
    assert.equal(new URL(page.calls[2].url).searchParams.get('week'), '5');
});

test('first playoff week falls back to regular season without changing the season year', async () => {
    const page = app(url => {
        const regular = new URL(url).searchParams.get('seasontype') === '2';
        return jsonResponse(scoreboard({ week: regular ? 18 : 1, type: regular ? 2 : 3, events: regular ? [game()] : [] }));
    });
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.season.year, 2026);
    assert.equal(data.season.type, 2);
    assert.equal(data.week.number, 18);
});

test('offseason uses ESPN calendar for the Super Bowl week', async () => {
    const page = app(url => jsonResponse(scoreboard(url === ESPN + 'scoreboard'
        ? { week: undefined, type: 4, events: [] }
        : { week: 4, type: 3 })));
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.week.number, 4);
    assert.equal(data.season.type, 3);
    assert.equal(new URL(page.calls[1].url).searchParams.get('week'), '4');
    assert.deepEqual(plain(page.run('getNextWeek(4, 3, 2026)')), { week: 1, seasonType: 2, year: 2027 });
});

test('preseason discovery loads the previous season postseason', async () => {
    const page = app(url => jsonResponse(scoreboard(url === ESPN + 'scoreboard'
        ? { week: 1, type: 1, events: [] }
        : { week: 5, type: 3, year: 2025 })));
    const data = await page.run('fetchScoreboard()');
    assert.equal(data.season.year, 2025);
    assert.equal(data.season.type, 3);
});

test('older seasons use their shorter regular-season schedule', () => {
    const page = app(() => {});
    assert.deepEqual(plain(page.run('getPreviousWeek(1, 3, 2020)')), { week: 17, seasonType: 2, year: 2020 });
    assert.deepEqual(plain(page.run('getNextWeek(17, 2, 2020)')), { week: 1, seasonType: 3, year: 2020 });
});

test('invalid week metadata does not issue a malformed request', async () => {
    const page = app(() => {});
    await assert.rejects(page.run('fetchScoreboardForWeek(undefined, 2, 2026)'), /determine the NFL week/);
    assert.equal(page.calls.length, 0);
});

test('a response for a different week is rejected instead of mislabeled and cached', async () => {
    const page = app(() => jsonResponse(scoreboard({ week: 10 })));
    await assert.rejects(page.run('fetchScoreboardForWeek(11, 2, 2026)'), /different NFL week/);
    assert.equal(page.storage.size, 0);
});

for (const status of [403, 429, 500]) {
    test(`HTTP ${status} is reported and not cached`, async () => {
        const page = app(() => ({ ok: false, status }));
        await assert.rejects(page.run('fetchScoreboardForWeek(11, 2, 2026)'), new RegExp(`HTTP ${status}`));
        assert.equal(page.storage.size, 0);
    });
}

test('network failures and invalid JSON have actionable errors', async () => {
    const network = app(() => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(network.run('fetchScoreboard()'), /Unable to reach ESPN/);
    const malformed = app(() => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }));
    await assert.rejects(malformed.run('fetchScoreboard()'), /invalid JSON response/);
    assert.equal(malformed.storage.size, 0);
});

test('request timeout aborts fetch and clears its timer', async () => {
    let cleared = false;
    const page = app((url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), { timers: {
        setTimeout(callback, delay) { assert.equal(delay, 15000); queueMicrotask(callback); return 1; },
        clearTimeout(id) { assert.equal(id, 1); cleared = true; }
    } });
    await assert.rejects(page.run('fetchScoreboard()'), /timed out/);
    assert.equal(page.calls[0].options.signal.aborted, true);
    assert.equal(cleared, true);
});

test('unexpected payloads are rejected without poisoning the caches', async () => {
    for (const data of [{ error: 'Unavailable' }, null, { events: [] }]) {
        const page = app(() => jsonResponse(data));
        await assert.rejects(page.run('fetchScoreboard()'), /unexpected scoreboard/);
        await assert.rejects(page.run('fetchGameFacts("123")'), /unexpected game summary/);
        assert.equal(page.storage.size, 0);
    }
});

test('weekly cache lifetimes reflect final, live, scheduled, and empty scoreboards', async () => {
    for (const [events, duration] of [
        [[game()], 2 * 60 * 60 * 1000], [[game('live', 'in')], 5 * 60 * 1000],
        [[game('scheduled', 'pre')], 60 * 60 * 1000], [[], 60 * 60 * 1000]
    ]) {
        const page = app(() => jsonResponse(scoreboard({ events })));
        await page.run('fetchScoreboardForWeek(11, 2, 2026)');
        assert.equal(JSON.parse([...page.storage.values()][0]).duration, duration);
    }
});

test('summary requests go directly to ESPN and refresh bypasses permanent final caches', async () => {
    const page = app(() => jsonResponse(summary()));
    await page.run('fetchGameFacts("123")');
    await page.run('fetchGameFacts("123")');
    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, ESPN + 'summary?event=123');
    assert.equal(JSON.parse(page.storage.get('summerall:facts_123')).duration, 30 * 24 * 60 * 60 * 1000);
    await page.run('fetchGameFacts("123", true)');
    assert.equal(page.calls.length, 2);
});

test('score fetching and refresh work when localStorage is blocked', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storageBlocked: true });
    await page.run('loadGames(11, 2, 2026)');
    assert.equal(page.element('week-display').textContent, '2026 Week 11');
    page.run('setupRefreshButton()');
    await page.element('refresh-btn').handlers.click();
    assert.equal(page.calls.length, 5);
    assert.equal(page.element('refresh-btn').disabled, false);
});

test('loads recommendations without revealing results and keeps spoiler games hidden', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({
        events: [game(), game('blowout', 'post', '40', '3'), game('scheduled', 'pre')]
    })));
    await page.run('loadGames()');
    assert.equal(page.element('week-display').textContent, '2026 Week 11');
    assert.match(page.element('watchable-games').innerHTML, /Home Team/);
    assert.doesNotMatch(page.element('watchable-games').innerHTML, /37|36|Final|shootout/);
    assert.match(page.element('spoiler-games').innerHTML, /3 - 40/);
    assert.equal(page.element('spoiler-count').textContent, 1);
    assert.equal(page.element('spoiler-content').classList.contains('hidden'), true);
    assert.equal(page.element('loading').classList.contains('hidden'), true);
    assert.equal(page.element('refresh-btn').disabled, false);
});

test('cancelled games are not treated as completed recommendations', async () => {
    const cancelled = game('cancelled');
    cancelled.status.type.completed = false;
    const page = app(() => jsonResponse(scoreboard({ events: [cancelled] })));
    await page.run('loadGames(11, 2, 2026)');
    assert.match(page.element('week-display').textContent, /No completed games/);
    assert.equal(page.element('watchable-games').innerHTML, '');
});

test('refresh preserves the selected historical week and refetches its summary', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({ week: 8 })));
    await page.run('loadGames(8, 2, 2026)');
    page.run('latestWeek = 11');
    page.run('setupRefreshButton()');
    await page.element('refresh-btn').handlers.click();
    assert.equal(page.calls.length, 4);
    assert.equal(new URL(page.calls[2].url).searchParams.get('week'), '8');
    assert.equal(page.calls[3].url, ESPN + 'summary?event=123');
    assert.equal(page.element('week-display').textContent, '2026 Week 8');
});

test('refresh at the latest week discovers a newly started week', async () => {
    let latestWeek = 11;
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({ week: latestWeek })));
    await page.run('loadGames()');
    latestWeek = 12;
    page.run('setupRefreshButton()');
    await page.element('refresh-btn').handlers.click();
    assert.equal(page.element('week-display').textContent, '2026 Week 12');
    assert.equal(page.run('latestWeek'), 12);
    assert.equal(page.element('next-week-btn').disabled, true);
});

test('failed loading exposes retry and restores navigation after a previous successful load', async () => {
    let fail = false;
    const page = app(url => {
        if (fail) return { ok: false, status: 500 };
        return jsonResponse(url.includes('/summary?') ? summary() : scoreboard());
    });
    await page.run('loadGames(11, 2, 2026)');
    fail = true;
    await page.run('loadGames(10, 2, 2026, true)');
    assert.equal(page.element('week-display').textContent, 'Error loading data');
    assert.match(page.element('watchable-games').innerHTML, /HTTP 500/);
    assert.equal(page.element('refresh-btn').disabled, false);
    assert.equal(page.element('prev-week-btn').disabled, false);
});

function weeklyResponse(url) {
    if (url.includes('/summary?')) return jsonResponse(summary());
    const week = Number(new URL(url).searchParams.get('week')) || 11;
    return jsonResponse(scoreboard({ week, events: [game(`week-${week}`)] }));
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('background loads the previous two weeks in order after rendering, including summaries', async () => {
    const firstWeek = deferred();
    const firstSummary = deferred();
    const page = app(url => {
        if (new URL(url).searchParams.get('week') === '10') return firstWeek.promise;
        if (url.endsWith('summary?event=week-10')) return firstSummary.promise;
        return weeklyResponse(url);
    });
    await page.run('loadGames()');
    const foreground = page.calls.length;
    const visible = page.element('watchable-games').innerHTML;
    assert.equal(page.element('week-display').textContent, '2026 Week 11');
    assert.equal(page.element('refresh-btn').disabled, false);

    const background = page.runBackground();
    assert.equal(page.calls.length, foreground + 1);
    assert.equal(new URL(page.calls[foreground]?.url).searchParams.get('week'), '10');
    firstWeek.resolve(weeklyResponse(page.calls[foreground].url));
    // Wait until the first week's summary starts; week 9 must still be untouched.
    await new Promise(setImmediate);
    assert.equal(page.calls.at(-1).url, ESPN + 'summary?event=week-10');
    assert.equal(page.calls.some(c => new URL(c.url).searchParams.get('week') === '9'), false);
    firstSummary.resolve(jsonResponse(summary()));
    await background;
    assert.deepEqual(page.calls.slice(foreground).map(c => c.url), [
        ESPN + 'scoreboard?week=10&seasontype=2&dates=2026&limit=1000',
        ESPN + 'summary?event=week-10',
        ESPN + 'scoreboard?week=9&seasontype=2&dates=2026&limit=1000',
        ESPN + 'summary?event=week-9'
    ]);
    assert.equal(page.element('watchable-games').innerHTML, visible);
    assert.equal(page.element('week-display').textContent, '2026 Week 11');
    assert.equal(page.run('currentWeek'), 11);
    assert.equal(page.run('latestWeek'), 11);
    assert.equal(page.element('next-week-btn').disabled, true);
    assert.equal(page.element('spoiler-content').classList.contains('hidden'), true);
});

test('prefetched recommendations need no new requests even when browser storage is unavailable', async () => {
    const page = app(weeklyResponse, { storageBlocked: true });
    await page.run('loadGames()');
    await page.runBackground();
    const before = page.calls.length;
    await page.run('loadGames(10, 2, 2026)');
    assert.equal(page.calls.length, before);
    assert.equal(page.element('week-display').textContent, '2026 Week 10');
    assert.match(page.element('watchable-games').innerHTML, /Home Team/);
    await page.run('loadGames(9, 2, 2026)');
    assert.equal(page.calls.length, before);
    assert.equal(page.element('week-display').textContent, '2026 Week 9');
});

test('foreground navigation shares a pending background week and stops the old chain', async () => {
    const pending = deferred();
    const page = app(url => new URL(url).searchParams.get('week') === '10' ? pending.promise : weeklyResponse(url));
    await page.run('loadGames()');
    const background = page.runBackground();
    assert.equal(new URL(page.calls.at(-1).url).searchParams.get('week'), '10');
    const foreground = page.run('loadGames(10, 2, 2026)');
    pending.resolve(weeklyResponse(ESPN + 'scoreboard?week=10'));
    await Promise.all([background, foreground]);
    assert.equal(page.calls.filter(c => new URL(c.url).searchParams.get('week') === '10').length, 1);
    assert.equal(page.calls.filter(c => c.url.endsWith('summary?event=week-10')).length, 1);
    assert.equal(page.calls.some(c => new URL(c.url).searchParams.get('week') === '9'), false);
    assert.equal(page.element('week-display').textContent, '2026 Week 10');
});

test('a background error stays invisible and the next preceding week is still loaded', async () => {
    const page = app(url => new URL(url).searchParams.get('week') === '10'
        ? { ok: false, status: 500 } : weeklyResponse(url));
    await page.run('loadGames()');
    await page.runBackground();
    assert.equal(page.element('week-display').textContent, '2026 Week 11');
    assert.doesNotMatch(page.element('watchable-games').innerHTML, /HTTP 500|Failed to load/);
    assert.equal(page.calls.some(c => c.url.endsWith('summary?event=week-9')), true);
});

test('background loading follows postseason and year boundaries', async () => {
    const page = app(url => {
        if (url.includes('/summary?')) return jsonResponse(summary());
        const params = new URL(url).searchParams;
        const week = Number(params.get('week'));
        return jsonResponse(scoreboard({ week, type: Number(params.get('seasontype')),
            year: Number(params.get('dates')), playoffWeeks: 5, events: [game(`week-${week}`)] }));
    });
    await page.run('loadGames(1, 2, 2026)');
    await page.runBackground();
    const weeks = page.calls.filter(c => c.url.includes('/scoreboard?')).map(c => {
        const params = new URL(c.url).searchParams;
        return [params.get('week'), params.get('seasontype'), params.get('dates')];
    });
    assert.deepEqual(weeks, [['1', '2', '2026'], ['5', '3', '2025'], ['4', '3', '2025']]);
    assert.equal(page.element('week-display').textContent, '2026 Week 1');
});

test('refresh bypasses prefetched results and subsequent navigation uses the refreshed data', async () => {
    const page = app(weeklyResponse, { storageBlocked: true });
    await page.run('loadGames()');
    await page.runBackground();
    await page.run('loadGames(10, 2, 2026)');
    const before = page.calls.length;
    await page.run('loadGames(10, 2, 2026, true)');
    assert.equal(page.calls.length - before, 2);
    await page.run('loadGames(10, 2, 2026)');
    assert.equal(page.calls.length - before, 2);
});

for (const [state, lifetime] of [['pre', 60 * 60 * 1000], ['in', 5 * 60 * 1000]]) {
    test(`warming a ${state} scoreboard in memory preserves its original expiration`, async () => {
        let now = 0;
        const page = app(() => jsonResponse(scoreboard({ events: [
            game('finished', 'post', '40', '3'),
            now < lifetime ? game('pending', state, '0', '0') : game('pending', 'post', '30', '3')
        ] })), { now: () => now });
        await page.run('fetchScoreboardForWeek(11, 2, 2026)');
        now = lifetime - 60 * 1000;
        await page.run('loadGames(11, 2, 2026)');
        assert.equal(page.calls.length, 1);
        assert.equal(page.element('spoiler-count').textContent, 1);
        now = lifetime + 60 * 1000;
        await page.run('loadGames(11, 2, 2026)');
        assert.equal(page.calls.length, 2);
        assert.equal(page.element('spoiler-count').textContent, 2);
    });
}

test('an older background scoreboard cannot overwrite refreshed scores after memory eviction', async () => {
    const oldResponse = deferred();
    let requestsForWeek10 = 0;
    const page = app(url => {
        const week = Number(new URL(url).searchParams.get('week'));
        if (week === 10 && ++requestsForWeek10 === 1) return oldResponse.promise;
        return jsonResponse(scoreboard({ week, events: [game(`week-${week}`, 'post', '50', '3')] }));
    });
    const oldLoad = page.run('weekResults.load(10, 2, 2026)');
    await page.run('weekResults.load(10, 2, 2026, true)');
    oldResponse.resolve(jsonResponse(scoreboard({ week: 10, events: [game('week-10', 'post', '40', '3')] })));
    await oldLoad;
    for (const week of [9, 8, 7]) await page.run(`weekResults.load(${week}, 2, 2026)`);
    const revisited = await page.run('weekResults.load(10, 2, 2026)');
    assert.equal(revisited.scoreboard.events[0].competitions[0].competitors[0].score, 50);
    assert.equal(requestsForWeek10, 2);
});

test('an older summary response cannot replace a refreshed final summary in persistent storage', async () => {
    const oldResponse = deferred();
    let requests = 0;
    const page = app(() => ++requests === 1 ? oldResponse.promise
        : jsonResponse({ ...summary(), drives: { previous: [{ plays: [play(7, 0, 4), play(7, 10, 4)] }] } }));
    const oldLoad = page.run('fetchGameFacts("123")');
    await page.run('fetchGameFacts("123", true)');
    oldResponse.resolve(jsonResponse({ ...summary(), marker: 'old' }));
    await oldLoad;
    const cached = await page.run('fetchGameFacts("123")');
    assert.equal(cached.playMetrics.leadChanges, 1);
    assert.equal(requests, 2);
});

test('latest-week detection cannot extend stale in-memory results beyond its own expiration', async () => {
    let now = 0;
    const hour = 60 * 60 * 1000;
    const page = app(() => jsonResponse(scoreboard({ events: [
        game('finished', 'post', '40', '3'),
        now < hour ? game('pending', 'pre', '0', '0') : game('pending', 'post', '30', '3')
    ] })), { now: () => now });
    await page.run('fetchScoreboardForWeek(11, 2, 2026)');
    now = 59 * 60 * 1000;
    await page.run('fetchScoreboard()');
    now = 61 * 60 * 1000;
    await page.run('loadGames()');
    assert.equal(page.element('spoiler-count').textContent, 1);
    now = 65 * 60 * 1000;
    await page.run('loadGames()');
    assert.equal(page.element('spoiler-count').textContent, 2);
});

// Characterize the shipped policy before separating extraction, rules, and ranking.
function evaluateFixture({ home = '24', away = '21', plays = [], records = ['1-0', '0-1'], overtime = false, withSummary = true } = {}) {
    const fixture = game('policy', 'post', home, away);
    fixture.competitions[0].competitors.forEach((team, i) => {
        team.records[0].summary = records[i];
        team.linescores = Array.from({ length: overtime ? 5 : 4 }, () => ({ value: 0 }));
    });
    const page = app(() => {});
    const { watchable, points, reasons } = plain(page.run(`evaluateGame(${JSON.stringify(fixture)}, ${withSummary ? JSON.stringify({ drives: { previous: [{ plays }] } }) : 'null'})`));
    return { watchable, points, reasons };
}
const play = (homeScore, awayScore, period = 4) => ({ homeScore, awayScore, period: { number: period } });

test('implemented margin, shootout, and recommendation boundaries are cumulative', () => {
    for (const [home, away, points, reasons] of [
        ['24', '15', 0, []], ['24', '16', 1, ['close']],
        ['24', '21', 1, ['close']], ['24', '22', 2, ['close', 'very-close']],
        ['33', '22', 0, []], ['33', '23', 1, ['shootout']],
        ['32', '31', 3, ['close', 'very-close', 'shootout']],
        ['33', '31', 4, ['close', 'very-close', 'shootout', 'super-shootout']]
    ]) {
        const result = evaluateFixture({ home, away });
        assert.deepEqual(result, { watchable: points >= 3, points, reasons });
    }
});

test('overtime bonus requires a non-tie and is inferred from home linescores', () => {
    assert.equal(evaluateFixture({ home: '24', away: '24', overtime: true }).points, 2);
    assert.equal(evaluateFixture({ home: '24', away: '23', overtime: true }).points, 3);
    assert.equal(evaluateFixture({ home: '24', away: '23' }).points, 2);
});

test('comebacks require erasing a deficit, may lose later, and include overtime', () => {
    assert.deepEqual(evaluateFixture({ plays: [play(0, 15, 3), play(15, 15, 3), play(15, 23), play(23, 23, 5)] }).reasons,
        ['close', 'comeback', 'strong-comeback']);
    assert.deepEqual(evaluateFixture({ plays: [play(0, 15, 2), play(15, 15, 3)] }).reasons, ['close']);
    assert.deepEqual(evaluateFixture({ plays: [play(0, 14, 3), play(14, 14, 3), play(14, 21), play(21, 21)] }).reasons, ['close']);
    assert.deepEqual(evaluateFixture({ plays: [play(0, 15, 3), play(14, 15)] }).reasons, ['close']);
});

test('lead changes ignore ties; bonuses accumulate at five, seven, and ten', () => {
    for (const changes of [4, 5, 6, 7, 9, 10]) {
        const plays = [play(3, 0, 3)];
        let home = 3, away = 0;
        for (let i = 0; i < changes; i++) {
            if (i % 2 === 0) away = home + 3;
            else home = away + 3;
            plays.push(play(home, away, 3), play(Math.max(home, away), Math.max(home, away), 3));
        }
        const result = evaluateFixture({ plays });
        assert.equal(result.points, 1 + Number(changes >= 5) + Number(changes >= 7) + Number(changes >= 10));
    }
});

test('late bonus requires the final Q4 score to switch directly between leaders', () => {
    assert.ok(evaluateFixture({ plays: [play(7, 10, 3), play(14, 10)] }).reasons.includes('late-lead-change'));
    for (const plays of [
        [play(7, 10, 3), play(10, 10), play(13, 10)],
        [play(7, 10, 3), play(14, 10), play(17, 10)],
        [play(7, 10, 3), play(14, 10, 5)]
    ]) assert.ok(!evaluateFixture({ plays }).reasons.includes('late-lead-change'));
});

test('record rules use pre-game wins minus losses and include a negative point', () => {
    assert.equal(evaluateFixture({ records: ['5-2', '4-3'] }).points, 2);
    assert.equal(evaluateFixture({ records: ['4-2', '3-3'] }).points, 1);
    assert.deepEqual(evaluateFixture({ records: ['1-5', '0-6'] }), { watchable: false, points: 0, reasons: ['close', 'losing-teams'] });
    assert.equal(evaluateFixture({ home: '24', away: '24', records: ['4-2-1', '4-2-1'] }).points, 3);
});

test('summary-dependent bonuses are omitted when summary is unavailable', () => {
    assert.deepEqual(evaluateFixture({ withSummary: false }), { watchable: false, points: 1, reasons: ['close'] });
    const page = app(() => {});
    assert.equal(page.run(`shouldFetchSummary(${JSON.stringify(game('blowout', 'post', '40', '3'))})`), false);
});

test('rendered stars favor all five-point games, then tied weekly leaders below five', async () => {
    const fixtures = [game('a', 'post', '33', '31'), game('b', 'post', '32', '31'), game('c', 'post', '32', '31')];
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({ events: fixtures })));
    await page.run('loadGames(11, 2, 2026)');
    assert.equal((page.element('watchable-games').innerHTML.match(/⭐/g) || []).length, 3);
    fixtures[0] = game('a', 'post', '32', '31');
    await page.run('loadGames(11, 2, 2026, true)');
    assert.equal((page.element('watchable-games').innerHTML.match(/⭐/g) || []).length, 3);
    fixtures[0] = game('a', 'post', '40', '3');
    fixtures[1] = game('b', 'post', '24', '23');
    fixtures[1].competitions[0].competitors.forEach(team => { team.records[0].summary = '0-0'; });
    fixtures.splice(2);
    await page.run('loadGames(11, 2, 2026, true)');
    assert.equal(page.element('watchable-games').innerHTML, '');
});

test('an older foreground load cannot replace a newer refresh on screen', async () => {
    const pending = deferred(); let requests = 0;
    const page = app(() => ++requests === 1 ? pending.promise : jsonResponse(scoreboard({ events: [game('g', 'post', '50', '3')] })));
    const old = page.run('loadGames(11, 2, 2026)');
    await page.run('loadGames(11, 2, 2026, true)');
    assert.match(page.element('spoiler-games').innerHTML, /3 - 50/);
    pending.resolve(jsonResponse(scoreboard({ events: [game('g', 'post', '40', '3')] })));
    await old;
    assert.match(page.element('spoiler-games').innerHTML, /3 - 50/);
});

test('clearing while a week is loading prevents late responses from repopulating storage', async () => {
    const pending = deferred();
    const page = app(url => url.includes('/summary?') ? jsonResponse(summary()) : pending.promise);
    const old = page.run('weekResults.load(11, 2, 2026)');
    page.run('weekResults.clear()');
    pending.resolve(jsonResponse(scoreboard()));
    await old;
    assert.equal(page.storage.size, 0);
});

test('persistent entries contain compact facts, traces, actual scores and rendering metadata only', async () => {
    const huge = 'UNUSED_ESPN_PAYLOAD'.repeat(20000);
    const rawSummary = { ...summary(), boxscore: { huge }, drives: { previous: [{ plays: [play(7, 0, 3), play(7, 10, 4)] }] } };
    const page = app(url => jsonResponse(url.includes('/summary?') ? rawSummary : { ...scoreboard(), news: huge }));
    await page.run('loadGames(11, 2, 2026)');
    const encoded = [...page.storage.values()].join('');
    assert.doesNotMatch(encoded, /UNUSED_ESPN_PAYLOAD|boxscore|"drives"|"plays"/);
    assert.ok(encoded.length < 20000);
    const saved = JSON.parse(page.storage.get('summerall:decision_123'));
    assert.equal(saved.data.metrics.homeScore, 37);
    assert.equal(saved.data.metrics.awayScore, 36);
    assert.equal(saved.data.evaluation.rules.length, 13);
    const reload = app(() => { throw new Error('Must reuse compact cache'); }, { storage: page.storage });
    await reload.run('loadGames(11, 2, 2026)');
    assert.equal(reload.calls.length, 0);
    assert.equal(reload.element('watchable-games').innerHTML, page.element('watchable-games').innerHTML);
});

test('scoring-version updates use cached metrics without ESPN requests, while extraction updates refetch', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    await page.run('loadGames(11, 2, 2026)');
    for (const [key, value] of page.storage) {
        const saved = JSON.parse(value); saved.rulesVersion = 0;
        if (saved.data.evaluation) { saved.data.evaluation.points = 999; saved.data.evaluation.watchable = false; }
        page.storage.set(key, JSON.stringify(saved));
    }
    const scored = app(() => { throw new Error('Scoring update must not refetch'); }, { storage: page.storage });
    await scored.run('loadGames(11, 2, 2026)');
    assert.equal(scored.calls.length, 0);
    assert.match(scored.element('watchable-games').innerHTML, /Home Team/);
    assert.equal(JSON.parse(scored.storage.get('summerall:decision_123')).data.evaluation.points, 5);
    for (const [key, value] of scored.storage) {
        const saved = JSON.parse(value); saved.extractionVersion = 0;
        scored.storage.set(key, JSON.stringify(saved));
    }
    const extracted = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()), { storage: scored.storage });
    await extracted.run('loadGames(11, 2, 2026)');
    assert.equal(extracted.calls.length, 2);
});

test('clear-cache action clears memory, persistent entries and queued prefetch without deleting other apps', async () => {
    const storage = new Map([['other-app', 'keep'], ['nfl_summary_old', 'large legacy value']]);
    const page = app(weeklyResponse, { storage });
    await page.run('loadGames(11, 2, 2026)');
    page.run('setupClearCacheButton()');
    page.element('clear-cache-btn').handlers.click();
    assert.deepEqual([...storage], [['other-app', 'keep']]);
    const before = page.calls.length;
    await page.runBackground();
    assert.equal(page.calls.length, before);
    await page.run('loadGames(11, 2, 2026)');
    assert.equal(page.calls.length, before + 2);
    assert.match(page.element('cache-status').textContent, /Cache cleared/);
});

test('clearing during discovery or a summary request prevents late persistent writes', async () => {
    for (const stage of ['discovery', 'facts']) {
        const pending = deferred();
        const page = app(url => (stage === 'discovery' || url.includes('/summary?')) ? pending.promise : jsonResponse(scoreboard()));
        const old = page.run(stage === 'discovery' ? 'loadGames()' : 'loadGames(11, 2, 2026)');
        await new Promise(setImmediate);
        page.run('weekResults.clear()');
        pending.resolve(jsonResponse(stage === 'discovery' ? scoreboard() : summary()));
        await old;
        await page.runBackground();
        assert.equal(page.storage.size, 0, stage);
    }
});

test('developer mode is opt-in, warns about spoilers, inspects every game, and removes traces when disabled', async () => {
    const fixtures = [game(), game('blowout', 'post', '40', '3'), game('scheduled', 'pre')];
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard({ events: fixtures })));
    page.run('setupDeveloperMode()');
    await page.run('loadGames(11, 2, 2026)');
    assert.equal(page.element('developer-content').innerHTML, '');
    assert.equal(page.element('developer-section').classList.contains('hidden'), true);
    assert.match(html, /Developer mode[^<]*reveals spoilers/i);
    const before = page.calls.length;
    const toggle = page.element('developer-toggle');
    toggle.checked = true; toggle.handlers.change();
    const inspection = page.element('developer-content').innerHTML;
    assert.equal(page.element('developer-section').classList.contains('hidden'), false);
    assert.equal((inspection.match(/data-game-id=/g) || []).length, 3);
    assert.equal((inspection.match(/data-rule-id=/g) || []).length, 39);
    assert.match(inspection, /37/);
    assert.match(inspection, /40/);
    assert.match(inspection, /finalMargin/);
    assert.match(inspection, /Required data unavailable/);
    assert.match(inspection, /Game not completed/);
    assert.match(inspection, /Weekly maximum/);
    assert.match(inspection, /3 stars/);
    assert.match(inspection, /not-requested/);
    assert.equal(page.calls.length, before);
    toggle.checked = false; toggle.handlers.change();
    assert.equal(page.element('developer-content').innerHTML, '');
    assert.equal(page.element('developer-section').classList.contains('hidden'), true);
    assert.doesNotMatch(page.element('watchable-games').innerHTML, /37|36|finalMargin|close|points/);
});

test('developer decisions are the exact persisted evaluations used by normal recommendations', async () => {
    const page = app(url => jsonResponse(url.includes('/summary?') ? summary() : scoreboard()));
    page.run('setupDeveloperMode()');
    await page.run('loadGames(11, 2, 2026)');
    const saved = JSON.parse(page.storage.get('summerall:decision_123')).data;
    page.element('developer-toggle').checked = true;
    page.element('developer-toggle').handlers.change();
    assert.match(page.element('developer-content').innerHTML, new RegExp(`Total points: <strong>${saved.evaluation.points}</strong>`));
    assert.equal(saved.evaluation.watchable, true);
    for (const rule of saved.evaluation.rules) assert.ok(page.element('developer-content').innerHTML.includes(`data-rule-id="${rule.id}"`));
    assert.match(page.element('watchable-games').innerHTML, /Home Team/);
});

test('developer mode resets stale results during navigation and shows scheduled-only weeks', async () => {
    const page = app(() => jsonResponse(scoreboard({ events: [game('pending', 'pre')] })));
    page.run('setupDeveloperMode()');
    page.element('developer-toggle').checked = true;
    page.element('developer-toggle').handlers.change();
    await page.run('loadGames(11, 2, 2026)');
    assert.match(page.element('developer-content').innerHTML, /Game not completed/);
    assert.equal(page.element('developer-section').classList.contains('hidden'), false);
    const reload = app(() => { throw new Error('cached'); }, { storage: page.storage });
    reload.run('setupDeveloperMode()');
    await reload.run('loadGames(11, 2, 2026)');
    assert.equal(reload.element('developer-content').innerHTML, '');
});
