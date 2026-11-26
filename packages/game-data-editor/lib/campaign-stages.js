'use strict';

function activeStages(campaign) {
  const stages = campaign?.LevelCfg || [];
  const limit = campaign?.GameTools?.campaignStageLimit;
  return Number.isSafeInteger(limit) && limit > 0 && limit < stages.length
    ? stages.slice(0, limit)
    : stages;
}

module.exports = { activeStages };
