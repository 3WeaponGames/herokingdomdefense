'use strict';
// Lighting presentation and asset lifetimes only. No engine, game, scene or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
function fixture(){
  function color(r,g,b,a=255){if(typeof r==='string'){const hex=r.replace('#','');return{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:255};}return{r,g,b,a};}
  class Node{
    constructor(name=''){Object.assign(this,{name,children:[],components:[],x:0,y:0,angle:0,scaleX:1,scaleY:1,active:true,opacity:255,group:'world',color:color(255,255,255)});}
    set parent(value){if(this._parent)this._parent.children=this._parent.children.filter(n=>n!==this);this._parent=value;if(value)value.children.push(this);}
    get parent(){return this._parent;}
    get activeInHierarchy(){return !this.destroyed&&this.active&&(!this.parent||this.parent.activeInHierarchy);}
    setPosition(x,y){this.x=x;this.y=y;}
    setContentSize(width,height){this.width=width;this.height=height;}
    setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
    setScale(x,y=x){this.scaleX=x;this.scaleY=y;}
    addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
    convertToWorldSpaceAR(p){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v={x:this.x+c*p.x*this.scaleX-s*p.y*this.scaleY,y:this.y+s*p.x*this.scaleX+c*p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(v):v;}
    destroy(){this.destroyed=true;this.children.forEach(c=>c.destroy());}
  }
  class Sprite{}Sprite.SizeMode={CUSTOM:0};
  class Graphics{constructor(){this.commands=[];}moveTo(x,y){this.commands.push(['move',x,y]);}lineTo(x,y){this.commands.push(['line',x,y]);}close(){this.commands.push(['close']);}fill(){this.commands.push(['fill']);}}
  const cc={Node,Sprite,Graphics,color,Color:{WHITE:color(255,255,255)},isValid:value=>!!value&&!value.destroyed};
  const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingLighting.js'),'utf8'),{cc,exports,require:name=>{if(name==='BuildingNightlight')return require('../../assets/_script/BuildingNightlight');throw Error(name);}},{filename:'BuildingLighting.js'});
  const node=new Node('Building'),presentation=new Node('Placement'),base=new Node('Base');presentation.parent=node;base.parent=presentation;base.setPosition(0,-38);base.width=187;base.height=230;
  const lighting=[{points:[{x:-6,y:20},{x:4,y:18},{x:4,y:34},{x:-6,y:36}],glow:true,authorField:'preserve'},
    {points:[{x:15,y:42},{x:22,y:45},{x:22,y:58},{x:15,y:55}],color:'#FFF2B1',opacity:210,glow:{x:18.5,y:50,width:32,height:42,pulse:.2}}];
  const state={node:base},requests=[],owner={node,enabled:true,isDestroyed:false,buildInfo:{cfg:{Appearance:{lighting,unknown:'preserve'}}},_buildingAppearance:state,
    loadSpriteFrame(bundle,file,done){requests.push({bundle,file,done});}};
  function frame(name='glow'){return{name,refs:1,adds:0,releases:0,addRef(){this.refs++;this.adds++;},decRef(){this.refs--;this.releases++;}};}
  function resolve(index=0,value=frame()){requests[index].done(value);return value;}
  return{api:exports,owner,state,node,base,presentation,lighting,requests,resolve,frame,cc,Node,Graphics};
}
function record(h){return h.state._buildingLighting;}
function step(h,dt){h.api.update(h.owner,h.state,dt);}
 test('lighting detaches all live frame consumers before releasing its retained reference',()=>{
  const h=fixture();h.api.apply(h.owner,h.state);const f=h.frame('shared');h.requests.forEach(r=>r.done(f));
  const sprites=Object.values(record(h).resources).flatMap(r=>r.sprites),release=f.decRef;f.decRef=function(){assert(sprites.every(s=>s.spriteFrame===null));return release.call(this);};
  h.api.dispose(h.owner,h.state);assert.equal(f.releases,1);
 });

test('native projected fans share one retained frame, keep authored transforms and use the existing phase lifecycle',()=>{
  const h=fixture(),appearance=JSON.parse(JSON.stringify(require('../../assets/KinghtFallConfig/GameJsonCfg.json').BuildEnum[2].levelList.find(row=>row.index===10).Appearance));
  appearance.lighting[0].glows[0].shearX=12;appearance.lighting[0].glows[0].shearY=-4;
  h.owner.buildInfo.cfg.Appearance=appearance;const before=JSON.stringify(appearance);
  h.api.apply(h.owner,h.state);const r=record(h),fans=r.entries.flatMap(entry=>entry.glows);
  assert.equal(r.entries.length,2,'upper lookout apertures and the open entry stay separately registered');assert.equal(fans.length,3);
  assert.equal(h.requests.length,1,'only the shared original light sprite is loaded; hidden custom masks allocate no sprite');
  const shared=h.frame('native fan');for(const request of h.requests)request.done(request.file==='buildings/lighting/native-window-ray'?shared:h.frame('core'));
  assert.equal(shared.adds,1);assert(fans.every(part=>part.sprite.spriteFrame===shared));
  assert.deepEqual([fans[0].node.angle,fans[0].node.skewX,fans[0].node.skewY],[-90,12,-4]);
  const transforms=fans.map(part=>[part.node.x,part.node.y,part.node.width,part.node.height,part.node.angle,part.node.skewX,part.node.skewY]);
  assert.equal(r.node.active,false);h.api.setNight(h.owner,true);step(h,.25);near(r.blend,.5);step(h,.25);
  const opacity=fans.map(part=>part.node.opacity);step(h,.6);assert(fans.some((part,index)=>part.node.opacity!==opacity[index]));
  assert.deepEqual(fans.map(part=>[part.node.x,part.node.y,part.node.width,part.node.height,part.node.angle,part.node.skewX,part.node.skewY]),transforms,'breathing allocates no new ray geometry or transform work');
  h.api.setNight(h.owner,false);assert.equal(r.node.active,false);h.api.setNight(h.owner,true);step(h,.5);h.api.hide(h.owner,h.state);h.api.apply(h.owner,h.state);step(h,.5);
  assert.equal(h.requests.length,1);assert.equal(JSON.stringify(appearance),before);h.api.dispose(h.owner,h.state);assert.equal(shared.releases,1);
});

test('invalid optional fan transforms fall back without repairing saved values',()=>{
  const h=fixture();h.lighting[0].glow={angle:NaN,shearX:Infinity,shearY:'2'};h.api.apply(h.owner,h.state);
  const fan=record(h).entries[0].glow;assert.deepEqual([fan.angle,fan.skewX,fan.skewY],[0,0,0]);assert(Number.isNaN(h.lighting[0].glow.angle));assert.equal(h.lighting[0].glow.shearX,Infinity);
});

test('exact sprite apertures share one mask without double filling and keep two lookout glows independently placed',()=>{
  const h=fixture(),mask='buildings/redesign/towers/archer-4-window-light';
  const light={sprite:mask,width:240,height:240,offsetX:0,offsetY:0,color:'#FFE89A',opacity:240,
    glows:[{x:-24,y:121,width:38,height:29,opacity:80},{x:22,y:123,width:40,height:30,opacity:70}]};
  h.owner.buildInfo.cfg.Appearance.lighting=[light];const before=JSON.stringify(light);
  h.api.apply(h.owner,h.state);const r=record(h),entry=r.entries[0];
  assert.equal(r.entries.length,1);assert.equal(entry.glows.length,2);
  assert.equal(entry.window.parent,r.node);assert.equal(entry.window.anchorX,.5);assert.equal(entry.window.anchorY,0);
  assert.deepEqual([entry.window.x,entry.window.y,entry.window.width,entry.window.height],[0,0,240,240]);
  assert.equal(entry.maskSprite.trim,false);assert.equal(entry.maskSprite.sizeMode,h.cc.Sprite.SizeMode.CUSTOM);
  assert.equal(h.requests.length,2,'one exact aperture resource plus one shared soft glow resource');
  const paneFrame=h.frame('apertures'),glowFrame=h.frame('two glows');
  for(const request of h.requests)request.done(request.file===mask?paneFrame:glowFrame);
  assert.equal(entry.maskSprite.spriteFrame,paneFrame);assert.equal(paneFrame.adds,1);
  entry.glows.forEach(p=>assert.equal(p.sprite.spriteFrame,glowFrame));assert.equal(glowFrame.adds,1);
  assert.equal(r.node.active,false,'async frame completion never lights daytime windows');
  h.api.setNight(h.owner,true);step(h,.5);assert.equal(r.node.active,true);
  assert.equal(entry.window.opacity,240);assert.deepEqual(Array.from(entry.glows,p=>[p.node.x,p.node.y]),[[-24,121],[22,123]]);
  h.api.hide(h.owner,h.state);h.api.apply(h.owner,h.state);step(h,.5);assert.equal(h.requests.length,2);
  assert.equal(JSON.stringify(light),before);h.api.dispose(h.owner,h.state);
  assert.equal(paneFrame.releases,1);assert.equal(glowFrame.releases,1);
});

test('a late exact mask from before death cannot replace repaired apertures and a failed mask retries without restarting the fade',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lighting=[{sprite:'buildings/redesign/towers/cannon-4-window-light',width:230,height:230}];
  h.api.setNight(h.owner,true);step(h,.2);const r=record(h),stale=h.requests[0],opacity=r.node.opacity;
  h.resolve(0,null);h.api.apply(h.owner,h.state);assert.equal(record(h),r);assert.equal(r.node.opacity,opacity);
  const old=h.requests[1];h.owner.isDestroyed=true;h.api.hide(h.owner,h.state);
  h.owner.isDestroyed=false;h.api.apply(h.owner,h.state);step(h,.5);
  const bad=h.frame('pre-death');stale.done(bad);old.done(bad);assert.equal(bad.adds,0);
  const good=h.resolve(2,h.frame('repair'));assert.equal(record(h).entries[0].maskSprite.spriteFrame,good);
  assert.equal(good.adds,1);assert.equal(record(h).node.active,true);
});

