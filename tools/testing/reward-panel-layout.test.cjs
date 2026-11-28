'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
test('Playtime hint uses two authored lines inside its fixed panel bounds in both languages',()=>{
 const p=read('assets/KinghtFallPrefabs/homePop/KinghtFallUIOnlineReward.prefab'),c=read('assets/resources/localization/catalog.json'),key='ui.layout.kinghtfalluionlinereward.21';
 for(const language of ['en','zh']){const s=c.labelStyles[key][language];assert.equal(c.entries[key][language].split('\n').length,2);assert.equal(s.overflow,'CLAMP');assert(s.lineHeight*2<=s.height);assert(p[20]._trs.array[0]+s.width*.25<p[6]._contentSize.width/2-24);}
});
test('Battle Pass uses live display-font lettering and reward headers meet the Level tab without overlap',()=>{
 const p=read('assets/KinghtFallPrefabs/homePop/KinghtFallUIPassport.prefab'),c=read('assets/resources/localization/catalog.json'),title=p.find(n=>n._name==='BattlePassTitle');
 assert(title);assert.equal(title._trs.array[7],1);assert.equal(p[title._components[0].__id__].__type__,'cc.Label');assert.equal(c.labelStyles['art.pass.title'].en.fontRole,'display');
 assert.equal(p[3]._spriteFrame.__uuid__,'2ff78d2a-bf70-4448-985b-337eb8ff2d71');
 const left=p[73],right=p[82],level=p[91],half=level._contentSize.width/2;
 assert.equal(left._trs.array[0]+left._contentSize.width/2,-half);assert.equal(right._trs.array[0]-right._contentSize.width/2,half);
 assert.equal(left._contentSize.width+right._contentSize.width+level._contentSize.width,p[65]._contentSize.width);
 for(const i of [151,152]){assert.equal(p[i].minWidth,298);assert.equal(p[i].maxWidth,298);assert.equal(p[i].ribbonCenterY,.08);}
});
test('the Battle Pass fits the equipped hero in the banner and releases the preview when hidden',()=>{
 const prefab=read('assets/KinghtFallPrefabs/homePop/KinghtFallUIPassport.prefab');
 const controller=prefab.find(row=>row.ndHeroPreview),hero=prefab[controller.ndHeroPreview.__id__],banner=prefab[hero._parent.__id__];
 const title=prefab[banner._children[0].__id__],progress=prefab[controller.ndTop.__id__];
 assert.equal(title._name,'BattlePassRibbon');
 const relics=read('assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeTreasureCtrl.prefab');
 assert.deepEqual(prefab[title._components[0].__id__]._spriteFrame,relics[relics[3]._components[0].__id__]._spriteFrame);
 const label=prefab[title._children[0].__id__];
 assert.equal(label._name,'BattlePassTitle');
 const catalog=read('assets/resources/localization/catalog.json');
 for(const language of ['en','zh']){
  const reference=catalog.labelStyles['ui.layout.kinghtfallhometreasurectrl.5'][language];
  assert.equal(catalog.labelStyles['art.pass.title'][language].fontSize,Math.round(reference.fontSize*relics[4]._trs.array[7]));
 }
 assert(banner._children.some(child=>child.__id__===controller.ndHeroPreview.__id__));
 assert(hero._trs.array[0]-hero._contentSize.width/2>title._trs.array[0]+title._contentSize.width/2);
 assert(banner._trs.array[1]+hero._trs.array[1]-hero._contentSize.height/2-5>progress._trs.array[1]+progress._contentSize.height/2);

 function Base(){}
 const previews=[],loads=[];
 const equipment=style=>({getHeroWeapon:()=>({id:style})});
 let user=equipment('mystic');
 const modules={
  BaseUI:{default:Base},
  KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},
  HeroStylePreview:{create(parent,loadout){
   const preview={parent,loadout,styles:[],setStyle(style){this.styles.push(style);},destroy(){this.destroyed=true;}};
   previews.push(preview);return preview;
  }},
  HeroItemLooks:{whenReady(refresh){const request={refresh};loads.push(request);return ()=>{request.cancelled=true;};}}
 };
 const context={exports:{},require:name=>modules[name]||{},cc:{Node:function(){},_decorator:{ccclass:x=>x,property:()=>()=>{}}},
  __extends:(C,B)=>Object.setPrototypeOf(C.prototype,B.prototype),__decorate:(d,t)=>t};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIPassport.js'),'utf8'),context);
 const pass=new context.exports.default();
 pass.ndHeroPreview=hero;
 pass.onEnable();pass.onEnable();
 assert.equal(previews.length,1);
 assert.equal(previews[0].parent,hero);
 assert.equal(previews[0].loadout,user);
 assert.deepEqual(previews[0].styles,['mystic']);
 loads[0].refresh();
 assert.deepEqual(previews[0].styles,['mystic','mystic']);
 pass.onDisable();
 assert(previews[0].destroyed && loads[0].cancelled);
 user=equipment('guardian');
 pass.onEnable();loads[0].refresh();
 assert.equal(previews[1].loadout,user);
 assert.deepEqual(previews[1].styles,['guardian']);
 assert.deepEqual(previews[0].styles,['mystic','mystic']);
 pass.onDisable();
});
test('recycled achievement rows expand text without a button and reserve its actual bounds when claim/claimed is visible',()=>{
 function Base(){}const context={exports:{},require:name=>name==='BaseUI'?{default:Base}:{},cc:{Node:function(){},_decorator:{ccclass:x=>x,property:()=>()=>{}}},__extends:(C,B)=>Object.setPrototypeOf(C.prototype,B.prototype),__decorate:(d,t)=>t};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIAchievement.js'),'utf8'),context);
 const label={},description={x:-148,scaleX:.5,getComponent:()=>label},claim={active:false,x:195.497,width:138,anchorX:.5,scaleX:1},claimed={...claim,active:true},finish={active:false,x:0,scaleX:1,getChildByName:n=>n==='btnGet'?claim:claimed},row={width:564,anchorX:.5,getChildByName:n=>n==='labInfo'?description:finish};
 const layout=context.exports.default.prototype.layoutDescription;layout(row);assert.equal(label.maxWidth,828);
 finish.active=claim.active=true;layout(row);assert(Math.abs(label.maxWidth-516.994)<.001);const narrow=label.maxWidth;
 claim.active=false;layout(row);assert.equal(label.maxWidth,narrow);finish.active=false;layout(row);assert.equal(label.maxWidth,828);assert.equal(description.x,-148);
});
