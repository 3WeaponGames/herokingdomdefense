'use strict';

// Only the original three transformation records share the legacy boss rig.
// Imported monster IDs are independent, normally spawnable enemy records.
const BOSS_IDS = [90010, 90011, 90012];
const BEHAVIOR_TEMPLATES = [90001, 90002, 90003, 90004, 90005, 90006, 90007, 90008, 90009];
function boss(id) { return BOSS_IDS.includes(Number(id)); }
function form(side, id) { return side === 'enemy' && boss(id) ? String(Number(id) - 90009) : 'default'; }
function record(base, side, id) { return ((side === 'ally' && base.AllyCfg) || base.SoldierCfg || {})[id]; }
function reachable(base, side, id, selectedForm) {
    if (side === 'hero') return id === 'hero' && selectedForm === 'default';
    if (!['enemy', 'ally'].includes(side) || String(Number(id)) !== String(id) || !record(base, side, id)) return false;
    if (side === 'ally' && (Number(id) < 90001 || Number(id) > 90004)) return false;
    return selectedForm === form(side, id);
}
function levels(base, side, id) {
    if (side !== 'ally' || !reachable(base, side, String(id), 'default')) return [];
    const barracks = base.BuildEnum && base.BuildEnum[3], rows = barracks && barracks.levelList;
    const result = [...new Set((Array.isArray(rows) ? rows : []).filter(row =>
        row && Array.isArray(row.Data) && Number(row.Data[1]) === Number(id) && Number.isInteger(row.level) && row.level > 0
    ).map(row => row.level))].sort((a, b) => a - b);
    // Match character appearance selection for legacy configurations without
    // a configured barracks row: the existing ally still has its first level.
    return result.length ? result : [1];
}
function behavior(unit, id) { return unit && unit.BehaviorTemplate !== undefined ? Number(unit.BehaviorTemplate) : Number(id); }
module.exports = { BOSS_IDS, BEHAVIOR_TEMPLATES, boss, form, record, reachable, levels, behavior };