test('daytime creates exact warm aperture polygons under the base and caches one shared existing glow resource',()=>{
  const h=fixture(),before=JSON.stringify(h.owner.buildInfo.cfg);h.api.apply(h.owner,h.state);const r=record(h);assert.equal(r.node.parent,h.base);assert.equal(r.node.active,false);assert.equal(r.node.opacity,0);assert.equal(r.entries.length,2);assert.equal(h.requests.length,1);assert.equal(h.requests[0].bundle,'resources');assert.equal(h.requests[0].file,'ui/stage-stars/glow');
  const graphics=r.entries[0].window.components[0];assert.deepEqual(graphics.fillColor,h.cc.color('#FFE89A'));assert.deepEqual(graphics.commands,[['move',-6,20],['line',4,18],['line',4,34],['line',-6,36],['close'],['fill']]);assert.equal(r.entries[0].window.opacity,235);assert.equal(r.entries[1].window.opacity,210);assert.equal(r.entries[0].sprite.trim,false);assert.equal(r.entries[0].sprite.sizeMode,h.cc.Sprite.SizeMode.CUSTOM);assert(r.entries[0].glow.zIndex<r.entries[0].window.zIndex);
  const frame=h.resolve();assert.equal(frame.adds,1);assert.equal(frame.refs,2);r.entries.forEach(e=>assert.equal(e.sprite.spriteFrame,frame));assert.equal(r.node.active,false,'asset loading must not light the daytime tower');assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
});

