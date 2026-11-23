const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');

test('the published app is one HTML file without adjacent application assets or a build step', () => {
    const sources = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
    assert.ok(sources.every(source => /^https:\/\//.test(source)), `Local asset dependencies: ${sources.join(', ')}`);
    for (const id of ['watchability-module', 'compact-cache-module']) {
        assert.match(html, new RegExp(`<script id="${id}">[\\s\\S]+?</script>`));
    }
});

test('spoiler visibility does not depend on the external styling CDN', () => {
    const inlineStyles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
    assert.match(inlineStyles, /\.hidden\s*\{[^}]*display:\s*none\s*;/);
});
