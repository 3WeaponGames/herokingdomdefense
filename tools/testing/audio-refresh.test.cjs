'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), audio = path.join(root, 'assets/KinghtFallAudio');
const firstTier = {
  'cavalry/cavalry-level-1-variant-1.mp3': 'e133c4a87fc341911002f2a96d937b43f5d6c32ad41fe01814f4b26b3f2fb925',
  'cavalry/cavalry-level-1-variant-2.mp3': '3ec776162c4942ae8e97b27ff96ce281b0349b8a528a48731b6a5842ad71eb8b',
  'crossbowman/crossbowman-level-1-variant-1.mp3': '652aebc96fd8da49f11b038814bcaa99205e37719970a68074aad8e10a7fa60d',
  'crossbowman/crossbowman-level-1-variant-2.mp3': '986214cdc70be228e9dd83be9223b271bd7633d045859ef5ec6e9dbc1ff7fb68',
  'heavy-infantry/heavy-infantry-level-1-variant-1.mp3': '271fa0d23a055a03900e6110439bec7f40ca34ab34198a1fdc0b95119da6a8ec',
  'heavy-infantry/heavy-infantry-level-1-variant-2.mp3': '99ab10b747a87fa8aeec592e19f50104267fea2f8ee7b0125195fb3bf2ed1642',
  'royal-knight/royal-knight-level-1-variant-1.mp3': 'e0d1bcd24c3ee0ad317288a8ba1a82f41866987b8c4540561ef2ce693e65883a',
  'royal-knight/royal-knight-level-1-variant-2.mp3': '4cbfe81e7c3df64f99b95b511a09133aca4f5e061f6c1bdbf9a27142d2441f24'
};

test('all eight Tier 1 announcements use their approved voice takes', () => {
  for (const [file, expected] of Object.entries(firstTier)) {
    const bytes = fs.readFileSync(path.join(audio, 'voices/units', file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
});

test('every tier still has two announcements and all unit-death files and configuration are removed', () => {
  const files = [];
  function scan(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) scan(file); else files.push(file); } }
  scan(audio);
  assert(!files.some(file => /(?:[\\/]death(?:-|\.)|[\\/][^\\/]+-death\.)/.test(file)));
  for (const unit of ['cavalry', 'crossbowman', 'heavy-infantry', 'royal-knight']) for (const tier of [1, 2, 3]) for (const variant of [1, 2]) {
    const file = path.join(audio, 'voices/units', unit, unit + '-level-' + tier + '-variant-' + variant + '.mp3'); assert(fs.statSync(file).size > 1000);
  }
  const config = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallConfig.js'), 'utf8');
  const hero = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallGamePlayCtrl.js'), 'utf8');
  assert(!config.includes('KinghtFalldeath')); assert(!hero.includes('KinghtFallAudioId.death'));
});

test('death presentation hooks make no asset, engine or game-state requests', () => {
  const catalog = require('../../assets/_script/BattleSoundCatalog');
  for (const name of ['BattleSounds', 'UnitVoices']) {
    const context = { exports: {}, require: id => { if (id === 'BattleSoundCatalog') return catalog; throw Error('Death audio requested ' + id); } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context);
    assert.equal(context.exports.death(), false); assert.equal(context.exports.death({ node: null, hp: 0 }), false);
  }
});

test('the remaining approved ambience and all eight horse surfaces have real asset files', () => {
  const effects = require('../../assets/_script/BattleSoundCatalog').effects;
  assert.deepEqual(Object.keys(effects).filter(id => id.startsWith('ambience-')), ['ambience-lava-loop']);
  const biomes = ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava'];
  for (const biome of biomes) {
    const item = effects['hooves-' + biome + '-loop']; assert(item && item.loop);
    const file = path.join(audio, item.path + '.wav'), bytes = fs.readFileSync(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE'); assert(bytes.length > 10000);
  }
});

test('the sound editor keeps defeat signals and revival effects distinct from removed unit-death audio', () => {
  const catalog = require('../../packages/hkd-sounds/catalog');
  assert.equal(catalog.details('assets/KinghtFallAudio/game_fail.mp3').category, 'signals');
  assert.equal(catalog.details('assets/gad_audios/fail.mp3').category, 'signals');
  assert.equal(catalog.details('assets/KinghtFallAudio/rebirth.mp3').category, 'abilities');
  assert(!catalog.index(root).items.some(item => item.category === 'deaths'));
});
