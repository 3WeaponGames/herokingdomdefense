'use strict';
// Explicit recovery from maintained source artwork. Build a complete draft
// before publishing its palette entries; failed recovery never edits the map.
const fs=require('fs'),path=require('path'),url=require('url'),M=require('./model'),L=require('./legacy'),B=require('./baker');
function region(x,y){if(x<.20&&y<.66)return 'ravine';if(y>.715&&x<.48)return 'southwest';if(y>.74&&x>.5)return 'southeast';if(y>.625&&y<.75&&x>.52)return 'south-ridge';if(y>.515&&y<.75&&x<.52)return 'west-grove';if(x>.77&&y>.31)return 'east-lower';if(x>.77&&y>.12)return 'east-upper';if(x>.17&&x<.62&&y>.065&&y<.27)return 'island';return 'north';}
async function recover(service,request){
 service.expect(request.version);
 const doc=service.doc(request.key);
 if(doc.data.id!=='Map07'||doc.data.sourcePiecesRecovered)throw Error('Original Stage 7 pieces are already available, or this is another map.');
 if(JSON.stringify(doc.data)!==JSON.stringify(doc.original))throw Error('Save or discard this map draft before recovering its original pieces.');
 const file=path.join(service.root,'tools/maps/stage07/recipe.json'),recipeBytes=fs.readFileSync(file),recipe=JSON.parse(recipeBytes.toString('utf8').replace(/^\uFEFF/,'')),spec=M.clone(recipe),observed=new Map([[file,L.hash(recipeBytes)]]);
 spec.mode='stage07-source';spec.props=[];spec.thumbnail=null;
 for(const key of Object.keys(spec.images)){
  const source=path.resolve(path.dirname(file),spec.images[key]);
  observed.set(source,L.hash(fs.readFileSync(source)));spec.images[key]=url.pathToFileURL(source).href;
 }
 const result=await(service.options&&service.options.render||B.renderElectron)(spec,service.artifacts);
 service.expect(request.version);
 for(const [source,revision]of observed)if(!fs.existsSync(source)||L.hash(fs.readFileSync(source))!==revision)throw Error('Stage 7 source artwork changed during recovery. Retry after reviewing the source.');
 const map=M.clone(doc.data),sourceAssets={},owners={},assets=new Map(),library=service.index().library;
 map.legacyGround=null;map.ground.foundation.tiles=[];map.sourcePiecesRecovered=true;
 for(const owner of recipe.owners){
  const layer=map.layers.find(l=>l.objects.some(o=>o.legacy&&o.legacy.roots.includes(owner.id)));
  if(layer)owners[owner.key]={layer,object:layer.objects.find(o=>o.legacy&&o.legacy.roots.includes(owner.id))};
 }
 function assetFor(name,png,w,h,anchor,depth){
  const buffer=Buffer.from(png.slice(png.indexOf(',')+1),'base64'),sha256=L.hash(buffer),id='stage07-source-'+L.hash(JSON.stringify([sha256,w,h,anchor,depth])).slice(0,24),stagedFile=path.join(service.artifacts,'source-pieces',id+'.png');
  const asset={id,name,category:depth==='ground'?'field':'cliffs',biomes:['fire','lava'],file:'authoring/worlds/library/images/'+id+'.png',width:w,height:h,anchor,depth,sha256,stagedFile,url:url.pathToFileURL(stagedFile).href};
  if(!assets.has(id))assets.set(id,{asset,buffer});return asset;
 }
 for(const image of result.files){
  if(image.role==='ground'){
   const asset=assetFor('Stage 7 ground '+image.tile,image.png,image.width,image.height,{x:.5,y:.5},'ground'),column=(image.tile-1)%2,row=Math.floor((image.tile-1)/2);
   map.ground.foundation.tiles.push({id:'object-'+map.nextObject++,name:asset.name,assetId:asset.id,x:-recipe.width/2+(column+.5)*image.width,y:recipe.height/2-(row+.5)*image.height,scale:1,angle:0,flipX:false,depth:'ground',ground:{x:0,y:0}});
  }else if(image.role==='obstacle'){
   const entry=owners[image.key];if(!entry)throw Error('Original cliff layer was removed.');
   const old=entry.object,left=image.center.x-image.width/2,bottom=image.center.y-image.height/2,asset=assetFor('Stage 7 '+image.key+' cliffs',image.png,image.width,image.height,{x:(image.ground.x-left)/image.width,y:(image.ground.y-bottom)/image.height},'world'),origin=old.legacy.origin;
   const offset={x:image.ground.x-origin.x,y:image.ground.y-origin.y},position=M.toWorld(old,{x:old.flipX?-offset.x:offset.x,y:offset.y}),polygons=(old.polygons||[]).map(poly=>poly.map(p=>({x:p.x+origin.x-image.ground.x,y:p.y+origin.y-image.ground.y})));
   const object=Object.assign({},old,{name:asset.name,assetId:asset.id,x:position.x,y:position.y,ground:{x:(old.ground&&old.ground.x||0)-offset.x,y:(old.ground&&old.ground.y||0)-offset.y},polygons});
   delete object.legacy;delete object.ignoreLegacyColliders;
   entry.layer.objects=entry.layer.objects.map(o=>o===old?object:o);
  }
 }
 let detailLayer=map.layers.find(layer=>layer.id==='grass-detail');
 for(const prop of recipe.props){
  if(prop.layer==='ground'&&!detailLayer){Object.assign(map,M.createLayer(map,'Ground detail'));detailLayer=map.layers[map.layers.length-1];detailLayer.depth='ground';}
  let asset=sourceAssets[prop.image];
  if(!asset){
   const source=path.resolve(path.dirname(file),recipe.images[prop.image]),hash=L.hash(fs.readFileSync(source));
   asset=library.find(a=>a.sha256===hash);if(!asset)throw Error('Original prop is absent from the maintained palette: '+prop.image);sourceAssets[prop.image]=asset;
  }
  const entry=owners[prop.region||region(prop.x,prop.y)],layer=prop.layer==='ground'?detailLayer:entry&&entry.layer;
  if(!layer)throw Error('Original cliff layer was removed.');
  const point={x:prop.x*recipe.width-recipe.width/2,y:recipe.height/2-prop.y*recipe.height},old=prop.layer==='ground'?null:entry.object;
  let position=point;
  if(old){const local={x:point.x-old.legacy.origin.x,y:point.y-old.legacy.origin.y};position=M.toWorld(old,{x:old.flipX?-local.x:local.x,y:local.y});}
  layer.objects.push({id:'object-'+map.nextObject++,name:asset.name,assetId:asset.id,x:position.x,y:position.y,scale:(prop.height?prop.height/asset.height:prop.width/asset.width)*(old?old.scale:1),angle:old&&old.angle||0,flipX:!!prop.flip!==!!(old&&old.flipX),opacity:(prop.opacity===undefined?1:prop.opacity)*(old&&old.opacity!==undefined?old.opacity:1),depth:prop.layer==='ground'?'ground':'world',ground:{x:0,y:0}});
 }
 // Keep staged images in the service as well as the current palette so refresh
 // and another document's Save cannot strand the still-unsaved recovered map.
 for(const {asset,buffer}of assets.values()){
  fs.mkdirSync(path.dirname(asset.stagedFile),{recursive:true});
  if(!fs.existsSync(asset.stagedFile)||L.hash(fs.readFileSync(asset.stagedFile))!==asset.sha256)fs.writeFileSync(asset.stagedFile,buffer);
 }
 for(const {asset}of assets.values()){
  service.stagedAssets.set(asset.id,asset);
  if(!library.some(a=>a.id===asset.id))library.push(asset);
 }
 return service.change({key:doc.key,version:request.version,value:map});
}
module.exports={recover,region};
