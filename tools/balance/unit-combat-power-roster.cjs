'use strict';

// Read-only source for the balancing sheet. It never loads gameplay, opens an
// editor, seeds timing defaults, or saves character/configuration data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Units = require('./unit-combat-power.cjs');
const Assets = require('../../packages/game-data-editor/lib/unit-assets');
const Profile = require('../../packages/game-data-editor/lib/attack-profile');
const Records = require('../../packages/game-data-editor/lib/unit-records');
const LevelStats = require('../../assets/_script/UnitLevelStats');

function collect(root, options = {}) {
  root = path.resolve(root);
  const configFile = path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json');
  const charactersFile = path.join(root, 'assets/resources/characters/catalog.json');
  const configBytes = fs.readFileSync(configFile), charactersBytes = fs.existsSync(charactersFile) ? fs.readFileSync(charactersFile) : Buffer.alloc(0);
  const config = options.config || JSON.parse(configBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const settings = config.GameTools || {}, documents = { A: { data: config } };
  const requests = Object.keys(config.SoldierCfg || {}).sort((a, b) => Number(a) - Number(b)).map(id => ({ type: 'enemy', id }))
    .concat(Object.keys(config.AllyCfg || {}).sort((a, b) => Number(a) - Number(b)).map(id => ({ type: 'ally', id, level: Records.levels(config, 'ally', id)[0], base: true })));
  if (options.allyLevels) {
    for (const id of Object.keys(config.AllyCfg || {})) for (const level of Records.levels(config, 'ally', id)) requests.push({ type: 'ally', id, level });
  }
  const rows = requests.map(request => {
    const base = Records.record(config, request.type, request.id);
    const record = request.type === 'ally' && request.level && !request.base ? LevelStats.resolve(base, settings, request.level) : base;
    const unit = { ...record, side: request.type };
    const description = Assets.describe(root, { ...request, record, documents, noRuntime: true, noShared: true });
    const descriptor = Profile.describe(description, settings, { ...request, record });
    const power = Units.calculate(unit, options.assumptions, { settings, descriptor });
    if (power.reason) throw Error('Cannot calculate ' + description.key + (request.level ? ' level ' + request.level : '') + ': ' + power.reason);
    return { side: request.type, id: Number(request.id), level: request.base ? 0 : request.level || 0, sourceLevel: request.level || 0, key: description.key,
      name: record.Name, icon: record.loadIcon, stats: { Health: record.Health, AttackDamage: record.AttackDamage, AttackInterval: record.AttackInterval }, descriptor, timing: power.attackTiming, power };
  });
  if (!configBytes.equals(fs.readFileSync(configFile)) || !charactersBytes.equals(fs.existsSync(charactersFile) ? fs.readFileSync(charactersFile) : Buffer.alloc(0))) throw Error('Configuration or character speeds changed during the CP export. Retry with the current source.');
  const sourceRevision = crypto.createHash('sha256').update(options.config ? JSON.stringify(config) : configBytes).update(charactersBytes).digest('hex');
  const timingRevision = crypto.createHash('sha256').update(JSON.stringify(rows.map(row => ({ side: row.side, id: row.id, level: row.level, descriptor: row.descriptor, timing: row.timing })))).digest('hex');
  return { version: 1, sourceRevision, timingRevision, settings, assumptions: { ...Units.DEFAULTS, ...options.assumptions }, rows };
}

module.exports = { collect };
if (require.main === module) {
  const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2), outputIndex = args.indexOf('--output');
  const data = JSON.stringify(collect(root, { allyLevels: args.includes('--ally-levels') }), null, 2) + '\n';
  if (outputIndex < 0) process.stdout.write(data);
  else {
    if (!args[outputIndex + 1]) throw Error('--output requires an external artifact file.');
    const destination = path.resolve(args[outputIndex + 1]), relative = path.relative(root, destination);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Write generated CP exports outside the project.');
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, data);
    process.stdout.write(JSON.stringify({ output: destination, rows: JSON.parse(data).rows.length }) + '\n');
  }
}
