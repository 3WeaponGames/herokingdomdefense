'use strict';
const UnitRecords=require('./unit-records');
const UnitPacks=require('../../hkd-characters/lib/unit-packs');
const MapCatalog=require('./map-catalog');
const EquipmentTiers=require('../../../assets/_script/EquipmentTiers');

// Validate the resource paths used by the actual runtime readers, rather than
// accepting a matching filename from an unrelated bundle. Read-only throughout.
const fs = require('fs');
const path = require('path');
const cache = new Map();
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const unwrap = value => value && own(value, 'data') ? value.data : value;
const normalized = file => file.replace(/\\/g, '/');
const BUILD_SCRIPTS = { 1: 'KinghtFallBuildMainFortress', 2: 'KinghtFallBuildBartizan', 3: 'KinghtFallBuildBarracks', 4: 'KinghtFallBuildHome', 5: 'KinghtFallBuildMill', 6: 'KinghtFallBuildWall' };
const EQUIP_FIELDS = { 1: 'spAniDrap', 2: 'spAniHead', 3: 'spAniArrow', 4: 'spAniBow', 5: 'spAniHand', 6: 'spAniMa' };
function read(file) {
    const stat = fs.statSync(file), old = cache.get(file), revision = stat.mtimeMs + ':' + stat.size;
    if (old && old.revision === revision) return old.value;
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    cache.set(file, { revision, value }); return value;
}
function resourcePath(value) {
    return typeof value === 'string' && value.length > 0 && !/^[\/]|[\\:\0]|(^|\/)\.{1,2}(\/|$)/.test(value) && value.split('/').every(Boolean);
}
function prefix(a, b) { return a.length <= b.length && a.every((value, index) => String(value) === String(b[index])); }
function touched(changes, doc, at) { return (changes || []).some(change => change.doc === doc && (prefix(change.path || [], at) || prefix(at, change.path || []))); }
function imported(root, bundle, key, kind) {
    const icon=kind==='sprite'&&typeof key==='string'&&/(?:^|\/)@icon\/(.+)$/.exec(key);
    if(icon){bundle='resources';key=icon[1];}
    const reference=kind==='sprite'&&typeof key==='string'&&/(?:^|\/)@sprite\/([^/]+)\/(.+)$/.exec(key);
    if(reference){bundle=reference[1];key=reference[2];if(!resourcePath(bundle)||bundle.includes('/'))throw Error('Invalid icon bundle');const meta=read(path.join(root,'assets',bundle+'.meta'));if(!meta.isBundle)throw Error('Icon must belong to a runtime asset bundle.');}
    if (!resourcePath(key)) throw new Error('Use an extension-free resource path inside ' + bundle + '.');
    const base = path.join(root, 'assets', bundle), absolute = path.resolve(base, key);
    if (!absolute.startsWith(path.resolve(base) + path.sep)) throw new Error('Resource path leaves its runtime bundle.');
    const folder = path.dirname(absolute), name = path.basename(absolute);
    if (!fs.existsSync(folder)) throw new Error('Missing resource ' + bundle + '/' + key);
    const extensions = kind === 'prefab' ? ['.prefab'] : kind === 'spine' ? ['.json'] : ['.png', '.jpg', '.jpeg', '.webp'];
    // Keep the actual filename's case: resource keys are case-sensitive after build.
    const candidates = fs.readdirSync(folder).filter(file => extensions.some(extension => file === name + extension));
    for (const filename of candidates) {
        const file = path.join(folder, filename), metafile = file + '.meta';
        if (!fs.existsSync(metafile)) continue;
        const meta = read(metafile);
        if (kind === 'prefab' && meta.importer === 'prefab') return { file, meta, data: read(file) };
        if (kind === 'spine' && meta.importer === 'spine') {
            const data = read(file);
            if (!data.skeleton || !data.animations) throw new Error('Resource is not a usable Spine skeleton: ' + bundle + '/' + key);
            const atlas = file.replace(/\.json$/, '.atlas');
            if (!fs.existsSync(atlas)) throw new Error('Spine atlas is missing for ' + bundle + '/' + key);
            const lines = fs.readFileSync(atlas, 'utf8').split(/\r?\n/);
            lines.forEach((line, index) => {
                if (!line.trim() || index > 0 && lines[index - 1].trim() || !lines[index + 1] || !/^(size|format):/.test(lines[index + 1].trim())) return;
                const page = line.trim();
                if (!resourcePath(page) || !fs.existsSync(path.join(path.dirname(atlas), page))) throw new Error('Spine atlas page is missing for ' + bundle + '/' + key + ': ' + page);
            });
            return { file, meta, data };
        }
        if (kind === 'sprite' && Object.keys(meta.subMetas || {}).some(name => meta.subMetas[name].importer === 'sprite-frame')) return { file, meta };
    }
    throw new Error('No imported ' + (kind === 'sprite' ? 'SpriteFrame' : kind) + ' at ' + bundle + '/' + key + '. Select an asset from that bundle.');
}
function createContext(root, documents) {
    let uuidFiles = null, buildingAssets = null, equipmentAssets = null, buildingPrefixes = null, projectileAssets = null;
    function metaFiles() {
        if (uuidFiles) return uuidFiles;
        uuidFiles = {};
        function walk(folder) {
            fs.readdirSync(folder, { withFileTypes: true }).forEach(entry => {
                const file = path.join(folder, entry.name);
                if (entry.isDirectory()) return walk(file);
                if (!/\.json\.meta$/.test(file)) return;
                const meta = read(file); if (meta.importer === 'spine' && meta.uuid) uuidFiles[meta.uuid] = file.slice(0, -5);
            });
        }
        walk(path.join(root, 'assets')); return uuidFiles;
    }
    function skeleton(component) {
        if (!component || component.__type__ !== 'sp.Skeleton') throw new Error('The referenced model component is not a Spine skeleton.');
        const uuid = component._N$skeletonData && component._N$skeletonData.__uuid__, file = metaFiles()[uuid];
        if (!file) throw new Error('The model references a missing Spine skeleton: ' + uuid);
        const data = read(file);
        return { file, data, skins: Array.isArray(data.skins) ? data.skins.map(skin => skin.name) : Object.keys(data.skins || {}) };
    }
    function prefixes() {
        if (buildingPrefixes) return buildingPrefixes;
        buildingPrefixes = {};
        Object.keys(BUILD_SCRIPTS).forEach(id => {
            const uuid = read(path.join(root, 'assets/_script', BUILD_SCRIPTS[id] + '.js.meta')).uuid;
            buildingPrefixes[uuid.replace(/-/g, '').slice(0, 5)] = Number(id);
        });
        return buildingPrefixes;
    }
    function map(id) {
        const document = documents['map:' + id];
        return document ? unwrap(document) : imported(root, 'KinghtFallIconMap', id, 'prefab').data;
    }
    function buildingType(component) { return component && prefixes()[String(component.__type__).slice(0, 5)]; }
    function buildings() {
        if (buildingAssets) return buildingAssets;
        buildingAssets = {};
        MapCatalog.IDS.forEach(id => {
            const prefab = map(id);
            prefab.forEach(component => {
                const type = component && component.ndAniMain && buildingType(component); if (!type) return;
                const assets = buildingAssets[type] || (buildingAssets[type] = new Map());
                [component.ndAniMain, component.ndAniDown].concat(component.ndAniOther || []).filter(Boolean).forEach(ref => {
                    const asset = skeleton(prefab[ref.__id__]); assets.set(asset.file, asset);
                });
            });
        });
        return buildingAssets;
    }
    function equipment() {
        if (equipmentAssets) return equipmentAssets;
        equipmentAssets = {};
        projectileAssets = new Map();
        ['assets/KinghtFallEnemyAni/ndPlay.prefab', 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'].forEach(file => {
            const prefab = read(path.join(root, file));
            prefab.filter(component => component.spAniDrap && component.spAniBody).forEach(controller => Object.keys(EQUIP_FIELDS).forEach(id => {
                const reference = controller[EQUIP_FIELDS[id]];
                if (!reference) throw new Error('Hero model is missing equipment layer ' + EQUIP_FIELDS[id]);
                const asset = skeleton(prefab[reference.__id__]);
                const assets = equipmentAssets[id] || (equipmentAssets[id] = new Map()); assets.set(asset.file, asset);
            }));
            // The arrow equipment skin is also applied to the projectile model.
            prefab.filter(component => component.bullet).forEach(controller => {
                const node = prefab[controller.bullet.__id__];
                (node && node._components || []).forEach(ref => {
                    const component = prefab[ref.__id__];
                    if (component.__type__ === 'sp.Skeleton') {
                        const asset = skeleton(component); projectileAssets.set(asset.file, asset);
                    }
                });
            });
        });
        return equipmentAssets;
    }
    function equipmentSkin(id, name) {
        skin(name, equipment()[id]);
        if (Number(id) !== 3) return;
        projectileAssets.forEach(asset => {
            const resolved = EquipmentTiers.legacySkin(name, value => asset.skins.includes(value));
            if (!resolved) skin(name, new Map([[asset.file, asset]]));
        });
    }
    function skin(value, assets) {
        if (typeof value !== 'string' || !value.length) throw new Error('Choose a named skin from this model.');
        if (!assets || !assets.size) throw new Error('No runtime model could be resolved for this skin.');
        assets.forEach(asset => { if (asset.skins.indexOf(value) < 0) throw new Error('Skin "' + value + '" is missing from ' + normalized(path.relative(root, asset.file))); });
    }
    function unitModel(candidate, template) {
        const models = candidate.filter(component => component.__type__ === 'sp.Skeleton');
        const expected = template.filter(component => component.__type__ === 'sp.Skeleton');
        if (models.length < expected.length || !models.length) throw new Error('Selected unit prefab is missing one or more animated model parts.');
        models.forEach((component, index) => {
            const asset = skeleton(component);
            if (component.defaultSkin && asset.skins.indexOf(component.defaultSkin) < 0) throw new Error('Unit model default skin does not exist: ' + component.defaultSkin);
            if (component.defaultAnimation && !asset.data.animations[component.defaultAnimation]) throw new Error('Unit model default animation does not exist: ' + component.defaultAnimation);
            if (expected[index]) {
                const reference = skeleton(expected[index]);
                Object.keys(reference.data.animations || {}).forEach(name => { if (!asset.data.animations[name]) throw new Error('Unit model is missing required animation: ' + name); });
            }
        });
    }
    return { map, buildingType, buildings, equipment, equipmentSkin, skin, skeleton, unitModel };
}
function validate(root, documents, changes) {
    if (!changes || !changes.length) return [];
    const issues = [], context = createContext(root, documents), base = unwrap(documents.A) || {};
    function issue(doc, at, message) { issues.push({ doc, path: at, severity: 'error', message }); }
    function check(doc, at, value, fn, optional) {
        if (!touched(changes, doc, at)) return;
        if (optional && value === undefined) return;
        try { fn(value); } catch (error) { issue(doc, at, error.message); }
    }
    function sprite(doc, at, value, bundle, optional) { check(doc, at, value, name => imported(root, bundle, name, 'sprite'), optional); }
    ['A', 'B', 'D'].forEach(doc => {
        const config = unwrap(documents[doc]);
        (config && config.LevelCfg || []).forEach((stage, index) => {
            const at = ['LevelCfg', index];
            check(doc, at.concat('prefab'), stage.prefab, name => {
                const prefab = imported(root, 'KinghtFallIconMap', name, 'prefab').data;
                const rootNode = prefab[prefab[0] && prefab[0].data && prefab[0].data.__id__];
                const names = (rootNode && rootNode._children || []).map(ref => prefab[ref.__id__] && prefab[ref.__id__]._name);
                ['ndBg', 'ndDown', 'ndPath', 'ndTrack', 'ndMain', 'ndUI'].forEach(layer => { if (names.indexOf(layer) < 0) throw new Error('Playable map is missing required layer ' + layer); });
            });
            sprite(doc, at.concat('Map'), stage.Map, 'KinghtFallIconMap');
            check(doc, at.concat('EnemyAni'), stage.EnemyAni, name => {
                if (!resourcePath(name) || name.indexOf('/') >= 0) throw new Error('Choose the home enemy animation folder name.');
                const asset = imported(root, 'KinghtFallEnemyAni', name + '/' + name, 'spine');
                const skins = Array.isArray(asset.data.skins) ? asset.data.skins.map(skin => skin.name) : Object.keys(asset.data.skins || {});
                if (skins.indexOf('hong') < 0 || !asset.data.animations.idle) throw new Error('Home stage animation needs the hong skin and idle animation.');
            });
            ['HomeLevel1Unlock', 'HomeLevel2Unlock', 'HomeLevel3Unlock', 'HomeLevel4Unlock'].forEach(key => {
                const changedMap = touched(changes, doc, at.concat('prefab'));
                if (!changedMap && !touched(changes, doc, at.concat(key))) return;
                try {
                    const prefab = context.map(stage.prefab), slots = {};
                    prefab.forEach(component => { if (component && component.ID && component.ndAniMain) slots[component.ID] = context.buildingType(component); });
                    (stage[key] || []).forEach((pair, pi) => {
                        if (slots[pair[1]] && slots[pair[1]] !== pair[0]) issue(doc, at.concat(key, pi), 'Map slot ' + pair[1] + ' uses building type ' + slots[pair[1]] + ', not type ' + pair[0] + '. Choose a compatible slot.');
                    });
                } catch (error) { issue(doc, at.concat(key), error.message); }
            });
        });
    });
    (base.BuffCfg || []).forEach((perk, index) => sprite('A', ['BuffCfg', index, 'Image'], perk.Image, 'KinghtFallIconBuff'));
    for(const table of ['SoldierCfg','AllyCfg'])Object.keys(base[table] || {}).forEach(id => {
        const unit = base[table][id], at = [table, id], allied=table==='AllyCfg';
        check('A', at.concat('prefab'), unit.prefab, name => {
            if (!allied && [90011,90012].includes(Number(id))) throw new Error('Boss transformation forms have no directly spawnable prefab.');
            const candidate = imported(root, 'KinghtFallEnemy', (allied?'Play':'')+name, 'prefab').data;
            const templateID=UnitRecords.behavior(unit,id);
            if(unit.BehaviorTemplate!==undefined&&!UnitRecords.BEHAVIOR_TEMPLATES.includes(templateID))throw new Error('Choose an implemented monster behavior template.');
            const canonical = (allied?'Play':'')+'ItemEnemy' + String(templateID - 90000).padStart(2, '0');
            const template = imported(root, 'KinghtFallEnemy', canonical, 'prefab').data;
            const types = template.filter(c => c.__type__ && c.__type__.indexOf('.') < 0).map(c => c.__type__);
            if (!types.some(type => candidate.some(c => c.__type__ === type))) throw new Error('Selected prefab has a different gameplay controller. Use a model variant of ' + canonical + '.');
            context.unitModel(candidate, template);
            if (!allied && !base.AllyCfg && Number(id) <= 90004) {
                const ally = imported(root, 'KinghtFallEnemy', 'Play' + name, 'prefab').data;
                const allyTemplate = imported(root, 'KinghtFallEnemy', 'Play' + canonical, 'prefab').data;
                const allyTypes = allyTemplate.filter(c => c.__type__ && c.__type__.indexOf('.') < 0).map(c => c.__type__);
                if (!allyTypes.some(type => ally.some(c => c.__type__ === type))) throw new Error('The allied Play' + name + ' prefab has an incompatible controller.');
                context.unitModel(ally, allyTemplate);
            }
            if (!candidate.some(c => c.__type__ === 'sp.Skeleton')) throw new Error('Selected unit prefab has no animated model.');
        }, !allied && [90011,90012].includes(Number(id)));
        check('A', at.concat('loadIcon'), unit.loadIcon, name => imported(root, 'KinghtFallEnemy', 'icon/' + name, 'sprite'), !allied && [90011,90012].includes(Number(id)));
        if(unit.MonsterSource!==undefined)check('A',at.concat('MonsterSource'),unit.MonsterSource,source=>{
            if(!UnitPacks.isMonsterSource(source))throw new Error('Choose a known imported monster source.');
            const [pack,name]=source.split('/'),catalog=read(path.join(root,'assets/resources/unit-library',pack,'catalog.json'));
            if(!catalog.units.some(unit=>unit.id===source))throw new Error('Monster source is not present in its imported pack catalog.');
            imported(root,'resources','unit-library/'+pack+'/Units/'+name,'spine');
        });
    });
    Object.keys(base.BuildEnum || {}).forEach(id => {
        const building = base.BuildEnum[id];
        (building.levelList || []).forEach((level, index) => {
            const at = ['BuildEnum', id, 'levelList', index];
            sprite('A', at.concat('Icon'), level.Icon, 'KinghtFallIconBuild');
            check('A', at.concat('Skin'), level.Skin, name => context.skin(name, context.buildings()[id]));
            if(level.Appearance&&typeof level.Appearance==='object'&&!Array.isArray(level.Appearance)){
                check('A',at.concat('Appearance','sprite'),level.Appearance.sprite,name=>imported(root,'resources',name,'sprite'));
                if(level.Appearance.destroyed&&typeof level.Appearance.destroyed==='object'&&!Array.isArray(level.Appearance.destroyed))check('A',at.concat('Appearance','destroyed','sprite'),level.Appearance.destroyed.sprite,name=>imported(root,'resources',name,'sprite'));
                if(level.Appearance.weapon&&typeof level.Appearance.weapon==='object'&&!Array.isArray(level.Appearance.weapon))check('A',at.concat('Appearance','weapon','sprite'),level.Appearance.weapon.sprite,name=>imported(root,'resources',name,'sprite'));
                const views=level.Appearance.weapon&&level.Appearance.weapon.views;
                if(views&&typeof views==='object'&&!Array.isArray(views))['north','northeast','southeast','south'].forEach(direction=>{if(views[direction]&&typeof views[direction]==='object'){check('A',at.concat('Appearance','weapon','views',direction,'sprite'),views[direction].sprite,name=>imported(root,'resources',name,'sprite'));if(views[direction].emptySprite)check('A',at.concat('Appearance','weapon','views',direction,'emptySprite'),views[direction].emptySprite,name=>imported(root,'resources',name,'sprite'));}});
                if(level.Appearance.weapon&&level.Appearance.weapon.emptySprite)check('A',at.concat('Appearance','weapon','emptySprite'),level.Appearance.weapon.emptySprite,name=>imported(root,'resources',name,'sprite'));
                if(Array.isArray(level.Appearance.lighting))level.Appearance.lighting.forEach((light,li)=>{
                    if(!light||typeof light!=='object'||Array.isArray(light))return;
                    const lightAt=at.concat('Appearance','lighting',li);
                    if(own(light,'sprite'))check('A',lightAt.concat('sprite'),light.sprite,name=>imported(root,'resources',name,'sprite'));
                    if(light.glow&&typeof light.glow==='object'&&own(light.glow,'sprite'))check('A',lightAt.concat('glow','sprite'),light.glow.sprite,name=>imported(root,'resources',name,'sprite'));
                    if(Array.isArray(light.glows))light.glows.forEach((glow,gi)=>{if(glow&&typeof glow==='object'&&own(glow,'sprite'))check('A',lightAt.concat('glows',gi,'sprite'),glow.sprite,name=>imported(root,'resources',name,'sprite'));});
                });
            }
        });
    });
    (base.EquipCfg || []).forEach((equipment, index) => (equipment.levelInfo || []).forEach((level, li) => {
        const at = ['EquipCfg', index, 'levelInfo', li];
        sprite('A', at.concat('Image'), level.Image, 'KinghtFallIconCharacter');
        sprite('A', at.concat('EquipBottom'), level.EquipBottom, 'KinghtFallIconGood');
        check('A', at.concat('EquipSkin'), level.EquipSkin, name => context.equipmentSkin(equipment.id, name));
    }));
    Object.keys(base.TalentCfg || {}).forEach(id => sprite('A', ['TalentCfg', id, 'Image'], base.TalentCfg[id].Image, 'KinghtFallIconTalent'));
    Object.keys(base.GoodsCfg || {}).forEach(id => ['icon','sprBg'].forEach(key => sprite('A', ['GoodsCfg',id,key], base.GoodsCfg[id][key], 'KinghtFallIconGood', true)));
    const overrides = unwrap(documents.overrides) || base.GameTools || {};
    Object.keys(overrides.unitTypes || {}).forEach(id=>{const type=overrides.unitTypes[id];if(type&&typeof type==='object')check('overrides',['unitTypes',id,'icon'],type.icon,name=>imported(root,'KinghtFallEnemy',name.startsWith('@icon/')?name:'icon/'+name,'sprite'));});
    ['timings', 'timingDefaults'].forEach(group => Object.keys(overrides[group] || {}).forEach(key => {
        const parts = key.split(':'), side = parts[0], id = Number(parts[1]), form = parts[2];
        if (!touched(changes, 'overrides', [group, key]) && !touched(changes, 'A', [side==='ally'&&base.AllyCfg?'AllyCfg':'SoldierCfg', parts[1], 'prefab'])) return;
        const valid = parts.length === 3 && UnitRecords.reachable(base,side,parts[1],form);
        if (!valid) { issue('overrides', [group, key], 'Timing key does not identify a reachable unit and form.'); return; }
        const item = overrides[group][key];
        if (!item || typeof item.attack !== 'number' || !Number.isFinite(item.attack)) return;
        try {
            let component;
            if (side === 'hero') {
                const prefab = read(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'));
                const controller = prefab.find(c => c.spAniBody && c.spAniDrap);
                component = controller && prefab[controller.spAniBody.__id__];
            } else {
                const unit = (side==='ally'&&base.AllyCfg||base.SoldierCfg||{})[id];
                if (!unit) throw new Error('Timing unit no longer exists.');
                const boss = side === 'enemy' && UnitRecords.boss(id);
                const prefab = imported(root, 'KinghtFallEnemy', boss ? 'ItemEnemy10' : (side === 'ally' ? 'Play' : '') + unit.prefab, 'prefab').data;
                component = prefab.filter(c => c.__type__ === 'sp.Skeleton')[boss ? id - 90010 : 0];
            }
            const asset = context.skeleton(component), animation = asset.data.animations && asset.data.animations.attack;
            if (!animation) throw new Error('This unit model has no attack animation.');
            const duration = clipDuration(animation);
            if (item.attack > duration + 1e-9) throw new Error('Attack timing exceeds the actual ' + duration + '-second attack animation.');
        } catch (error) { issue('overrides', [group, key, 'attack'], error.message); }
    }));
    return issues;
}
function clipDuration(animation) {
    let duration = 0;
    function walk(value) {
        if (!value || typeof value !== 'object') return;
        if (typeof value.time === 'number' && Number.isFinite(value.time)) duration = Math.max(duration, value.time);
        Object.keys(value).forEach(key => walk(value[key]));
    }
    walk(animation); return duration;
}
module.exports = { validate, imported, resourcePath, touched, createContext, clipDuration };
