'use strict';

// Use the exact, standalone files shipped in Creator 2.4.13. CI does not need
// to install or launch the editor, and no downloaded code enters game assets.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const revision = 'caf35a70c814561e27ebb8f372c06f6b51ee420a';
const source = `https://raw.githubusercontent.com/cocos/cocos-engine/${revision}/`;
const files = Object.freeze({
  'extensions/spine/lib/spine.js': '26570ea86a49c6174b53ddceb38302c642b33e096e3d822c6739ccd01d030a2f',
  'extensions/spine/editor/spine-meta.js': '39f0da719947e4be69734d062b63f622f45b5655cefd20b0a837bf0648a0384f'
});

async function prepare(directory, download = fetch) {
  if (!directory) throw new Error('Provide an external directory for the Creator Spine test dependency.');
  const destination = path.resolve(directory);
  const project = path.resolve(__dirname, '../..');
  const relative = path.relative(project, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Creator test dependencies must be stored outside the project.');
  }

  // Validate every response before changing an existing dependency installation.
  const verified = [];
  for (const [file, expected] of Object.entries(files)) {
    const response = await download(source + file, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Downloading ${file} failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) throw new Error(`Creator dependency integrity check failed: ${file}`);
    verified.push([file, bytes]);
  }
  for (const [file, bytes] of verified) {
    const target = path.join(destination, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  return destination;
}

module.exports = { prepare, revision, files };
if (require.main === module) {
  prepare(process.argv[2]).then(directory => {
    console.log(`Verified Creator 2.4.13 Spine test dependencies: ${directory}`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
