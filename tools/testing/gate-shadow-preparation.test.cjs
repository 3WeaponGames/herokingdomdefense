'use strict';
// Exercise the production stage pose builder with Creator's real Spine parser.
// Only renderers are constructed: no gameplay scripts, scenes, audio or writes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),runtime=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js'),options={skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},Maps=require('../../packages/game-data-editor/lib/map-assets'),Kit=require('../../assets/_script/WallKit'),Facing=require('../../assets/_script/GateFacing'),Adjust=require('../../assets/_script/WallAdjustments');
test('stage shadow poses match displayed gate geometry for all four facings, both opening directions, tiers and end poses',options,()=>{
 const spine=require(runtime);
 class Node{
  constructor(){this.x=this.y=this.angle=0;this.scaleX=this.scaleY=1;this.group='world';}
  setPosition(x,y){this.x=x;this.y=y;}
  world(){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),m=[c*this.scaleX,s*this.scaleX,-s*this.scaleY,c*this.scaleY,this.x,this.y];return this.parent?Maps.multiply(this.parent.world(),m):m;}
  convertToWorldSpaceAR(p){return Maps.point(this.world(),p);}
  convertToNodeSpaceAR(p){return Maps.point(Maps.inverse(this.world()),p);}
  addComponent(Type){const r=new Type();r.node=this;return r;}
  destroy(){this.destroyed=true;}
 }
 class Data{destroy(){this.destroyed=true;}}
 function parsed(data){const atlas=new spine.TextureAtlas(data.atlasText,name=>({setFilters(){},setWraps(){},getImage:()=>data.textures[data.textureNames.indexOf(name)]}));return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(data.skeletonJson);}
 class Skeleton{
  constructor(){this.timeScale=1;this.paused=false;}
  set skeletonData(data){this.source=data;this.data=parsed(data);this._skeleton=new spine.Skeleton(this.data);this.state=new spine.AnimationState(new spine.AnimationStateData(this.data));}
  get skeletonData(){return this.source;}
  setAnimationCacheMode(){}
  setSkin(name){this._skeleton.setSkinByName(name);}
  setToSetupPose(){this._skeleton.setToSetupPose();}
  findAnimation(name){return this.data.findAnimation(name);}
  setAnimation(track,name,loop){return this.state.setAnimation(track,name,loop);}
  getCurrent(){return this.state.getCurrent(0);}
  update(dt){if(this.paused)return;this.state.update(dt*this.timeScale);this.state.apply(this._skeleton);this._skeleton.updateWorldTransform();}
 }
 Skeleton.AnimationCacheMode={REALTIME:0};
 function asset(name){const file=path.join(root,'assets/KinghtFallIconMap/com/Ani/cq',name,name+'.json'),data=new Data();data.skeletonJson=JSON.parse(fs.readFileSync(file,'utf8'));data.atlasText=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8');data.textureNames=data.atlasText.split(/\r?\n/).filter(s=>/^[^\s]+\.png$/.test(s));data.textures=data.textureNames.map(name=>{const bytes=fs.readFileSync(path.join(path.dirname(file),name));return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};});data._uuid=name;return data;}
 const main=asset('cq1'),down=asset('cq2'),before=JSON.stringify(main.skeletonJson),exports={},modules={BuildingDropShadow:require('../../assets/_script/BuildingDropShadow'),BuildingDropShadowRuntime:{},BuildingShadowRuntime:{},BuildingWorldScale:require('../../assets/_script/BuildingWorldScale'),WallKit:Kit,WallAdjustments:Adjust,GateFacing:Facing,BuildingPartScale:require('../../assets/_script/BuildingPartScale')};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingShadowPreparation.js'),'utf8')+'\nexports.probeForTest=probe;',{exports,cc:{Node,v2:(x,y)=>({x,y})},sp:{Skeleton,SkeletonData:Data},require:name=>{assert(modules[name],name);return modules[name];}});
 const stamps=new Set();let cases=0;
 function vertices(r){const points={};for(const slot of r._skeleton.slots){if(!/^rts_wall_(?:part_\d+|leaf_(?:pair|near|far))$/.test(slot.data.name))continue;const a=slot.getAttachment();if(!a)continue;const v=[];a.computeWorldVertices(slot.bone,v,0,2);points[slot.data.name]=[];for(let i=0;i<v.length;i+=2)points[slot.data.name].push(r.node.convertToWorldSpaceAR({x:v[i],y:v[i+1]}));}return points;}
 for(const face of ['NE','NW','SE','SW'])for(const opening of ['inward','outward'])for(const tier of [1,2,3])for(const open of [false,true]){
  const node=new Node(),mainNode=new Node(),downNode=new Node();node.scaleX=Facing.mirrorX(face)?-1:1;node.angle=17;mainNode.parent=downNode.parent=node;
  const template={node,ID:17,ndAniMain:{node:mainNode,skeletonData:main},ndAniDown:{node:downNode,skeletonData:down},ndAniOther:[],wallFacing:face,wallOpening:opening,wallRotation:17,wallRun:JSON.stringify(Kit.nativeRun({left:2,right:2,gate:true,start:'post',end:'post'}))},row={ID:6,index:tier,level:tier,Skin:'cq-rts-'+tier,WorldScale:1.2},prepared=exports.probeForTest(template,row,new Node(),{},open),actual=prepared.ndAniOther[0];
  const layout=actual.skeletonData.skeletonJson.wallKit.layout;let json=Kit.install(main.skeletonJson,layout,undefined,{mirrorX:Facing.mirrorX(face),tier,face,adjustmentsData:Adjust.getData()});if(Facing.reverse(face))json=Facing.mirrorJson(json);
  const reference=new Skeleton();reference.node=new Node();reference.node.parent=new Node();reference.node.parent.scaleX=node.scaleX*row.WorldScale;reference.node.parent.scaleY=row.WorldScale;reference.node.parent.angle=node.angle;reference.skeletonData={...main,skeletonJson:json};reference.setSkin(row.Skin);reference.setToSetupPose();const animation=open?Facing.animation(json,'open',opening,false):'idle',track=reference.setAnimation(0,animation,false);track.trackTime=reference.findAnimation(animation).duration;reference.update(0);
  assert.equal(actual.getCurrent().animation.name,animation,face+' '+opening+' tier '+tier+' pose '+open);assert.equal(actual.skeletonData.skeletonJson.wallDoor.reverse,Facing.reverse(face));const a=vertices(actual),b=vertices(reference);assert.deepEqual(Object.keys(a),Object.keys(b));for(const name of Object.keys(a))for(let i=0;i<a[name].length;i++){assert(Math.abs(a[name][i].x-b[name][i].x)<1e-5,name+' X matches displayed '+face);assert(Math.abs(a[name][i].y-b[name][i].y)<1e-5,name+' Y matches displayed '+face);}
  if(tier===1&&!open)stamps.add(exports.stamp(row,{},template));prepared.node.destroy();prepared.clones.forEach(d=>d.destroy());cases++;
 }
 assert.equal(cases,48);assert.equal(stamps.size,8,'all facing/opening settings own separate cache identities');assert.equal(JSON.stringify(main.skeletonJson),before);
});
