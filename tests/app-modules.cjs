const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const modules = new Map();

// Load the canonical inline module in the same realm as the tests. Its existing
// CommonJS boundary keeps browser globals out of unit tests and vice versa.
function loadModule(id) {
    if (!modules.has(id)) {
        const source = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];
        if (!source) throw new Error(`Missing embedded module: ${id}`);
        const module = { exports: {} };
        new Function('module', source)(module);
        modules.set(id, module.exports);
    }
    return modules.get(id);
}
module.exports = { loadModule };
