'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
const start=source.indexOf('_ctor.prototype._refreshStartBattleCaption = function'),end=source.indexOf('\n  };',start);
const body=source.slice(source.indexOf('function',start),end+4).trim().replace(/;$/,'');
function fixture(){
  class Node{constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.width=294;this.height=111;this.x=0;this.y=0;this.scale=1;}set parent(value){this._parent=value;value.children.push(this);}get parent(){return this._parent;}setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}setPosition(x,y){this.x=x;this.y=y;}setContentSize(w,h){this.width=w;this.height=h;}getComponent(){return this.fitter;}addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}}
  class Label{}Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={RESIZE_HEIGHT:3};class Outline{}
  const cc={Node,Label,LabelOutline:Outline,Color:{BLACK:'black'}},language={code:'en',getCurrentLanguage(){return this.code;},t(key,values){assert.equal(key,'format.battle.waveCompletionSilver');return '+'+values[0]+' silver on completion';}};
  const refresh=vm.runInNewContext('('+body+')',{cc,require(name){assert.equal(name,'LanguageMgr');return {LanguageMgr:{getInstance:()=>language}};}});
  const button=new Node('button');button.fitter={enabled:true,invalidate(){this.invalidated=true;}};for(let i=0;i<5;i++){const node=new Node('legacy-'+i);node.parent=button;}
  const game={coin:5,round:1,levelCfg:{WaveCfg:[{StartSliver:5},{StartSliver:7},{StartSliver:12}]}},ui={btnStartFight:button,ctrGame:{gameData:game}};
  return{ui,button,game,language,refresh:()=>refresh.call(ui)};
}
test('English separates the action from the real wave reward and leaves player data untouched',()=>{
  const f=fixture(),before=JSON.stringify(f.game);f.refresh();
  assert.equal(f.ui._completionReward.string,'+7 silver on completion');assert.equal(f.button.fitter.enabled,false);
  assert(f.button.children.slice(1,4).every(n=>!n.active));assert.equal(f.button.children[0].y,0);
  const label=f.ui._completionReward;assert(label.node.y+label.lineHeight*label.node.scale/2<-f.button.height/2,'Reward belongs below the button');
  assert.equal(JSON.stringify(f.game),before);
  f.game.round=2;f.refresh();assert.equal(f.ui._completionReward.string,'+12 silver on completion');assert.equal(f.button.children.length,6,'Reuse the reward label across waves');
});
test('Chinese retains its existing reward row and live switching restores the English footer',()=>{
  const f=fixture();f.refresh();f.language.code='zh';f.refresh();assert(f.button.children.slice(1,4).every(n=>n.active));assert.equal(f.ui._completionReward.node.active,false);assert.equal(f.button.fitter.enabled,true);assert(f.button.fitter.invalidated);
  f.language.code='en';f.refresh();assert.equal(f.ui._completionReward.node.active,true);assert.equal(f.button.fitter.enabled,false);
});
test('The final wave has no invented completion bonus',()=>{
  const f=fixture();f.game.round=f.game.levelCfg.WaveCfg.length;f.refresh();assert.equal(f.ui._completionReward.node.active,false);
  f.language.code='zh';f.refresh();assert.equal(f.button.children[2].active,false);assert.equal(f.button.children[3].active,false);
});
