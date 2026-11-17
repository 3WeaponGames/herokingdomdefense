'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Trail=require('../../assets/_script/MysticTrail'),Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring');
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,a+' != '+b);
function setup(distance=100){
 const cache=Trail.create(),state={style:'mystic',time:0},target={id:1,generation:1,x:distance,y:0,ground:{x:distance,y:0}},context={alive:true,hero:{x:0,y:0},origin:{x:0,y:0},beamTarget:target,beamOnset:0},v={channelTrailSpeed:100};
 Trail.update(cache,state,context,v);return{cache,state,context,target,v,advance(time){state.time=time;return Trail.update(cache,state,context,v);}};
}
function fullLink(h){
 const points=h.cache.emitter.points,lines=Trail.segments(h.cache,h.v).filter(s=>s.key===h.cache.emitter.key);
 assert.deepEqual(points[0],h.context.origin);assert.deepEqual(points.at(-1),{x:h.target.x,y:h.target.y});assert(lines.length);close(lines[0].opacity,.9);
 for(let i=1;i<lines.length;i++)assert.deepEqual(lines[i-1].b,lines[i].a);
 return lines;
}
function drawing(){
 const nodes=[];
 class Graphics{clear(){this.polygons=[];}moveTo(x,y){this.points=[{x,y}];}lineTo(x,y){this.points.push({x,y});}close(){}fill(){this.polygons.push({points:this.points,color:this.fillColor});}}
 Graphics.LineCap={ROUND:1};Graphics.LineJoin={ROUND:1};
 class Node{constructor(name){this.name=name;this.active=true;nodes.push(this);}setParent(parent){this.parent=parent;}setPosition(p){this.position=p;}addComponent(Type){return this.component=new Type();}destroy(){this.destroyed=true;}}
 return{nodes,cc:{Node,Graphics,isValid:n=>!!n&&!n.destroyed,color:v=>v,v2:(x,y)=>({x,y})}};
}

test('an invisible emitter still traverses the complete link at the configured speed',()=>{
 const h=setup();h.advance(.25);close(h.cache.emitter.head.x,25);h.advance(1);close(h.cache.emitter.head.x,100);assert.equal(h.cache.emitter.forward,false);h.advance(1.5);close(h.cache.emitter.head.x,50);h.advance(2);close(h.cache.emitter.head.x,0);assert.equal(h.cache.emitter.forward,true);
});

test('every short/long and slow/fast link stays complete before arrival, at turns and during fading',()=>{
 for(const distance of [10,100,300,1500])for(const speed of [100,5000])for(const fade of [.05,.7,1.5]){
  const h=setup(distance);Object.assign(h.v,{channelTrailSpeed:speed,channelTrailLength:fade});h.context.beamOnset=.001;h.advance(.001);const duration=h.cache.emitter.duration;
  for(const fraction of [0,.01,.25,.9,1,1.01,1.5,2,5]){h.advance(.001+duration*fraction);const lines=fullLink(h);assert.equal(h.cache.emitter.points.length,2,'Stationary geometry stays straight');for(const line of lines){close(line.a.y,0);close(line.b.y,0);}}
 }
});

test('a whole strand starts fading only after arrival and a fresh complete connection covers it',()=>{
 const h=setup(),first=h.cache.emitter.key;h.advance(.9);let segments=Trail.segments(h.cache,h.v);assert(segments.length);close(segments[0].opacity,.9);assert.deepEqual(segments[0].a,{x:0,y:0});assert.deepEqual(segments.at(-1).b,{x:100,y:0});
 h.advance(1);close(Trail.segments(h.cache,h.v).find(s=>s.key===first).opacity,.9);h.advance(1.35);close(Trail.segments(h.cache,h.v).find(s=>s.key===first).opacity,.45);fullLink(h);h.advance(1.71);assert(!Trail.segments(h.cache,h.v).some(s=>s.key===first));fullLink(h);
 const far=setup(300);assert(far.cache.emitter.lifetime>setup(100).cache.emitter.lifetime);
});

test('stationary units have one straight connection even while their weapon and torso anchors animate',()=>{
 const h=setup();
 for(let i=1;i<=240;i++){const t=i/120;h.context.origin={x:Math.sin(t*15)*12,y:Math.cos(t*9)*8};h.target.y=Math.sin(t*11)*6;h.advance(t);fullLink(h);for(const line of Trail.segments(h.cache,h.v)){const dx=h.target.x-h.context.origin.x,dy=h.target.y-h.context.origin.y;for(const p of [line.a,line.b])close((p.x-h.context.origin.x)*dy-(p.y-h.context.origin.y)*dx,0);}}
});

