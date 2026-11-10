'use strict';
// Library classification only: never rewrites imported records or map data.
const terrainRole=asset=>!asset?null:asset.terrainRole||(asset.category==='field'?'field':asset.category==='roads'?(/^road\s+up\s+/i.test(asset.terrainName||asset.name||'')?'edge':/^road\s+/i.test(asset.terrainName||asset.name||'')?'road':null):null);
const groundAsset=asset=>!!asset&&!asset.paletteHidden&&(['field','road','edge'].includes(terrainRole(asset))||asset.brush==='shadow');
const objectAsset=asset=>!!asset&&!asset.paletteHidden&&!asset.brush&&!['field','roads'].includes(asset.category);
const inPalette=(asset,tab,biome)=>(tab==='Ground'?groundAsset(asset):objectAsset(asset))&&!(asset.paletteHiddenBiomes||[]).includes(biome);
const sortPalette=assets=>assets.slice().sort((a,b)=>Number(a.paletteLast===true)-Number(b.paletteLast===true));
const isRoad=asset=>!!asset&&['road','edge'].includes(terrainRole(asset));
const roadSurface=asset=>terrainRole(asset)==='road';
function roadPair(asset,library,context){
 if(!asset||!['roads','field'].includes(asset.category))return null;
 const suffix=(asset.terrainName||asset.name||'').replace(/^(?:road(?:\s+up)?|field)\s+/i,'').toLowerCase(),biomes=asset.biomes||[];
 // Snow and Ice share an edge and field. The current authoring biome chooses
 // their fill, while an explicitly chosen Road fill always keeps its identity.
 const contextual=!roadSurface(asset)&&biomes.length>1&&biomes.includes(context);
 const matches=a=>biomes.some(b=>(a.biomes||[]).includes(b));
 const choose=test=>{
  const candidates=contextual?library.filter(a=>(a.biomes||[]).includes(context)):library;
  return candidates.find(a=>test(a)&&(a.terrainName||a.name||'').toLowerCase().endsWith(' '+suffix))||candidates.find(a=>test(a)&&matches(a));
 };
 const surface=roadSurface(asset)?asset:choose(roadSurface);
 const edge=choose(a=>terrainRole(a)==='edge');
 const field=choose(a=>a.category==='field');
 return surface&&edge?{surface,edge,field}:null;
}
function roadDefaults(asset,library,context){
 const pair=roadPair(asset,library,context);if(!pair)return null;
 const biomes=pair.surface.biomes||[],biome=biomes.includes(context)?context:biomes[0]||(pair.edge.biomes||[])[0];
 const height=Number.isFinite(pair.edge.height)?pair.edge.height:2;
 const edgeScale=biome==='lava'?.75:1;
 const defaults={biome,width:Math.ceil((90+2*Math.max(1,height-2)*edgeScale)/5)*5,edgeScale,edgeSmoothing:.6,edgeStyle:'textured'};
 if(biome==='lava')defaults.edgeExterior='cutout';
 return defaults;
}
function strokeAssets(stroke){return stroke.op==='erase'?[]:[stroke.assetId,stroke.mode==='road'&&stroke.edgeAssetId].filter(Boolean);}
module.exports={terrainRole,groundAsset,objectAsset,inPalette,sortPalette,isRoad,roadPair,roadDefaults,strokeAssets};
