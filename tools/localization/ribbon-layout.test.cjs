'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(ribbon,sibling,frameName){
  class Label{}class RichText{}class Sprite{}Label.Overflow={NONE:0,RESIZE_HEIGHT:3};Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};const cc={Component:function(){},Label,RichText,Sprite,Layout:function(){},Node:{EventType:{}},isValid:()=>true};let definition;cc.Class=value=>definition=value;
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/PaddedTextBackground.js'),'utf8'),{cc});
  const parent={},background={x:25,y:350,width:435,height:89,scaleX:1,scaleY:1,parent,getComponent:Type=>Type===Sprite?{spriteFrame:{name:frameName,insetLeft:57,insetRight:57}}:null,setContentSize(w,h){this.width=w;this.height=h;}};
  const label=new Label(),content={active:true,activeInHierarchy:true,x:0,y:0,scaleX:.5,scaleY:.5,anchorX:.5,anchorY:.5,width:300,height:100,parent:sibling?parent:background,children:[],on(){},off(){},getComponent:Type=>Type===Label?label:null,setPosition(x,y){this.x=x;this.y=y;}};label.node=content;label.string='Get Energy';label.fontSize=76;label.lineHeight=88;label._forceUpdateRenderData=()=>{};
  const panel=Object.assign({node:background,content:[content],paddingX:40,paddingY:10,gap:8,minWidth:0,minHeight:89,maxWidth:700,reflowRows:true,ribbonTitle:ribbon,ribbonCenterY:.12},definition);panel.onLoad();panel.fit();return{panel,background,content,label};
}
test('ribbon fitting reserves the folded tails and centers the heading on the raised front face',()=>{
  const f=fixture(true,false);assert.equal(f.background.width,344);assert.equal(f.content.x,0);assert.equal(f.content.y,89*.12);assert.equal(f.content.width*f.content.scaleX+80,f.background.width-114);
  f.content.width=500;f.label.string='Playtime Rewards';f.panel.fit();assert.equal(f.background.width,444);assert.equal(f.content.y,89*.12,'Repeated fitting does not accumulate vertical offsets');
});
test('sibling stage titles stay aligned to their ribbon while ordinary text panels keep their original geometry',()=>{
  const stage=fixture(true,true);assert.equal(stage.content.x,25);assert.equal(stage.content.y,350+89*.12);const ordinary=fixture(false,false);assert.equal(ordinary.background.width,230);assert.equal(ordinary.content.y,0);
});
test('Battle Pass arrow banners retain room for their captions with older serialized panel defaults',()=>{
  for(const name of ['wg_txz_ptd','wg_txz_gjd']){const f=fixture(false,false,name);assert.equal(f.background.width,369);assert.equal(f.background.height,112);assert.equal(f.content.y,112*.18);}
  const level=fixture(false,false,'wg_txz_djbtd');assert.equal(level.background.height,128);assert.equal(level.background.width,230,'A pointed badge has no folded side tails');
});