test('moving either endpoint creates a smooth historical curve with both ends still attached',()=>{
 for(const moving of ['hero','target','both']){
  const h=setup(200);h.advance(.1);
  for(let i=1;i<=30;i++){const t=.1+i/120;if(moving!=='target'){h.context.hero={x:0,y:i*2};h.context.origin={...h.context.hero};}if(moving!=='hero'){h.target.ground={x:200,y:-i};h.target.y=-i;}h.advance(t);fullLink(h);for(const leg of h.cache.legs){assert.deepEqual(leg.points[0],h.context.origin);assert.deepEqual(leg.points.at(-1),{x:h.target.x,y:h.target.y});}}
  const points=h.cache.emitter.points,from=points[0],to=points.at(-1),dx=to.x-from.x,dy=to.y-from.y,deviation=Math.max(...points.map(p=>Math.abs((p.x-from.x)*dy-(p.y-from.y)*dx)/Math.hypot(dx,dy)));
  assert(points.length>2);assert(deviation>5,'Movement must visibly curve the line');assert(points.length<=25);
  for(let i=2;i<points.length;i++){const a={x:points[i-1].x-points[i-2].x,y:points[i-1].y-points[i-2].y},b={x:points[i].x-points[i-1].x,y:points[i].y-points[i-1].y};assert((a.x*b.x+a.y*b.y)/Math.hypot(a.x,a.y)/Math.hypot(b.x,b.y)>.9,'No abrupt polyline corner');}
  h.advance(3);assert.equal(h.cache.emitter.points.length,2,'The current connection straightens after both units stop and movement history expires');
 }
});

test('changing separation expands and contracts the full link without cutting either endpoint off',()=>{
 const h=setup();for(const distance of [800,1200,50,20,600]){h.target.x=distance;h.target.ground.x=distance;h.advance(h.state.time+.17);fullLink(h);}
});

test('stopping or retargeting fades old complete strands without bridging unrelated targets',()=>{
 const h=setup();h.advance(.4);h.context.beamTarget=null;h.advance(.5);assert.equal(h.cache.emitter,null);assert(h.cache.legs.length);h.advance(2);assert.equal(h.cache.legs.length,0);
 h.context.beamTarget={id:2,generation:1,x:0,y:100,ground:{x:0,y:100}};h.advance(2.1);h.advance(2.4);assert(Trail.segments(h.cache,h.v).every(s=>s.a.x===0&&s.b.x===0));const key=h.cache.emitter.key;h.context.beamOnset=2.5;h.advance(2.5);assert.notEqual(h.cache.emitter.key,key);h.context.beamTarget.generation++;h.advance(2.6);assert.notEqual(h.cache.emitter.key,key);h.context.alive=false;h.advance(2.7);assert.equal(h.cache.emitter,null);h.advance(5);assert.equal(h.cache.legs.length,0);
});

test('head timing is frame independent and clock rewind retires old trail state',()=>{
 const a=setup(),b=setup();a.advance(2.25);for(let i=1;i<=225;i++)b.advance(i/100);close(a.cache.emitter.head.x,b.cache.emitter.head.x);const epoch=a.cache.epoch;a.advance(.1);assert(a.cache.epoch>epoch);assert.equal(a.cache.legs.length,1);fullLink(a);
});

test('very short fast links, long hitches and extended movement keep history and geometry bounded',()=>{
 const h=setup(10);h.v.channelTrailSpeed=5000;h.advance(1000000);assert(h.cache.legs.length<=Trail.maxLegs);assert(Number.isFinite(h.cache.emitter.head.x));fullLink(h);
 for(let i=1;i<=2000;i++){h.target.y=Math.sin(i/30)*80;h.target.ground.y=h.target.y;h.advance(1000000+i/60);assert(h.cache.legs.length<=Trail.maxLegs);assert(h.cache.history.length<=128);assert(Trail.segments(h.cache,h.v).length<=Trail.maxLegs*24);}
});

