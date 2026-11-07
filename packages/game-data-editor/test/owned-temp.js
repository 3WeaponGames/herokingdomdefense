'use strict';
// Each test process removes only the exact temporary directories it created,
// including when a synchronous assertion fails before normal teardown.
const fs = require('fs'), os = require('os'), path = require('path');
const owned = new Map();
process.once('exit', () => {
    for (const [directory, owner] of owned) {
        try {
            const relative = path.relative(owner.base, directory);
            if (!relative || path.isAbsolute(relative) || relative.startsWith('..') ||
                relative.includes(path.sep) || !relative.startsWith(owner.prefix)) {
                throw Error('Temporary directory is outside its recorded owner: ' + directory);
            }
            fs.rmSync(directory, { recursive: true, force: true });
        } catch (error) { console.error(error); process.exitCode = 1; }
    }
});
module.exports = function temporary(prefix) {
    if (!/^hkd-[a-z-]+-$/.test(prefix)) throw Error('Expected a test-only temporary prefix.');
    const base = path.resolve(os.tmpdir()), directory = fs.mkdtempSync(path.join(base, prefix));
    owned.set(directory, { base, prefix });
    return directory;
};