test('night uses the original half-second fade, day settles instantly and idle lights breathe every two simulation seconds',()=>{
  const h=fixture(),archer=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/jt/jt.json'),'utf8'));assert.equal(archer.animations.Fade_in.slots.jt_1_1.color.at(-1).time,.5);assert.equal(archer.animations.idle_night.deform['jt-1'].jt_1_1.jt_1_1.at(-1).time,2);
  h.api.apply(h.owner,h.state);h.resolve();h.api.setNight(h.owner,true);const r=record(h);assert.equal(r.node.active,false);step(h,.25);near(r.blend,.5);assert.equal(r.node.opacity,128);assert.equal(r.node.active,true);step(h,.25);near(r.blend,1);assert.equal(r.node.opacity,255);
  step(h,.5);const minimum=r.entries[1].glow.opacity;step(h,1);const maximum=r.entries[1].glow.opacity;assert(maximum>minimum);step(h,2);assert.equal(r.entries[1].glow.opacity,maximum);assert.equal(r.entries[1].window.opacity,210,'only the glow breathes');
  h.api.setNight(h.owner,false);assert.equal(r.blend,0);assert.equal(r.node.opacity,0);assert.equal(r.node.active,false,'planning must not require another simulation update to remove night lighting');
});

test('repeated appearance refreshes preserve fading progress, nodes, cached frames and asset reference counts',()=>{
  const h=fixture();h.api.setNight(h.owner,true);h.resolve();step(h,.2);const r=record(h),opacity=r.node.opacity,node=r.node,frame=r.entries[0].sprite.spriteFrame;
  for(let i=0;i<30;i++){h.api.apply(h.owner,h.state);step(h,0);assert.equal(record(h),r);assert.equal(r.node,node);assert.equal(r.node.opacity,opacity);near(r.fadeElapsed,.2);}
  assert.equal(h.requests.length,1);assert.equal(frame.adds,1);assert.equal(frame.releases,0);h.requests[0].done(frame);assert.equal(frame.adds,1,'duplicate loader callbacks must not retain twice');
  h.api.hide(h.owner,h.state);assert.equal(r.node.active,false);assert.equal(frame.refs,2,'a loaded light can be reused after repair');h.api.apply(h.owner,h.state);step(h,.5);assert.equal(r.node.active,true);assert.equal(h.requests.length,1);h.api.dispose(h.owner,h.state);assert.equal(frame.adds,1);assert.equal(frame.releases,1);assert.equal(frame.refs,1,'only the module-owned reference is released');assert.equal(r.node.destroyed,true);assert.equal(record(h),null);
});

