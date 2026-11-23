const { readFileSync } = require('node:fs');
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

module.exports = { app, game, scoreboard, summary, jsonResponse, plain, html, ESPN };
