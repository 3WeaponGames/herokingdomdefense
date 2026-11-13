'use strict';
// Clone only: source-geometry tests must not depend on a user's saved editor
// offsets. The authoring suites separately cover these settings and parity.
module.exports=function(config){const copy=JSON.parse(JSON.stringify(config));for(const category of Object.values(copy.BuildEnum||{}))for(const row of category.levelList||[])for(const key of ['WorldScale','ModelOffset','PartScale','Blocker','Shadow','PurchaseField','SpawnPositions','AdUnitPosition','DropShadow'])delete row[key];return copy;};
