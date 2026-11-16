'use strict';
// Explicit Character Plan publication; never called by an editor open/save.
// Existing percentage-point values (0.2..5) become fractions (0.002..0.05).
function migrate(config){
 if(!config?.HeroEquipment||config.HeroEquipment.foodRegenerationVersion>=1)return false;
 const gear=config.EquipCfg?.find(row=>row.id===3);if(!gear)return false;
 for(const row of gear.levelInfo||[]){const fighter=row.SecondaryStats?.fighter;if(!fighter)continue;
  if(fighter.healthRegenPercent===undefined&&typeof fighter.healthRegen==='number'&&Number.isFinite(fighter.healthRegen))fighter.healthRegenPercent=Number((fighter.healthRegen/100).toFixed(8));
  // Keep the legacy field for old clients; new clients prefer the explicit
  // fractional field. Prices, progress, IDs and unknown settings stay intact.
 }
 config.HeroEquipment.foodRegenerationVersion=1;return true;
}
exports.migrate=migrate;
