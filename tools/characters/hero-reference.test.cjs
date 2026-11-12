'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./client-harness.cjs'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),Reference=require('../../packages/hkd-characters/lib/preview-reference');
const root=path.resolve(__dirname,'../..'),close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function bounds(_sp,layers){const points=layers.flatMap(layer=>[[0,0],[100,layer.description.name==='Saved hero'?120:100]].map(([x,y])=>Renderer.transformPoint(layer.description,x,y))),xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);return{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};}
function describe(base,description){if(base.type==='hero'){description.layers=description.layers.slice(0,1);Object.assign(description.layers[0],{uuid:'saved-hero',name:'Saved hero'});}else description.previewWorld={a:.5,b:0,c:0,d:.5,x:0,y:0};return description;}
function pair(f){const draws=f.calls.canvasDraws;return{hero:draws.filter(draw=>draw.canvas.getAttribute('aria-label')==='Hero size reference').at(-1),unit:draws.filter(draw=>draw.canvas.getAttribute('aria-label')!=='Hero size reference').at(-1)};}
test('hero reference is opt-in, uses a shared world scale and floor, and never edits the selected unit',async t=>{
  const f=fixture({describe,bounds,equipment:true});t.after(()=>f.close());await f.settle();const toggle=f.byLabel('Show hero reference'),heroCanvas=f.byLabel('Hero size reference'),before=JSON.stringify(f.snapshot()),selection=f.client.getState();
  assert.equal(toggle.checked,false);assert.equal(heroCanvas.hidden,true);assert.equal(f.calls.describes.filter(base=>base.type==='hero').length,0);
  toggle.checked=true;toggle.onchange();await f.settle();assert.equal(f.client.getState().heroReference,true);assert.equal(heroCanvas.hidden,false);
  let {hero,unit}=pair(f);assert.deepEqual(hero.options.bounds,unit.options.bounds);assert.equal(hero.options.panY,unit.options.panY);assert.equal(hero.options.zoom,unit.options.zoom);
  const unitHeight=Renderer.transformPoint(unit.layers[0],0,100).y-Renderer.transformPoint(unit.layers[0],0,0).y,heroHeight=Renderer.transformPoint(hero.layers[0],0,120).y-Renderer.transformPoint(hero.layers[0],0,0).y;
  close(unitHeight/heroHeight,50/120);assert(hero.options.panX>unit.options.panX,'the hero stands beside the model, with a gap');
  close(Renderer.transformPoint(unit.layers[0],0,0).y,Renderer.transformPoint(hero.layers[0],0,0).y);
  f.byLabel('Preview zoom').value=2;f.byLabel('Preview zoom').onchange();await f.button('Face left').click();({hero,unit}=pair(f));assert.equal(hero.options.zoom,2);assert.equal(unit.options.zoom,2);assert.equal(hero.options.facing,-1);assert.equal(unit.options.facing,-1);assert(hero.options.panX<unit.options.panX);
  toggle.checked=false;toggle.onchange();assert.equal(heroCanvas.hidden,true);assert.equal(f.client.getState().heroReference,false);assert.equal(pair(f).unit.layers[0]._mountMotion,undefined,'the normal editing view is restored');
  assert.equal(f.client.getState().selected,selection.selected);assert.equal(f.client.getState().selectedPart,selection.selectedPart);assert.equal(f.client.getState().dirty,false);assert.equal(JSON.stringify(f.snapshot()),before);assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);
});
test('delayed hero loads cannot undo a toggle or replace a newer character selection',async t=>{
  let release;const f=fixture({bounds,describe:(base,description)=>base.type==='hero'?new Promise(resolve=>{release=()=>resolve(describe(base,description));}):describe(base,description)});t.after(()=>f.close());await f.settle();const toggle=f.byLabel('Show hero reference');
  toggle.checked=true;toggle.onchange();await f.settle();toggle.checked=false;toggle.onchange();release();await f.settle();assert.equal(f.client.getState().heroReference,false);assert.equal(f.byLabel('Hero size reference').hidden,true);assert.equal(f.calls.canvasDraws.filter(draw=>draw.canvas.getAttribute('aria-label')==='Hero size reference').length,0);
  toggle.checked=true;toggle.onchange();await f.settle();await f.button('Allies · Infantry').click();await f.settle();release();await f.settle();assert.equal(f.client.getState().heroReference,true);assert.equal(f.client.getState().selected,'infantry');assert.equal(f.byLabel('Character name').value,'Infantry');assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);
});
test('closing releases both canvases and ignores pending hero work',async()=>{
  let release;const f=fixture({describe:(base,description)=>base.type==='hero'?new Promise(resolve=>{release=()=>resolve(description);}):description});await f.settle();const toggle=f.byLabel('Show hero reference');toggle.checked=true;toggle.onchange();await f.settle();const count=f.calls.canvasDraws.length;f.close();release();await f.settle();assert.equal(f.calls.canvasDraws.length,count);assert.equal(f.calls.destroyedCanvases.length,2);assert.equal(f.frames.size,0);assert.equal(f.calls.changes.length,0);
});
test('hero load errors stay in the preview and the reference control is absent from Items',async t=>{
  const f=fixture({describe:(base,description)=>{if(base.type==='hero')throw Error('Missing hero texture');return description;}});t.after(()=>f.close());await f.settle();const toggle=f.byLabel('Show hero reference');toggle.checked=true;toggle.onchange();await f.settle();assert.equal(f.client.getState().heroReference,false);assert(f.host.textContent.includes('Hero reference unavailable'));assert.equal(f.calls.changes.length,0);
  const items=fixture({kind:'items'});t.after(()=>items.close());await items.settle();assert.equal(items.byLabel('Show hero reference').parentElement.hidden,true);
});
test('world reference metadata matches the native fit, authored prefab scale and visual overrides without writes',()=>{
  const {Service}=require('../../packages/hkd-characters/lib/service'),service=new Service(root),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'))),contracts=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/unit-library/runtime/contracts.json'))),file=path.join(root,'assets/resources/characters/catalog.json'),before=fs.readFileSync(file),draft=service.snapshot();
  const base={type:'ally',id:'90001',source:'character-maker/Character'},description=service.describe(base,true),native=require('../../packages/game-data-editor/lib/unit-assets').describe(root,{type:'ally',id:'90001',noRuntime:true,noShared:true}),world=Reference.world(root,base,description),factor=contracts.units['ally:90001:default'].height/description.layers[0].json.skeleton.height,visual=cfg.GameTools.visuals['ally:90001:default'];
  close(world.a,native.layers[0].scaleX*factor*(visual.scaleX||1));close(world.d,native.layers[0].scaleY*factor*(visual.scaleY||1));assert.deepEqual(service.snapshot(),draft);assert.deepEqual(fs.readFileSync(file),before);
  const combined=Reference.compose({a:-2,b:0,c:0,d:3,x:7,y:9},{a:1,b:.2,c:-.1,d:1,x:11,y:12}),point={x:13,y:15};const restored=Reference.inverse(combined,Reference.point(combined,point));close(restored.x,point.x);close(restored.y,point.y);
});
test('visual scale, mirroring and rotation retain a nonzero prefab origin and compose with native fitting',()=>{
  const origin={x:17,y:-11},visual={x:7,y:13,scaleX:2,scaleY:3,rotation:90,mirrorX:true},matrix=Reference.visualFrame(visual,origin),at=Reference.point(matrix,origin);close(at.x,24);close(at.y,2);
  const fitted=Reference.compose(matrix,{a:.5,b:0,c:0,d:.5,x:origin.x,y:origin.y}),base=Reference.point(fitted,{x:0,y:0}),tip=Reference.point(fitted,{x:10,y:20});close(base.x,24);close(base.y,2);close(tip.x,-6);close(tip.y,-8);
});
test('the standalone preview bundle loads all client helpers without Node or starting gameplay',async t=>{
  const vm=require('node:vm'),{createServer}=require('./serve-editor.cjs'),server=createServer(root),f=fixture();t.after(()=>f.close());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/app.js');assert.equal(response.status,200);const source=await response.text(),host=new f.host.constructor('div');let dispose;
  vm.runInNewContext(source,{document:{getElementById:()=>host,createElement:tag=>new f.host.constructor(tag)},window:{addEventListener(name,callback){assert.equal(name,'pagehide');dispose=callback;}},requestAnimationFrame(){assert.fail('An unloaded review must not start playback');},cancelAnimationFrame(){},fetch:()=>new Promise(()=>{})},{filename:'characters-review-bundle.js'});
  const toggle=host.querySelector('[aria-label="Show hero reference"]');assert(toggle);assert.equal(toggle.checked,false);dispose();assert.equal(host.children.length,0);
});
