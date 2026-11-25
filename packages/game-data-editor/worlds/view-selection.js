'use strict';

function documentKey(catalog, kind, selection = {}, explicitMapId) {
  const stages = catalog.stages || [];
  const firstStage = stages.find(stage => stage.id === 'A-1') || stages[0];
  const previousStage = stages.find(stage => stage.id === selection.stageId);
  if (kind === 'stages') {
    const matchingStage = previousStage?.mapId === selection.mapId ? previousStage :
      stages.find(stage => stage.mapId === selection.mapId);
    return 'stage:' + (matchingStage || previousStage || firstStage || {id: 'A-1'}).id;
  }

  const maps = catalog.maps || [];
  const chosenMap = [explicitMapId, selection.mapId, previousStage?.mapId, firstStage?.mapId]
    .map(id => maps.find(map => map.id === id)).find(Boolean) || maps[0];
  if (!chosenMap) throw Error('No maps are available. Refresh the map list.');
  return 'map:' + chosenMap.id;
}

module.exports = {documentKey};
