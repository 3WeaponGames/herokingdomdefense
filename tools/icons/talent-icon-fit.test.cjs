'use strict';

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test');
const filename=path.resolve(__dirname,'../../assets/_script/KinghtFallHomeTalentCtrl.js');

function fixture(images){
  const pending=[],cards=[],validityChecks=[];
  const levels=images.map((_image,index)=>Object.freeze({ID:100001+index,Level:1,kindID:index+1}));
  const definitions=Object.fromEntries(images.map((Image,index)=>[index+1,Object.freeze({Image})]));
  Object.freeze(levels);Object.freeze(definitions);
  function Base(){}
  function Sprite(node){this.node=node;this.sizeMode=Sprite.SizeMode.RAW;this.assignments=0;}
  Sprite.SizeMode={CUSTOM:0,RAW:1};
  Object.defineProperty(Sprite.prototype,'spriteFrame',{
    get(){return this.frame;},
    set(frame){
      this.assignments++;this.frame=frame;
      // Creator's authored RAW mode follows the source image size until the
      // runtime explicitly switches the imported artwork to CUSTOM.
      if(this.sizeMode===Sprite.SizeMode.RAW){const size=frame.getOriginalSize();this.node.setContentSize(size.width,size.height);}
    }
  });
  function card(){
    const icon={width:72,height:72,sizeChanges:[],setContentSize(width,height){this.width=width;this.height=height;this.sizeChanges.push([width,height]);}};
    const sprite=new Sprite(icon);icon.getComponent=Type=>{assert.equal(Type,Sprite);return sprite;};
    const arrow={},node={destroyed:false,destroyScheduled:false,icon,sprite,childReads:0,
      setParent(parent){this.parent=parent;},setPosition(position){this.position=position;},on(){},
      getChildByName(name){this.childReads++;assert(!this.destroyed&&!this.destroyScheduled,'A destroyed talent card cannot be touched by an asynchronous load');if(name==='sprIcon')return icon;if(name==='ndArr')return arrow;throw Error('Unexpected child '+name);}};
    cards.push(node);return node;
  }
  const tween={set(){return this;},to(){return this;},union(){return this;},repeatForever(){return this;},start(){return this;}};
  const cc={
    _decorator:{ccclass:Type=>Type,property:()=>()=>{}},
    Node:{EventType:{TOUCH_END:'touchend'}},ScrollView:Base,Graphics:Base,Sprite,
    Size:class{constructor(width,height){this.width=width;this.height=height;}},
    v2:(x=0,y=0)=>({x,y}),instantiate:card,tween:()=>tween,
    isValid(value,strict){validityChecks.push({value,strict});return !!value&&!value.destroyed&&(!strict||!value.destroyScheduled);}
  };
  const data={getTalentLevelCfg:()=>levels,getTalentCfg:id=>definitions[id]};
  const modules={BaseCtrl:{default:Base},UIMgr:{},Config:{},
    KinghtFallConfig:{KinghtFallBundelName:{IconTalent:'authored-talent-bundle'}},
    KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>data}},
    KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance(){throw Error('Loading talent artwork must not read or change player progress');}}}};
  const exports={};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    exports,cc,require(name){assert(Object.hasOwn(modules,name),'Unexpected dependency '+name);return modules[name];},
    __extends(Child,Parent){Child.prototype=Object.create(Parent.prototype);Child.prototype.constructor=Child;},
    __decorate:(_decorators,target,key)=>key===undefined?target:undefined
  },{filename});
  const owner=new exports.default();
  owner.ndItem={};owner.ndParent={content:{height:0}};
  owner.loadSpriteFrame=(bundle,key,done)=>pending.push({bundle,key,done});
  const before=JSON.stringify({levels,definitions});owner.initData();
  return {owner,pending,cards,cc,validityChecks,configuration:()=>JSON.stringify({levels,definitions}),before};
}
function frame(width=128,height=128){return{getOriginalSize:()=>({width,height})};}

test('Stats Icons fit inside talent badges using a fixed96px custom sprite size',()=>{
  const f=fixture(['@icon/Stats Icons/health','@icon/Stats Icons/building-damage']);
  assert.equal(f.pending.length,2);assert.equal(f.owner.nodeInfo[0].ndItem.length,2);
  assert(f.pending.every(load=>load.bundle==='authored-talent-bundle'));
  f.pending.forEach((load,index)=>{
    assert.equal(f.cards[index].sprite.assignments,0,'Browsing starts with the original authored node until artwork arrives');
    const loaded=frame();load.done(loaded);
    assert.equal(f.cards[index].sprite.spriteFrame,loaded);
    assert.equal(f.cards[index].sprite.sizeMode,f.cc.Sprite.SizeMode.CUSTOM);
    assert.deepEqual([f.cards[index].icon.width,f.cards[index].icon.height],[96,96]);
    assert.equal(f.cards[index].sprite.assignments,1);
  });
  assert.equal(f.configuration(),f.before,'Fitting artwork cannot edit talent configuration');
});

test('unrelated talent artwork retains its legacy auto-size even when asynchronous loads finish in reverse order',()=>{
  const f=fixture(['@icon/Stats Icons/attack-speed','legacy-talent-icon','@icon/Stats Icons Extra/health','@icon/another-pack/health']);
  for(let index=f.pending.length-1;index>=0;index--)f.pending[index].done(frame(129+index,128+index));
  assert.deepEqual([f.cards[0].icon.width,f.cards[0].icon.height],[96,96]);
  for(let index=1;index<f.cards.length;index++){
    assert.equal(f.cards[index].sprite.sizeMode,f.cc.Sprite.SizeMode.RAW);
    assert.deepEqual([f.cards[index].icon.width,f.cards[index].icon.height],[129+index,128+index]);
    assert.equal(f.cards[index].icon.sizeChanges.length,1,'Only legacy frame autosizing changes the node');
  }
  assert.equal(f.configuration(),f.before);
});

test('late icon callbacks ignore destroyed or scheduled-for-destruction talent cards',()=>{
  for(const flag of ['destroyed','destroyScheduled']){
    const f=fixture(['@icon/Stats Icons/health']),card=f.cards[0],reads=card.childReads;
    card[flag]=true;
    assert.doesNotThrow(()=>f.pending[0].done(frame()));
    assert.equal(card.childReads,reads,'A delayed loader must not look up children on a retired card');
    assert.equal(card.sprite.assignments,0);
    assert.deepEqual([card.icon.width,card.icon.height],[72,72]);
    assert(f.validityChecks.some(check=>check.value===card&&check.strict===true),'Use Creator strict validity so destruction scheduled this frame is also rejected');
    assert.equal(f.configuration(),f.before);
  }
});

test('a missing sprite frame leaves the authored talent icon untouched',()=>{
  for(const reference of ['@icon/Stats Icons/health','legacy-talent-icon']){
    const f=fixture([reference]),card=f.cards[0],reads=card.childReads;
    assert.doesNotThrow(()=>f.pending[0].done(null));
    assert.equal(card.childReads,reads);assert.equal(card.sprite.assignments,0);
    assert.equal(card.sprite.sizeMode,f.cc.Sprite.SizeMode.RAW);
    assert.deepEqual([card.icon.width,card.icon.height],[72,72]);
  }
});