test('loading before base artwork is ready remembers night without creating nodes or gameplay writes',()=>{
  const h=fixture(),before=JSON.stringify(h.owner.buildInfo.cfg);h.base.active=false;h.api.setNight(h.owner,true);assert.equal(record(h),undefined);assert.equal(h.requests.length,0);h.base.active=true;h.api.apply(h.owner,h.state);step(h,.5);assert.equal(record(h).node.active,true);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
});

for(const action of ['hide','death','dispose','disable','scene'])test(action+' prevents late glow callbacks from reviving lighting or retaining an unused asset',()=>{
  const h=fixture();h.api.setNight(h.owner,true);step(h,.5);const r=record(h),stale=h.requests[0],frame=h.frame('late');
  if(action==='death'){h.owner.isDestroyed=true;h.api.hide(h.owner,h.state);}else if(action==='disable'){h.owner.enabled=false;step(h,.1);}else if(action==='scene'){h.owner.node.active=false;step(h,.1);}else h.api[action](h.owner,h.state);
  stale.done(frame);assert.equal(frame.adds,0);assert.equal(frame.releases,0);assert.equal(r.node.active,false);assert.equal(r.blend,0);if(action==='dispose')assert.equal(record(h),null);
});

test('repair retries an invalidated pending glow load and stale pre-death results cannot replace it',()=>{
  const h=fixture();h.api.setNight(h.owner,true);const old=h.requests[0],stale=h.frame('before death');h.owner.isDestroyed=true;h.api.hide(h.owner,h.state);h.owner.isDestroyed=false;h.api.apply(h.owner,h.state);assert.equal(h.requests.length,2);step(h,.5);old.done(stale);assert.equal(stale.adds,0);const current=h.resolve(1,h.frame('repaired'));record(h).entries.forEach(e=>assert.equal(e.sprite.spriteFrame,current));assert.equal(current.adds,1);assert.equal(record(h).node.active,true);
});

test('the real disable hook cancels a pending light load without a tick and re-enable retries from update alone',()=>{
  const h=fixture(),calls=[];h.api.setNight(h.owner,true);step(h,.2);const r=record(h),stale=h.requests[0],late=h.frame('disabled result');assert.equal(r.node.active,true);
  Object.assign(h.owner,{cancelUpgrade(){calls.push('upgrade');},_stopColliderTweens(){calls.push('colliders');}});
  const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildBase.js'),'utf8').replace(/\r\n/g,'\n'),at=source.indexOf('_ctor.prototype.onDisable = function '),fn=source.slice(source.indexOf('function ',at),source.indexOf('\n  };',at)+4);
  const onDisable=vm.runInNewContext('('+fn+')',{require:name=>name==='BuildingLighting'?h.api:{cancelPlacement(){calls.push('placement');}},cc:h.cc,t:{prototype:{onDisable(){calls.push('parent');}}}});
  h.owner.enabled=false;onDisable.call(h.owner);assert.deepEqual(calls,['upgrade','placement','colliders','parent']);assert.equal(r.node.active,false);assert.equal(r.blend,0);stale.done(late);assert.equal(late.adds,0);
  h.owner.enabled=true;step(h,.25);assert.equal(h.requests.length,2,'update re-enters the phase and retries the invalidated request without a map refresh');const current=h.resolve(1,h.frame('enabled result'));assert.equal(current.adds,1);step(h,.25);assert.equal(r.blend,1);assert.equal(r.node.active,true);stale.done(late);assert.equal(late.adds,0);r.entries.forEach(entry=>assert.equal(entry.sprite.spriteFrame,current));
});

