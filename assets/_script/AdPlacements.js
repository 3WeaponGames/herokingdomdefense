Object.defineProperty(exports, "__esModule", { value: true });

// SDK identifiers belong here when real network placements are configured.
// These descriptions are developer metadata; player-facing text stays in the language tables.
exports.REWARDED_AD_TIMEOUT_MS = 90000;
var placements = {
  "home.currency.gold": { adUnitId: "", description: "Home gold supply" },
  "home.currency.gems": { adUnitId: "", description: "Home gem supply" },
  "home.energy.refill": { adUnitId: "", description: "Energy refill" },
  "home.treasure.draw": { adUnitId: "", description: "Treasure draw from home" },
  "home.treasure.repeatDraw": { adUnitId: "", description: "Treasure draw from results" },
  "home.talent.unlock": { adUnitId: "", description: "Talent unlock progress" },
  "home.signIn.extra": { adUnitId: "", description: "Extra daily sign-in reward" },
  "home.signIn.double": { adUnitId: "", description: "Double daily sign-in reward" },
  "home.pass.premium": { adUnitId: "", description: "Unlocked pass rank premium reward" },
  "home.defendWall.cooldown": { adUnitId: "", description: "Skip Defend the Wall entry cooldown" },
  "battle.buff.refresh": { adUnitId: "", description: "Refresh offered battle buffs" },
  "battle.buff.takeAll": { adUnitId: "", description: "Take all offered battle buffs" },
  "battle.silver.supply": { adUnitId: "", description: "Battle silver supply" },
  "battle.hero.revive": { adUnitId: "", description: "Instant hero revival" },
  "battle.retry": { adUnitId: "", description: "Retry defeat with bonus silver" },
  "battle.victory.double": { adUnitId: "", description: "Double victory settlement" },
  "battle.map.silver": { adUnitId: "", description: "Map silver offer" },
  "battle.map.weapon1": { adUnitId: "", description: "First map weapon upgrade" },
  "battle.map.weapon2": { adUnitId: "", description: "Second map weapon upgrade" },
  "battle.map.horse1": { adUnitId: "", description: "First map horse upgrade" },
  "battle.map.horse2": { adUnitId: "", description: "Second map horse upgrade" },
  "battle.barracks.extraSoldier": { adUnitId: "", description: "Additional barracks soldier" },
  "battle.building.branch": { adUnitId: "", description: "Ad-funded building branch upgrade" },
  "battle.offer.confirm": { adUnitId: "", description: "Optional map offer confirmation dialog" }
};
exports.RewardedAdPlacements = placements;
