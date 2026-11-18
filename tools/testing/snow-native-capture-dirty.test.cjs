'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/SnowWeather.js'),'utf8');
const Profile=require('../../assets/_script/SnowWeatherProfile');
const WORLD=1<<3,OPACITY=1<<5,OTHER=1<<7;

function fixture({native=true,failRender=false,failTexture=false}={}){
  const scene={_renderFlag:OTHER},nodes=[],textures=[],frames=[];
  // Native RenderFlow calculates transforms/opacity for the entire scene before
  // visiting only the manual camera's subtree. Its next global calculation
  // clears the transient changed bits. An unrelated Sprite's cached vertices
  // and color therefore need the scene inheritance flags reasserted.
  const sibling={local:{x:-24,opacity:255},world:{x:-24,opacity:255},mesh:{x:-24,opacity:255},dirty:0,changed:0};
  let captures=0;
  function calculate(){
    sibling.changed=0;
    const dirty=sibling.dirty|scene._renderFlag;
    if(dirty&WORLD){sibling.world.x=sibling.local.x;sibling.changed|=WORLD;}
    if(dirty&OPACITY){sibling.world.opacity=sibling.local.opacity;sibling.changed|=OPACITY;}
    sibling.dirty=0;scene._renderFlag&=~(WORLD|OPACITY);
  }
  function mainDraw(){
    calculate();
    if(sibling.changed&WORLD)sibling.mesh.x=sibling.world.x;
    if(sibling.changed&OPACITY)sibling.mesh.opacity=sibling.world.opacity;
    return {...sibling.mesh};
  }
  class Node{
    constructor(name){this.name=name;this.active=true;this.activeInHierarchy=true;this.group='default';this.children=[];nodes.push(this);}
    setParent(parent){this.parent=parent;parent.children.push(this);}
    setPosition(at){this.x=at.x;this.y=at.y;}
    addComponent(Type){const component=new Type();component.node=this;return component;}
    destroy(){this.destroyed=true;}
  }
  class Texture{
    constructor(){textures.push(this);}
    initWithSize(){if(failTexture)throw Error('Texture unavailable');}
    destroy(){this.destroyed=true;}
  }
  class Frame{constructor(texture){this.texture=texture;frames.push(this);}destroy(){this.destroyed=true;}}
  class Camera{
    render(root){captures++;assert.equal(root,record.node);calculate();if(failRender)throw Error('Subtree render failed after native calculation');}
  }
  Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};
  const cc={Node,RenderTexture:Texture,SpriteFrame:Frame,Sprite:class{},Camera,sys:{isNative:native},RenderFlow:{FLAG_WORLD_TRANSFORM:WORLD,FLAG_OPACITY:OPACITY},director:{getScene:()=>scene},macro:{ONE:1},v2:(x,y)=>({x,y}),color:(r,g,b,a)=>({r,g,b,a}),isValid:node=>!node.destroyed};
  const Snow={};vm.runInNewContext(source,{exports:Snow,cc,require:()=>Profile});
  const parent=new Node('air'),emitter=new Node('snow');emitter.setParent(parent);
  const record={node:emitter,system:{enabled:true},paused:false,area:{minX:0,minY:0,width:750,height:1334}};
  return {Snow,record,scene,nodes,textures,frames,mainDraw,get captures(){return captures;},change(){sibling.local={x:24,opacity:128};sibling.dirty=WORLD|OPACITY;}};
}

test('native snow capture preserves unrelated changed Sprite geometry and inherited opacity for the next draw',()=>{
  const f=fixture();f.change();f.Snow.pause(f.record,true);
  assert.equal(f.captures,1);assert(f.record.snapshot);assert.equal(f.record.system.enabled,false);
  assert.deepEqual(f.mainDraw(),{x:24,opacity:128});assert.equal(f.scene._renderFlag,OTHER,'Unrelated scene flags remain intact');
  f.Snow.pause(f.record,true);assert.equal(f.captures,1);assert.equal(f.scene._renderFlag,OTHER,'An already paused emitter adds no recurring repair work');
  f.Snow.pause(f.record,false);assert.equal(f.record.snapshot,null);assert(f.textures.every(value=>value.destroyed));assert(f.frames.every(value=>value.destroyed));
});

test('failed native snow subtree capture still repairs unrelated Sprite inheritance and frees partial resources',()=>{
  const f=fixture({failRender:true});f.change();f.Snow.pause(f.record,true);
  assert.equal(f.captures,1);assert.equal(f.record.pauseFallback,true);assert.equal(f.record.system.enabled,true);assert.equal(f.record.snapshot,undefined);
  assert.deepEqual(f.mainDraw(),{x:24,opacity:128});assert.equal(f.scene._renderFlag,OTHER);
  assert(f.textures.every(value=>value.destroyed));assert(f.nodes.filter(node=>node.name==='Snow pause capture').every(node=>node.destroyed));
});

test('browser snow pause creates no capture and leaves scene inheritance flags untouched',()=>{
  const f=fixture({native:false});f.change();f.Snow.pause(f.record,true);
  assert.equal(f.record.system._snowPaused,true);assert.equal(f.captures,0);assert.equal(f.textures.length,0);assert.equal(f.scene._renderFlag,OTHER);
  assert.deepEqual(f.mainDraw(),{x:24,opacity:128});f.Snow.pause(f.record,false);assert.equal(f.scene._renderFlag,OTHER);
});

test('native failure before any camera render requires no scene repair',()=>{
  const f=fixture({failTexture:true});f.change();f.Snow.pause(f.record,true);
  assert.equal(f.captures,0);assert.equal(f.record.pauseFallback,true);assert.equal(f.scene._renderFlag,OTHER);
  assert.deepEqual(f.mainDraw(),{x:24,opacity:128});assert(f.textures.every(value=>value.destroyed));
});