test('layout replacement rejects stale revisions, releases the old cache once, and leaves saved config untouched',()=>{
  const h=fixture();h.api.setNight(h.owner,true);const old=record(h),stale=h.frame('old revision');h.lighting[0].points[0].x=-10;h.requests[0].done(stale);assert.equal(stale.adds,0,'a changed authoring revision is rejected even before apply');h.api.apply(h.owner,h.state);assert.notEqual(record(h),old);assert.equal(old.node.destroyed,true);const frame=h.resolve(1);assert.equal(frame.adds,1);const before=JSON.stringify(h.owner.buildInfo.cfg);h.lighting[0].color='#FFCC88';const changed=JSON.stringify(h.owner.buildInfo.cfg);h.api.apply(h.owner,h.state);assert.equal(frame.releases,1);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),changed);assert.notEqual(changed,before);
  const replacement=h.resolve(2);h.owner.buildInfo.cfg.Appearance.lighting=[];h.api.apply(h.owner,h.state);assert.equal(replacement.releases,1);assert.equal(record(h),null);
});

test('a failed optional glow retries without rebuilding windows or restarting the fade',()=>{
  const h=fixture();h.api.setNight(h.owner,true);step(h,.2);const r=record(h),opacity=r.node.opacity;h.resolve(0,null);assert.equal(r.node.active,true,'the polygon aperture remains visible without the optional glow');h.api.apply(h.owner,h.state);assert.equal(record(h),r);assert.equal(r.node.opacity,opacity);assert.equal(h.requests.length,2);h.resolve(1);assert.equal(r.entries[0].sprite.spriteFrame.adds,1);
});

test('window and glow geometry follows only the base and placement transforms, leaving the building untouched',()=>{
  const h=fixture(),ownerPose={x:h.node.x,y:h.node.y,angle:h.node.angle,scaleX:h.node.scaleX,scaleY:h.node.scaleY},before=JSON.stringify(h.lighting);h.api.setNight(h.owner,true);step(h,.5);const r=record(h),entry=r.entries[0],local={x:entry.glow.x,y:entry.glow.y};
  for(const pose of [{x:-2.6,y:271,scaleX:.3,scaleY:.4},{x:0,y:-18,scaleX:1.094,scaleY:.78},{x:0,y:0,scaleX:1,scaleY:1}]){h.presentation.setPosition(pose.x,pose.y);h.presentation.setScale(pose.scaleX,pose.scaleY);const actual=entry.glow.convertToWorldSpaceAR({x:0,y:0}),expected=h.base.convertToWorldSpaceAR(local);near(actual.x,expected.x);near(actual.y,expected.y);assert.equal(r.node.parent,h.base);}
  assert.deepEqual({x:h.node.x,y:h.node.y,angle:h.node.angle,scaleX:h.node.scaleX,scaleY:h.node.scaleY},ownerPose);assert.equal(JSON.stringify(h.lighting),before);
});

