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

function app(fetchImpl, { storage = new Map(), storageBlocked = false, timers = {} } = {}) {
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
        AbortController, TypeError, setTimeout, clearTimeout, ...timers,
        console: { log() {}, warn() {}, error() {} },
        fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); },
        localStorage: {
            getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
            setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value); },
            removeItem(key) { if (storageBlocked) throw new Error('Storage blocked'); storage.delete(key); }
        },
        document: { getElementById: element, addEventListener() {} }
    });
    vm.runInContext(script, context, { filename: 'index.html' });
    return { run: code => vm.runInContext(code, context), calls, storage, element };
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
        await assert.rejects(page.run('fetchGameSummary("123")'), /unexpected game summary/);
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
    await page.run('fetchGameSummary("123")');
    await page.run('fetchGameSummary("123")');
    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, ESPN + 'summary?event=123');
    assert.equal(JSON.parse(page.storage.get('nfl_summary_123')).duration, 'Infinity');
    await page.run('fetchGameSummary("123", true)');
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
