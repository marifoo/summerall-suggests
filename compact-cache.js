/* Bounded, best-effort persistent storage. Owns format/version/expiry/quota policy. */
(function (root) {
    'use strict';
    const PREFIX = 'summerall:';
    const legacy = key => /^nfl_(scoreboard(?:_|$)|summary_)/.test(key);
    function createCache({ storage, schemaVersion = 1, extractionVersion, rulesVersion, evaluate,
        now = Date.now, maxEntries = 128, maxBytes = 1536 * 1024 }) {
        let access = 0;
        const tick = () => (access = Math.max(now(), access + 1));
        const owned = key => key.startsWith(PREFIX) || legacy(key);
        const bytes = (key, value) => 2 * (key.length + value.length);
        function scan() {
            const store = storage();
            const entries = [];
            const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter(Boolean);
            for (const key of keys) {
                if (!owned(key)) continue;
                let entry;
                const value = store.getItem(key);
                try { entry = JSON.parse(value); } catch { /* corrupt/legacy */ }
                if (legacy(key) || !entry || entry.schemaVersion !== schemaVersion || entry.extractionVersion !== extractionVersion ||
                    !Number.isFinite(entry.timestamp) || !Number.isFinite(entry.duration) || entry.duration <= 0 ||
                    !Number.isFinite(entry.accessedAt) || entry.timestamp + entry.duration <= now() || !Object.hasOwn(entry, 'data')) {
                    store.removeItem(key);
                    continue;
                }
                access = Math.max(access, entry.accessedAt);
                entries.push({ key, entry, size: bytes(key, value) });
            }
            return { store, entries: entries.sort((a, b) => a.entry.accessedAt - b.entry.accessedAt) };
        }
        function trim(store, entries, extraSize = 0, extraCount = 0) {
            let size = entries.reduce((sum, item) => sum + item.size, 0) + extraSize;
            while (entries.length && (size > maxBytes || entries.length + extraCount > maxEntries)) {
                const oldest = entries.shift();
                store.removeItem(oldest.key);
                size -= oldest.size;
            }
        }
        function write(key, entry) {
            try {
                const value = JSON.stringify(entry), fullKey = PREFIX + key;
                const size = bytes(fullKey, value);
                if (size > maxBytes || maxEntries < 1) return;
                const { store, entries } = scan();
                const others = entries.filter(item => item.key !== fullKey);
                trim(store, others, size, 1);
                while (true) {
                    try { store.setItem(fullKey, value); return; }
                    catch (error) {
                        if (!others.length) return;
                        store.removeItem(others.shift().key);
                    }
                }
            } catch { /* Storage can be unavailable, full, or disabled at any time. */ }
        }
        function getEntry(key) {
            try {
                const { store, entries } = scan();
                trim(store, entries);
                const entry = entries.find(item => item.key === PREFIX + key)?.entry;
                if (!entry) return null;
                if (entry.rulesVersion !== rulesVersion) {
                    if (entry.data?.metrics && entry.data?.evaluation) {
                        if (!evaluate) { store.removeItem(PREFIX + key); return null; }
                        entry.data.evaluation = evaluate(entry.data.metrics);
                    }
                    entry.rulesVersion = rulesVersion;
                }
                entry.accessedAt = tick();
                write(key, entry); // Does not extend original expiry.
                return { data: entry.data, expiresAt: entry.timestamp + entry.duration };
            } catch { return null; }
        }
        function set(key, data, duration) {
            if (!Number.isFinite(duration) || duration <= 0) return;
            write(key, { schemaVersion, extractionVersion, rulesVersion, data, timestamp: now(), duration, accessedAt: tick() });
        }
        function remove(key) { try { storage().removeItem(PREFIX + key); } catch { /* Best effort. */ } }
        function clear() {
            try {
                const store = storage();
                const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter(Boolean);
                keys.filter(owned).forEach(key => store.removeItem(key));
            } catch { /* Also safe when storage is denied. */ }
        }
        try { const { store, entries } = scan(); trim(store, entries); } catch { /* Best effort startup cleanup. */ }
        return { getEntry, get: key => getEntry(key)?.data ?? null, set, remove, clear };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { createCache };
    else root.CompactCache = { createCache };
})(globalThis);