test('optional night tint fades base and weapon, stays fixed while glows breathe and restores their exact day colors',()=>{
  const h=fixture(),day=h.cc.color(240,230,220,200),weaponDay=h.cc.color(210,225,245,180),weapon=h.state.weaponNode=new h.Node('Weapon');weapon.parent=h.presentation;weapon.color=weaponDay;h.base.color=day;h.owner.buildInfo.cfg.Appearance.nightTint='#A7A7A7';h.api.apply(h.owner,h.state);h.api.setNight(h.owner,true);step(h,.25);assert.deepEqual(h.base.color,h.cc.color(204,199,194,200));assert.deepEqual(weapon.color,h.cc.color(189,196,206,180));step(h,.25);assert.deepEqual(h.base.color,h.cc.color(167,167,167,200));assert.deepEqual(weapon.color,h.cc.color(167,167,167,180));
  for(const dt of [.25,.5,1,2]){step(h,dt);assert.deepEqual(h.base.color,h.cc.color(167,167,167,200));assert.deepEqual(weapon.color,h.cc.color(167,167,167,180));}assert.deepEqual(record(h).entries[0].window.components[0].fillColor,h.cc.color('#FFE89A'),'lit panes keep their warm color');
  h.base.color=weapon.color=h.cc.Color.WHITE;h.api.apply(h.owner,h.state);assert.deepEqual(h.base.color,h.cc.color(167,167,167,200),'a generic appearance refresh cannot erase the night tint');assert.deepEqual(weapon.color,h.cc.color(167,167,167,180));h.api.setNight(h.owner,false);assert.deepEqual(h.base.color,day,'planning restores tint without relying on a tower tick');assert.deepEqual(weapon.color,weaponDay);
  h.api.setNight(h.owner,true);step(h,.2);h.api.hide(h.owner,h.state);assert.deepEqual(h.base.color,day);assert.deepEqual(weapon.color,weaponDay);h.api.apply(h.owner,h.state);step(h,.5);h.api.dispose(h.owner,h.state);assert.deepEqual(h.base.color,day);assert.deepEqual(weapon.color,weaponDay);
});

test('tint-only legacy presentation needs no weapon or light textures and accepts the authored hex without a hash',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lighting=[];h.owner.buildInfo.cfg.Appearance.nightTint='A7A7A7';h.api.setNight(h.owner,true);step(h,.5);assert.deepEqual(h.base.color,h.cc.color(167,167,167));assert.equal(h.requests.length,0);assert.equal(record(h).entries.length,0);h.api.setNight(h.owner,false);assert.deepEqual(h.base.color,h.cc.Color.WHITE);
});

test('legacy art, malformed apertures and invalid time values remain safe and no authoring data is repaired',()=>{
  const h=fixture();delete h.owner.buildInfo.cfg.Appearance.lighting;h.api.setNight(h.owner,true);step(h,1);assert.equal(record(h),undefined);assert.equal(h.requests.length,0);h.owner.buildInfo.cfg.Appearance.lighting=[null,{points:[{x:0,y:0},{x:1,y:0}]},{points:[{x:0,y:NaN},{x:1,y:0},{x:1,y:1}]}];h.api.apply(h.owner,h.state);assert.equal(record(h),undefined);assert(Number.isNaN(h.owner.buildInfo.cfg.Appearance.lighting[2].points[0].y));
  h.owner.buildInfo.cfg.Appearance.lighting=h.lighting;h.api.apply(h.owner,h.state);const r=record(h);for(const dt of [-1,NaN,Infinity,undefined]){step(h,dt);assert.equal(r.blend,0);}step(h,.5);step(h,Number.MAX_VALUE);step(h,Number.MAX_VALUE);assert(Number.isFinite(r.entries[0].glow.opacity));assert(r.entries[0].glow.opacity>=0&&r.entries[0].glow.opacity<=100);
});

test('the real Base.setLight hook retains existing Spine day/night animations and passes only transient presentation state',()=>{
  const h=fixture(),calls=[];Object.assign(h.owner,{buildCfg:{enumValue:2},ndLockList:[],canLock:true,index:1,ndAniMain:{setAnimation(...args){calls.push(['set',...args]);},addAnimation(...args){calls.push(['add',...args]);}},ndAniOther:[]});
  const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildBase.js'),'utf8').replace(/\r\n/g,'\n'),at=source.indexOf('_ctor.prototype.setLight = function '),fn=source.slice(source.indexOf('function ',at),source.indexOf('\n  };',at)+4);
  const setLight=vm.runInNewContext('('+fn+')',{require:name=>name==='BuildingLighting'?h.api:{apply:owner=>h.api.apply(owner,h.state)},$z1KinghtFallEnum:{KinghtFallEnumBuildEnum:{None:0}},r:{fade_in:'Fade_in',idle_night:'idle_night',idle:'idle'}}),before=JSON.stringify(h.owner.buildInfo.cfg);
  setLight.call(h.owner,true);assert.equal(h.owner._buildingNight,true);assert.deepEqual(calls,[['set',0,'Fade_in',false],['add',0,'idle_night',true]]);step(h,.2);const blend=record(h).blend;h.api.apply(h.owner,h.state);assert.equal(record(h).blend,blend);setLight.call(h.owner,false);assert.equal(h.owner._buildingNight,false);assert.deepEqual(calls.at(-1),['set',0,'idle',true]);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
});
