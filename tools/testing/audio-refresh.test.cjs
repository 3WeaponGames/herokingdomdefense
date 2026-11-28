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
    const file = path.join(audio, item.path + '.ogg'), bytes = fs.readFileSync(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'OggS'); assert(bytes.subarray(0,64).includes(Buffer.from('vorbis'))); assert(bytes.length > 10000);
  }
});

test('the sound editor keeps defeat signals and revival effects distinct from removed unit-death audio', () => {
  const catalog = require('../../packages/hkd-sounds/catalog');
  assert.equal(catalog.details('assets/KinghtFallAudio/game_fail.mp3').category, 'signals');
  assert.equal(catalog.details('assets/gad_audios/fail.mp3').category, 'signals');
  assert.equal(catalog.details('assets/KinghtFallAudio/rebirth.mp3').category, 'abilities');
  assert(!catalog.index(root).items.some(item => item.category === 'deaths'));
});

test('all Hurt audio and its playback references are removed while other review marks remain valid',()=>{
 const indexed=require('../../packages/hkd-sounds/catalog').index(root);
 assert(!indexed.items.some(item=>/hurt/i.test(item.key+' '+item.name)));
 const config=fs.readFileSync(path.join(root,'assets/_script/KinghtFallConfig.js'),'utf8');
 const hero=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGamePlayCtrl.js'),'utf8');
 assert(!config.includes('player_hurt'));assert(!hero.includes('KinghtFallAudioId.player_hurt'));
 const review=JSON.parse(fs.readFileSync(path.join(root,'authoring/audio-review.json'),'utf8'));
 const removed=['10e042ee-6495-429f-bf76-54f84ea2af6d','b273036e-d575-445d-a12d-56eeeede9c30','526c12fc-ebc4-42dd-bd1f-8a8a2c03216f','f80a55dd-a732-475e-ab04-382b3d051adf','53d0aada-76ab-479e-9c77-76fae83d1f8d'];
 for(const uuid of removed)assert.equal(review.marks['uuid:'+uuid],undefined);
});

test('boss, shared critical and Bruiser basic effects retain their approved OGG encodings, identities and durations',()=>{
 const expected={
  'sfx/boss-arrival.ogg':['b69aefa217876f07c91d51ed7e73ca2d8ad7bc233f2891779b48fcf518814b69','46a8e3f4-5f59-48b8-a094-2afd74916202',4],
  'sfx/critical-hit.ogg':['e011896a4c38d99d6319fd6edc3b91d9c5a5f59b593970a758fa3b2759915ad7','77dc0009-77c0-434a-9bdb-1f66d0259960',1.48],
  'sfx/impact-bruiser-basic.ogg':['e596cf844f3970994ac91021f9b78ff137b0c87dc0aba8d332c556974570f70b','91b02bf2-2eaa-4463-af1b-f1f657137ab4',1]
 };
 const indexed=require('../../packages/hkd-sounds/catalog').index(root);
 for(const [file,[hash,uuid,duration]]of Object.entries(expected)){
  const bytes=fs.readFileSync(path.join(audio,file)),meta=JSON.parse(fs.readFileSync(path.join(audio,file+'.meta'),'utf8'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,file);
  assert.equal(bytes.toString('ascii',0,4),'OggS');assert.equal(meta.duration,duration);
  if(uuid)assert.equal(meta.uuid,uuid,'Existing asset identity must survive replacement');
  assert(!fs.existsSync(path.join(audio,file.replace('.ogg','.wav'))));
  const item=indexed.items.find(row=>row.file==='assets/KinghtFallAudio/'+file);
  assert.equal(item.category,file.includes('boss-arrival')?'signals':'impacts');
 }
 const critical=indexed.items.find(row=>row.key==='critical-hit');
 assert.equal(critical.name,'Critical strike hit');
 const snow=indexed.items.find(row=>row.key==='planning-snow');assert.equal(snow.kind,'music');
});

test('the retired healing sound is absent from game assets, the mix and the Sounds editor',()=>{
 const cue='sfx/healing-receive', uuid='42f18291-820c-4151-ae3f-d467010eb48b';
 const indexed=require('../../packages/hkd-sounds/catalog').index(root);
 const review=JSON.parse(fs.readFileSync(path.join(root,'authoring/audio-review.json'),'utf8'));
 assert(!fs.existsSync(path.join(audio,cue+'.mp3')));
 assert(!fs.existsSync(path.join(audio,cue+'.mp3.meta')));
 assert(!indexed.items.some(item=>item.uuid===uuid||item.key==='healing-receive'));
 assert.equal(review.marks['uuid:'+uuid],undefined);
 const mix=fs.readFileSync(path.join(root,'assets/_script/AudioMixCatalog.js'),'utf8');
 assert(!mix.includes(uuid)&&!mix.includes(cue));
 assert.equal(require('../../assets/_script/BattleSoundCatalog').effects['healing-receive'],undefined);
});
