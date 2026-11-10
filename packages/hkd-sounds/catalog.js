'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const baseline = require('./original-audio.json');
const originalHashes = new Set(Object.values(baseline.files));
const AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac|aif|aiff|opus|webm)$/i;
const CATEGORIES = [
  ['weapons', 'Weapons & attacks'], ['impacts', 'Hits & damage'], ['deaths', 'Deaths'],
  ['abilities', 'Abilities & magic'], ['horses', 'Horse steps · 8 biomes'], ['movement', 'Other movement'],
  ['ambience', 'Biome ambience'], ['voices', 'Unit voices'], ['buildings', 'Buildings & gates'],
  ['signals', 'Battle & wave signals'], ['orders', 'Unit orders'], ['rewards', 'Rewards & upgrades'],
  ['interface', 'Interface'], ['music', 'Music'], ['other', 'Other sounds']
].map(pair => ({ id: pair[0], name: pair[1] }));
const BIOMES = ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava'];
const TITLES = {
  buliding: 'Building construction', destory: 'Building destroyed', palyer_attack: 'Hero arrow release',
  player_hurt: 'Hero hurt', death: 'Hero death', rebirth: 'Hero revival', run: 'Original horse steps',
  cuo: 'Unavailable action', set_of: 'Set off', get_idea: 'Perk gained', box_treasure: 'Treasure chest',
  btnclick: 'Button click · shared', button_click: 'Button click', Scroll_down: 'Scroll down',
  menu_bgm: 'Menu theme', fight_bgm: 'Original battle theme', ready_bgm: 'Original planning theme',
  Cards: 'Card action', Levels: 'Wall Defense level theme', bgm: 'Wall Defense theme'
};
const title = value => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
function details(file) {
  const key = path.basename(file, path.extname(file)), sfx = file.includes('/sfx/'), voice = file.includes('/voices/');
  let category = 'other', kind = 'effect', biome = null, unit = null, tier = null;
  const match = /^(?:hooves|ambience)-(.+)-loop$/.exec(key);
  if (match && BIOMES.includes(match[1])) biome = match[1];
  if (voice) {
    category = 'voices'; kind = 'voice'; unit = file.split('/').slice(-2, -1)[0];
    const level = /-level-(\d+)-/.exec(key); tier = level ? Number(level[1]) : null;
  } else if (/^(hooves-)/.test(key)) category = 'horses';
  else if (/^(footsteps-|movement-)/.test(key) || key === 'run') category = 'movement';
  else if (/^ambience-/.test(key)) { category = 'ambience'; kind = 'ambience'; }
  else if (/(?:bgm|theme)/i.test(key) || ['Sands_of_the_Keep', 'Skybound_Horns', 'Levels'].includes(key)) { category = 'music'; kind = 'music'; }
  else if (/^death-/.test(key) || ['death', 'rebirth', 'fail', 'game_fail'].includes(key)) category = 'deaths';
  else if (/^(impact-|arrow-impact-|magic-impact|hurt-)|cannon-impact|critical-hit/.test(key) || ['player_hurt', 'enemyHit', 'strike'].includes(key)) category = 'impacts';
  else if (/^(sword-|cavalry-lance|monster-|golem-ground|bow-|crossbow-|enemy-(?:spit|magic)|sniper-|cannon-tower)/.test(key) || ['palyer_attack', 'attack2', 'bullet'].includes(key)) category = 'weapons';
  else if (/^(healing-|freeze-|slow-|chain-|shield-|mirror-|gravity-|life-steal|phoenix-|hourglass-|debuff-|boss-(?:transformation|special))/.test(key) || key === 'buff') category = 'abilities';
  else if (/^(gate-|barracks-)/.test(key) || ['buliding', 'destory'].includes(key)) category = 'buildings';
  else if (/^(wave-|boss-arrival|castle-low)/.test(key) || ['game_success', 'victory', 'set_of', 'mission'].includes(key)) category = 'signals';
  else if (/^(order-|unit-select)/.test(key)) category = 'orders';
  else if (/(reward|treasure|level_up|get_idea|unlock)/.test(key)) category = 'rewards';
  else if (/^ui-/.test(key) || ['button_click', 'btnclick', 'cuo', 'Scroll_down', 'Cards', 'open'].includes(key)) category = 'interface';
  let name = TITLES[key] || title(key.replace(/-loop$/, ''));
  if (voice) { const variant = /-variant-(\d+)/.exec(key); name = title(unit) + (tier ? ' · Tier ' + tier + (variant ? ' · Line ' + variant[1] : '') : /-death$/.test(key) ? ' · Death' : ' · ' + title(key)); }
  if (biome) name = title(biome) + (category === 'horses' ? ' · Horse steps' : ' · Ambience');
  return { key, name, category, kind, biome, unit, tier, loop: /-loop$/.test(key) || kind === 'music', generated: sfx || voice };
}
function index(root) {
  root = path.resolve(root); const assets = path.join(root, 'assets'), result = [], warnings = [], ids = new Set();
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { scan(file); continue; }
      if (!AUDIO.test(entry.name)) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8').replace(/^\uFEFF/, '')); }
      catch (error) { warnings.push(relative + ': ' + (error.code === 'ENOENT' ? 'No import metadata' : 'Unreadable import metadata')); }
      const bytes = fs.readFileSync(file), hash = crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
      const original = baseline.files[relative], info = details(relative);
      let id = meta.uuid ? 'uuid:' + meta.uuid : 'path:' + relative;
      if (ids.has(id)) { warnings.push(relative + ': Duplicate asset UUID; using its path for the checklist'); id = 'path:' + relative; }
      ids.add(id);
      result.push(Object.assign(info, { id, file: relative, bytes: bytes.length, format: path.extname(file).slice(1).toUpperCase(),
        duration: Number.isFinite(meta.duration) && meta.duration > 0 ? meta.duration : null,
        origin: originalHashes.has(hash) ? 'original' : 'new', replacesOriginal: !!original && !originalHashes.has(hash),
        collection: relative.split('/')[1] === 'gad_audios' ? 'Wall Defense' : relative.split('/')[1] === 'KinghtFallAudio' ? 'Kingdom Defense' : 'Shared',
        uuid: meta.uuid || null }));
    }
  }
  scan(assets);
  return { items: result.sort((a, b) => a.file.localeCompare(b.file)), categories: CATEGORIES, biomes: BIOMES, warnings,
    baseline: baseline.commit, originDescription: 'Original = unchanged audio from the first project checkpoint. New = added or replaced audio, including the generated effects and unit voices.' };
}
module.exports = { index, details, CATEGORIES, BIOMES, AUDIO };
