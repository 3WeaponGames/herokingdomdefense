'use strict';
const UnitRecords=require('./unit-records');
const fs = require('fs');
const path = require('path');
const url = require('url');
const AttackTimings = require('./attack-timing-defaults');
const AssetValidation = require('./asset-validation');
let cachedRoot = '', cachedIndex = null;
function index(root) {
    if (cachedRoot === root && cachedIndex) return cachedIndex;
    const result = { uuids: {}, files: [] };
    function walk(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else {
                result.files.push(file);
                if (/\.meta$/.test(file)) {
                    try { const meta = JSON.parse(fs.readFileSync(file, 'utf8')); if (meta.uuid) result.uuids[meta.uuid] = file.slice(0, -5); } catch (_) {}
                }
            }
        });
    }
    walk(path.join(root, 'assets')); cachedRoot = root; cachedIndex = result; return result;
}
function enginePath() {
    if (process.env.COCOS_ENGINE_ROOT) {
        const configured = path.join(process.env.COCOS_ENGINE_ROOT, 'extensions/spine/lib/spine.js');
        if (!fs.existsSync(configured)) throw new Error('Configured COCOS_ENGINE_ROOT has no Creator Spine runtime: ' + configured);
        return configured;
    }
    const roots = [process.env.COCOS_ENGINE_ROOT, path.join(path.dirname(process.execPath), 'resources/engine'), 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine'].filter(Boolean);
    const found = roots.map(root => path.join(root, 'extensions/spine/lib/spine.js')).find(file => fs.existsSync(file));
    if (!found) throw new Error('Creator Spine runtime could not be found. Set COCOS_ENGINE_ROOT to this Creator installation\'s resources/engine folder.');
    return found;
}
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function relative(root, file) { return path.relative(root, file).replace(/\\/g, '/'); }
function layer(root, component, prefab, files) {
    const uuid = component._N$skeletonData && component._N$skeletonData.__uuid__, file = files.uuids[uuid];
    if (!file || !/\.json$/i.test(file)) throw new Error('Missing Spine asset ' + uuid);
    const atlasFile = file.replace(/\.json$/i, '.atlas'), skeleton = json(file), atlas = fs.readFileSync(atlasFile, 'utf8');
    const pages = {}, lines = atlas.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() && (i === 0 || !lines[i - 1].trim()) && lines[i + 1] && /^(size|format):/.test(lines[i + 1].trim())) {
            const name = lines[i].trim(), texture = path.resolve(path.dirname(file), name);
            if (path.dirname(texture) !== path.dirname(file) || !fs.existsSync(texture)) throw new Error('Missing atlas page ' + name);
            pages[name] = url.pathToFileURL(texture).href+'?revision='+fs.statSync(texture).mtimeMs;
        }
    }
    const node = prefab[component.node.__id__], trs = node._trs && node._trs.array;
    return { uuid, source: relative(root, file), name: node._name, json: skeleton, atlas, pages,
        skin: component.defaultSkin || 'default', animation: component.defaultAnimation || 'idle',
        x: trs ? trs[0] : 0, y: trs ? trs[1] : 0, scaleX: trs ? trs[7] : 1, scaleY: trs ? trs[8] : 1,
        skins: (skeleton.skins || []).map(s => s.name), animations: Object.keys(skeleton.animations || {}) };
}
function projectile(prefab, type, id) {
    const controller = prefab.find(c => c.ctrArr && (type !== 'hero' || c.ctrPlayAni));
    const component = controller ? prefab[controller.ctrArr.__id__] : prefab.find(c => c.bullet && c.speed !== undefined);
    if (!component) return null;
    return { speed: component.speed === undefined ? 600 : component.speed,
        angle: component.angle === undefined ? 20 : component.angle,
        angleSpeed: component.angleSpeed === undefined ? 50 : component.angleSpeed,
        addAngleSpeed: 100, arrivalRadius: 25, straight: type === 'hero' || Number(id) === 90008,
        directHoming: type === 'enemy' && Number(id) === 90008 };
}
function describe(root, request) {
    const files = index(root), type = request.type || 'enemy', id = String(request.id || 'hero');
    const documents = request.documents || {}, cfg = documents.A ? documents.A.data : json(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json'));
    if (type === 'building') {
        const record = request.record || cfg.BuildEnum[id], level = record && record.levelList && record.levelList[request.levelIndex || 0];
        let file = null,weaponFile=null;const weaponImages={};
        if (level) {
            try { file = level.Appearance ? AssetValidation.imported(root,'resources',level.Appearance.sprite,'sprite').file : AssetValidation.imported(root, 'KinghtFallIconBuild', level.Icon, 'sprite').file; }
            catch (_) { /* An absent or invalid draft icon has no static preview. */ }
            if(level.Appearance&&level.Appearance.weapon)try{weaponFile=AssetValidation.imported(root,'resources',level.Appearance.weapon.sprite,'sprite').file;}catch(_){/* Invalid draft weapon artwork has no preview. */}
            const views=level.Appearance&&level.Appearance.weapon&&level.Appearance.weapon.views;
            if(views)['north','southeast','south'].forEach(name=>{if(views[name])try{weaponImages[name]=url.pathToFileURL(AssetValidation.imported(root,'resources',views[name].sprite,'sprite').file).href;}catch(_){weaponImages[name]=null;}});
        }
        return { type, id, layers: [], image: file ? url.pathToFileURL(file).href : null, weaponImage:weaponFile?url.pathToFileURL(weaponFile).href:null, weaponImages, label: level ? level.Icon : 'Building', appearance:level&&level.Appearance||null, runtimePath: null };
    }
    if (['hero', 'enemy', 'ally'].indexOf(type) < 0) throw new Error('Unknown unit category.');
    const record = request.record || (type === 'ally' && cfg.AllyCfg && cfg.AllyCfg[id]) || cfg.SoldierCfg[id], boss = type === 'enemy' && UnitRecords.boss(id);
    if (type !== 'hero' && !record) throw new Error('Unit does not exist.');
    const prefabName = type === 'hero' ? null : boss ? 'ItemEnemy10' : (type === 'ally' ? 'Play' : '') + record.prefab;
    if (prefabName && !/^[A-Za-z0-9_-]+$/.test(prefabName)) throw new Error('Invalid unit prefab name.');
    const file = type === 'hero' ? path.join(root, 'assets/KinghtFallEnemyAni/ndPlay.prefab') : path.join(root, 'assets/KinghtFallEnemy', prefabName + '.prefab');
    const prefab = json(file), skeletons = prefab.filter(c => c.__type__ === 'sp.Skeleton');
    let chosen = type === 'hero' ? skeletons : [skeletons[boss ? Number(id) - 90010 : 0]];
    if (!chosen[0]) throw new Error('Unit has no display skeleton.');
    const levels=type==='ally'?[...new Set(Object.values(cfg.BuildEnum||{}).flatMap(build=>(build.levelList||[]).filter(level=>level.Data&&Number(level.Data[1])===Number(id)&&Number.isInteger(level.level)&&level.level>0).map(level=>level.level)))].sort((a,b)=>a-b):[];
    let levelProfile=null;
    if(type==='ally'&&request.level){
        if(!Number.isInteger(request.level)||!(levels.length?levels:[1]).includes(request.level))throw Error('Choose an existing ally level.');
        const file=path.join(root,'assets/resources/characters/catalog.json');if(fs.existsSync(file)){const looks=json(file),selected=looks.assignments['ally:'+id+':level:'+request.level]||looks.assignments['ally:'+id+':default'];levelProfile=looks.profiles[selected];}
    }
    const layers = chosen.map(c => layer(root,levelProfile&&levelProfile.baked?Object.assign({},c,{_N$skeletonData:{__uuid__:levelProfile.baked.uuid},defaultSkin:'default'}):c,prefab,files));
    const equipment = [];
    if (type === 'hero') {
        const roles = { ma: 6, doupeng: 1, tou: 2, gong: 4, jian: 3, shou: 5 };
        layers.forEach(l => {
            const role = Object.keys(roles).find(r => l.name === 'wqyl_lead_' + r);
            if (!role) return;
            const equip = cfg.EquipCfg.find(e => e.id === roles[role]);
            if (!equip) return;
            const level = Math.max(0, Math.min(equip.levelInfo.length - 1, Number((request.heroLevels || {})[equip.id] || 1) - 1));
            l.skin = equip.levelInfo[level].EquipSkin;
            equipment.push({ id: equip.id, label: {1:'Cape',2:'Head',3:'Arrow',4:'Bow',5:'Gloves',6:'Mount'}[equip.id], level: level + 1, max: equip.levelInfo.length });
        });
    }
    const sourceSet = new Set(layers.map(l => l.uuid)), shared = [];
    files.files.filter(f => /(?:ItemEnemy\d+|ndPlay)\.prefab$/.test(f)).forEach(f => {
        if (f === file) return;
        try { if (json(f).some(c => c.__type__ === 'sp.Skeleton' && c._N$skeletonData && sourceSet.has(c._N$skeletonData.__uuid__))) shared.push(relative(root, f)); } catch (_) {}
    });
    const form = UnitRecords.form(type,id), behavior=UnitRecords.behavior(record,id);
    const effect = type === 'hero' || record && record.AttackType === 2 ? 'Projectile release' : behavior === 90006 ? 'Attack-speed buff' : behavior === 90009 ? 'Healing pulse' : behavior === 90007 ? 'Hit and splash damage' : 'Melee hit';
    let shotPrefab = prefab;
    if (type === 'hero') shotPrefab = json(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'));
    const timing = AttackTimings.fromLayers(layers);
    return { type, id, form, key: type + ':' + id + ':' + form, source: relative(root, file), layers, shared, equipment,
        defaultTiming: timing.defaultTiming, timingDefaultSource: timing.timingDefaultSource, timingEvents: timing.timingEvents,
        effect, projectile: /Projectile/.test(effect) ? projectile(shotPrefab, type, behavior) : null,
        forms: boss ? [{id:90010,label:'Form 1'},{id:90011,label:'Form 2'},{id:90012,label:'Form 3'}] : [],
        ...(type==='ally'?{levels:levels.length?levels:[1],level:request.level||0}:{}),runtimePath: request.noRuntime ? null : enginePath(), silence: 'Render only; audio and gameplay are not loaded.' };
}
module.exports = { describe, index, enginePath, invalidate: function () { cachedIndex = null; } };
