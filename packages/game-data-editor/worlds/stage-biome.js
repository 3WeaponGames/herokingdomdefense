'use strict';
const {BIOMES}=require('./model');

// An explicit stage choice survives scenery edits. Older stages still inherit
// their map's biome, including when that shared map is changed and saved.
function value(config,map){
 if(config&&config.EnvironmentBiomeOverride===true){
  if(!BIOMES.includes(config.EnvironmentBiome))throw Error('Choose a valid stage biome.');
  return config.EnvironmentBiome;
 }
 return map.biome;
}
module.exports={value};