test('native painting uses the same full path as preview, scales width and reuses and releases its own nodes',()=>{
 const h=setup(),view={},f=drawing(),parent={group:'UI'},convert=p=>({x:10+p.x*2,y:20+p.y*2});
 h.advance(.2);Trail.paint(h.cache,view,parent,h.v,f.cc,convert);assert.equal(f.nodes.length,1);const node=f.nodes[0],g=node.component;let segments=Trail.segments(h.cache,h.v);assert.deepEqual(g.polygons,segments.map(s=>({points:s.quad.map(convert),color:s.color})));close(Math.hypot(g.polygons[0].points[0].x-g.polygons[0].points[3].x,g.polygons[0].points[0].y-g.polygons[0].points[3].y),.8);const head=g.polygons.at(-1).points;close(Math.hypot(head[1].x-head[2].x,head[1].y-head[2].y),20);assert.equal(node.parent,parent);assert.equal(node.group,'UI');assert.equal(node.opacity,Math.round(.9*255));
 h.advance(.3);Trail.paint(h.cache,view,parent,h.v,f.cc,convert);assert.equal(f.nodes.length,1);Trail.suspend(view,f.cc);assert.equal(node.active,false);Trail.paint(h.cache,view,parent,h.v,f.cc,convert);assert.equal(node.active,true);
 h.context.hero={x:0,y:40};h.context.origin={x:0,y:40};h.advance(.5);Trail.paint(h.cache,view,parent,h.v,f.cc,convert);segments=Trail.segments(h.cache,h.v).filter(s=>s.key===h.cache.emitter.key);assert.deepEqual(g.polygons,segments.map(s=>({points:s.quad.map(convert),color:s.color})));
 h.advance(1.2);Trail.paint(h.cache,view,parent,h.v,f.cc,convert);assert(f.nodes.includes(node));assert(view.records.size<=Trail.maxLegs);Trail.clear(view,f.cc);assert(f.nodes.every(n=>n.destroyed));
});

test('every strand tapers from a light tail to the original full-size purple head in its travel direction',()=>{
 const h=setup();
 for(const time of [.2,1.2]){
  h.advance(time);const leg=h.cache.emitter,segments=Trail.segments(h.cache,h.v).filter(s=>s.key===leg.key),tail=leg.forward?segments[0]:segments.at(-1),head=leg.forward?segments.at(-1):segments[0];
  close(leg.forward?tail.widthA:tail.widthB,.4);close(leg.forward?head.widthB:head.widthA,10);
  assert.equal(leg.forward?tail.colorA:tail.colorB,'#d8baff');assert.equal(leg.forward?head.colorB:head.colorA,'#5d2b8b');
  for(let i=1;i<segments.length;i++){const a=segments[i-1],b=segments[i];assert.deepEqual(a.quad[1],b.quad[0]);assert.deepEqual(a.quad[2],b.quad[3]);assert(leg.forward?b.width>a.width:b.width<a.width);}
 }
 h.v.channelTrailWidth=20;h.v.channelTrailTailWidth=.1;const lines=Trail.segments(h.cache,h.v).filter(s=>s.key===h.cache.emitter.key);close(lines[0].widthA,20);close(lines.at(-1).widthB,2);
});

test('native graphics retire after channel shutdown and rendering a cleared cache creates no nodes',()=>{
 const h=setup(),view={},f=drawing();Trail.paint(h.cache,view,{},h.v,f.cc,p=>p);h.context.beamTarget=null;h.advance(.2);h.advance(2);Trail.paint(h.cache,view,{},h.v,f.cc,p=>p);assert.equal(view.records.size,0);assert(f.nodes.every(n=>n.destroyed));
});

test('only the Mystic passive exposes trail controls and reading them preserves authored data and old beam assets',()=>{
 const settings=Settings.defaults('mystic'),before=JSON.stringify(settings),fields=Settings.fields('mystic');assert(fields.visual.some(f=>f.key==='channelTrailColor'));assert(!fields.visual.some(f=>f.key==='beamResource'));const passive=Authoring.fields('mystic','passive',fields,settings);assert.equal(passive.visual.find(f=>f.key==='channelTrailLength').label,'Trail fade after arrival');assert(!Settings.fields('fighter').visual.some(f=>/^channelTrail/.test(f.key)));const v=Trail.visual(settings.visual);assert.equal(v.beamResource,'');assert.equal(v.channelHitResource,'');assert.equal(JSON.stringify(settings),before);
});
