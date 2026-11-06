'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/LanguageMgr.js'),'utf8');
function fixture(){
  const requests=[],warnings=[];
  class Frame{constructor(uuid,width=171,height=100){this._uuid=uuid;this.width=width;this.height=height;}}
  class Sprite{
    constructor(){this.node={width:240,height:140,x:-85,y:125,scaleX:1.2,scaleY:0.9,angle:-14,anchorX:0.25,anchorY:0.8,setContentSize(w,h){this.width=w;this.height=h;}};this._frame=null;this.destroyCalls=0;}
    get spriteFrame(){return this._frame;}
    set spriteFrame(frame){this._frame=frame;this.node.setContentSize(frame?frame.width:0,frame?frame.height:0);}
    onEnable(){} onDestroy(){this.destroyCalls++;}
  }
  const cc={Sprite,SpriteFrame:Frame,isValid:value=>!!value&&!value.destroyed,sys:{localStorage:{getItem(){return null},setItem(){}}},director:{on(){},getScene(){return null}},Director:{EVENT_AFTER_SCENE_LAUNCH:'scene'},
    resources:{load(url,type,callback){requests.push({kind:'resource',url,callback});}},assetManager:{loadAny(url,callback){requests.push({kind:'uuid',url,callback});}},warn(...args){warnings.push(args);}};
  const context={cc,exports:{}};vm.runInNewContext(source,context);
  const manager=new context.exports.LanguageMgr();
  const catalog={defaultLanguage:'en',languages:[{code:'en'},{code:'zh'},{code:'fr'}],entries:{tile:{en:'Barracks',zh:'兵营',fr:'Caserne'},other:{en:'Tower',zh:'塔',fr:'Tour'}},
    images:{original:{key:'tile',template:'tile_by',preserveOriginal:{zh:'兵营'},artwork:{en:'localization/generated/en/tile_by',zh:'localization/generated/zh/tile_by'}},other:{key:'other',artwork:{en:'other-en-uuid',zh:'other-zh-uuid'}}},
    artTemplates:{tile_by:{width:171,height:100,regions:[],pending:false}}};
  manager.setCatalog(catalog);
  function sprite(){const value=new Sprite();value.spriteFrame=new Frame('original');value.node.setContentSize(240,140);return value;}
  return{manager,catalog,cc,requests,warnings,Frame,Sprite,sprite};
}
function shape(sprite){const n=sprite.node;return {width:n.width,height:n.height,x:n.x,y:n.y,scaleX:n.scaleX,scaleY:n.scaleY,angle:n.angle,anchorX:n.anchorX,anchorY:n.anchorY};}
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('Resource artwork preserves node dimensions, position, scale, angle and anchors',()=>{
  const f=fixture(),s=f.sprite(),before=shape(s);assert.equal(f.requests[0].kind,'resource');
  const localized=new f.Frame('generated-en',300,60);f.requests[0].callback(null,localized);
  assert.equal(s.spriteFrame,localized);assert.deepEqual(shape(s),before);
  f.manager.setCurrentLanguage('zh');assert.equal(s.spriteFrame._uuid,'original');assert.deepEqual(shape(s),before);
});
test('Rapid language changes and same-language later requests reject stale callbacks',()=>{
  const f=fixture(),s=f.sprite();f.manager.setCurrentLanguage('zh');
  f.requests[0].callback(null,new f.Frame('late-en'));assert.equal(s.spriteFrame._uuid,'original');
  f.manager.setCurrentLanguage('en');const old=f.requests.at(-1);f.manager.refreshSprite(s);const latest=f.requests.at(-1);
  latest.callback(null,new f.Frame('latest-en'));old.callback(null,new f.Frame('stale-en'));assert.equal(s.spriteFrame._uuid,'latest-en');
});
test('External frame changes and destruction invalidate pending loads and clean tracking',()=>{
  const f=fixture(),s=f.sprite(),old=f.requests[0];s.spriteFrame=new f.Frame('other');
  assert.equal(f.requests.at(-1).kind,'uuid');old.callback(null,new f.Frame('stale'));assert.equal(s.spriteFrame._uuid,'other');
  const pending=f.requests.at(-1);s.spriteFrame=new f.Frame('unmapped');pending.callback(null,new f.Frame('stale2'));
  assert.equal(s.spriteFrame._uuid,'unmapped');assert.equal(f.manager._sprites.has(s),false);
  s.spriteFrame=new f.Frame('original');const afterDestroy=f.requests.at(-1);s.onDestroy();afterDestroy.callback(null,new f.Frame('stale3'));
  assert.equal(s.spriteFrame._uuid,'original');assert.equal(f.manager._sprites.has(s),false);assert.equal(s.destroyCalls,1);
});
test('Errors, null/wrong assets and synchronous exceptions retain source art and report failures',()=>{
  const f=fixture(),s=f.sprite(),before=shape(s);
  f.requests[0].callback(new Error('not found'));assert.equal(s.spriteFrame._uuid,'original');assert.deepEqual(shape(s),before);
  assert(f.manager.getAudit().missing.includes('artwork:localization/generated/en/tile_by'));
  f.manager.refreshSprite(s);f.requests.at(-1).callback(null,null);assert.equal(s.spriteFrame._uuid,'original');assert.equal(f.warnings.length,1);
  f.manager.refreshSprite(s);f.requests.at(-1).callback(null,{});assert.equal(s.spriteFrame._uuid,'original');
  f.cc.resources.load=()=>{throw new Error('sync loader failure')};assert.doesNotThrow(()=>f.manager.refreshSprite(s));
  f.cc.resources.load=(url,type,callback)=>callback(null,new f.Frame('recovered'));f.manager.refreshSprite(s);
  assert.equal(s.spriteFrame._uuid,'recovered');assert(!f.manager.getAudit().missing.includes('artwork:localization/generated/en/tile_by'));
});
test('Edited Chinese uses generated artwork and newly added locales derive generated paths',()=>{
  const f=fixture(),s=f.sprite();f.manager.setCurrentLanguage('zh');const count=f.requests.length;
  assert.equal(s.spriteFrame._uuid,'original');assert.equal(count,1);
  f.catalog.entries.tile.zh='新兵营';f.manager.refreshSprite(s);assert.equal(f.requests.at(-1).url,'localization/generated/zh/tile_by');
  f.requests.at(-1).callback(null,new f.Frame('edited-zh'));assert.equal(s.spriteFrame._uuid,'edited-zh');
  f.manager.setCurrentLanguage('fr');assert.equal(f.requests.at(-1).url,'localization/generated/fr/tile_by');
});
test('Pending templates/bindings and excluded locales preserve source art without loading',()=>{
  const f=fixture();f.catalog.artTemplates.tile_by.pending=true;const s=f.sprite();assert.equal(f.requests.length,0);assert.equal(s.spriteFrame._uuid,'original');
  f.catalog.artTemplates.tile_by.pending=false;f.catalog.images.original.pending=true;f.manager.refreshSprite(s);assert.equal(f.requests.length,0);
  f.catalog.images.original.pending=false;f.catalog.artTemplates.tile_by.languages=['en'];f.manager.setCurrentLanguage('fr');assert.equal(f.requests.length,0);assert.equal(s.spriteFrame._uuid,'original');
  delete f.catalog.images.original.artwork;f.manager.setCurrentLanguage('en');assert.equal(f.requests.length,0);
});
test('A destroyed node cannot be written by an asynchronous image callback',()=>{
  const f=fixture(),s=f.sprite();s.node.destroyed=true;
  assert.doesNotThrow(()=>f.requests[0].callback(null,new f.Frame('late')));assert.equal(s.spriteFrame._uuid,'original');
});
test('Multi-region Chinese preserves source only while every linked entry still matches',()=>{
  const f=fixture();f.catalog.images.original.preserveOriginal.zh={tile:'兵营',other:'塔'};f.manager.setCurrentLanguage('zh');const s=f.sprite();assert.equal(f.requests.length,0);assert.equal(s.spriteFrame._uuid,'original');
  f.catalog.entries.other.zh='新塔';f.manager.refreshSprite(s);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'localization/generated/zh/tile_by');f.requests[0].callback(null,new f.Frame('updated-composite'));assert.equal(s.spriteFrame._uuid,'updated-composite');
  f.catalog.entries.other.zh='塔';f.manager.refreshSprite(s);assert.equal(s.spriteFrame._uuid,'original');assert.equal(f.requests.length,1);
  f.catalog.entries.tile.zh='新兵营';f.manager.refreshSprite(s);assert.equal(f.requests.length,2);f.requests[1].callback(null,new f.Frame('updated-primary'));assert.equal(s.spriteFrame._uuid,'updated-primary');
  f.manager.setCurrentLanguage('en');assert.equal(f.requests.at(-1).url,'localization/generated/en/tile_by');
});
console.log(passed+' artwork runtime checks passed.');
