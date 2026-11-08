'use strict';

// The approved 2026-11-07 timing references cover the original campaign units.
// Imported rigs may have no event markers; they must never acquire guessed
// authored reference events just to satisfy the legacy approval checks.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function legacyUnits(root, documents) {
    const data = JSON.parse(JSON.stringify(documents && documents.A ? documents.A.data || documents.A :
        JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json'), 'utf8'))));
    data.SoldierCfg = Object.fromEntries(Object.entries(data.SoldierCfg).filter(([id]) => Number(id) >= 90001 && Number(id) <= 90012));
    return { A: { data } };
};
