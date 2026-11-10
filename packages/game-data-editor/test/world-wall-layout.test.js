'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Kit=require('../../../assets/_script/WallKit'),Editor=require('../worlds/wall-layout-editor');
const clone=value=>JSON.parse(JSON.stringify(value));
const native=patch=>Object.assign({nativeVersion:2,left:2,right:3,gate:true,start:'post',end:'post',spacing:1,FutureField:{keep:1}},patch);
const legacy=()=>({left:2,right:2,gate:true,start:'post',end:'post',spacing:2,handles:{left:[-220,-140,-50],right:[65,145,235]},sockets:{left:3,right:-2,depth:1},FutureField:{keep:[1,2]}});
test('native endpoints and fixed gate joins expose no stretching handles',()=>{
 const run=native(),r=Kit.layout(run),list=Editor.handles(r);
 assert.equal(Kit.unit,45);assert.equal(Kit.axis.slope,2/3);
 assert.deepEqual(list.filter(h=>h.draggable).map(h=>[h.kind,h.side]),[['end','left'],['end','right']]);
 assert.deepEqual(list.filter(h=>!h.draggable).map(h=>[h.kind,h.side]),[['join','left'],['join','right']]);
 for(const side of ['left','right']){const points=r[side+'Points'];for(let i=1;i<points.length;i++){assert.equal(points[i].x-points[i-1].x,45);assert.equal(points[i].y-points[i-1].y,-30);}}
 assert.equal(Editor.handles(Kit.layout(native({gate:false}))).length,2);
});
test('endpoint edits add complete pieces and keep the gateway center fixed',()=>{
 const run=native(),before=clone(run),layout=Kit.layout(run);
 for(const [side,along,expected]of [['left',-45,3],['right',45,4],['left',45,1],['right',-45,2]]){
  const result=Editor.move(run,layout,{kind:'end',side},along),r=Kit.layout(result);assert.equal(result[side],expected);assert.deepEqual(result.FutureField,run.FutureField);assert(Kit.validRun(result));assert.deepEqual(r.left,layout.left);assert.deepEqual(r.right,layout.right);
 }
 assert.deepEqual(run,before);
});
test('clicks, tiny drags and read-only gate handles preserve legacy records exactly',()=>{
 const run=legacy(),layout=Kit.layout(run),before=clone(run);
 for(const delta of [0,12,22.49,-12,-22.49])for(const side of ['left','right'])assert.deepEqual(Editor.move(run,layout,{kind:'end',side},delta),before);
 for(const kind of ['join','post','section','socket'])assert.deepEqual(Editor.move(run,layout,{kind,side:'left',index:1},400),before);
 assert.deepEqual(Editor.move(run,layout,{kind:'end',side:'left'},NaN),before);assert.deepEqual(run,before);
});
test('the first real legacy edit canonicalizes known geometry and retains unknown fields',()=>{
 const run=legacy(),before=clone(run),layout=Kit.layout(run),result=Editor.move(run,layout,{kind:'end',side:'right'},45);
 assert.equal(result.nativeVersion,2);assert.equal(result.left,4);assert.equal(result.right,5);assert.equal(result.spacing,1);assert(!('handles'in result));assert(!('sockets'in result));assert.deepEqual(result.FutureField,before.FutureField);assert.deepEqual(run,before);
 const fitted=Kit.layout(result);assert.deepEqual(fitted.left,layout.left);assert.deepEqual(fitted.right,layout.right);
});
test('whole-piece snapping is symmetric and endpoint limits keep solid walls usable',()=>{
 const run=native(),layout=Kit.layout(run);
 assert.equal(Editor.move(run,layout,{kind:'end',side:'right'},22.5).right,4);assert.equal(Editor.move(run,layout,{kind:'end',side:'right'},-22.5).right,2);
 for(const side of ['left','right']){const result=Editor.move(run,layout,{kind:'end',side},side==='left'?-1e9:1e9);assert.equal(result[side],256);assert(Kit.validRun(result));}
 const solid=native({left:1,right:0,gate:false}),result=Editor.move(solid,Kit.layout(solid),{kind:'end',side:'left'},1e9);assert.deepEqual(result,solid);
 const atLimit=native({left:256,right:256});assert.deepEqual(Editor.move(atLimit,Kit.layout(atLimit),{kind:'end',side:'right'},45),atLimit);
});
test('explicit conversion preserves unknown metadata without changing its source',()=>{
 const run=legacy(),before=clone(run),result=Editor.resetPositions(run);assert.equal(result.nativeVersion,2);assert.deepEqual(result.FutureField,before.FutureField);assert.deepEqual(run,before);assert.deepEqual(Editor.resetPositions(result),result);
});
test('the popup previews both gate parts and makes no edits until a length changes',t=>{
 const Renderer=require('../worlds/building-renderer'),Run=require('../worlds/wall-run'),fits=[];let editor;t.after(()=>{if(editor)editor.destroy();});
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.style={};this.classList={add(){}};this.value='';}appendChild(child){this.children.push(child);return child;}getContext(){return {};} }
 const globals={document:global.document,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame};global.document={createElement:tag=>new Element(tag)};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};t.after(()=>{for(const [key,value]of Object.entries(globals)){if(value===undefined)delete global[key];else global[key]=value;}});
 t.mock.method(Renderer,'create',()=>({prepare(){},parts(){return[];},draw(){},destroy(){},stats(){return{};}}));t.mock.method(Run,'fitRecord',(record,component,face)=>fits.push({record,component,face}));
 const run=legacy(),authored=Kit.layout(run),left={skeleton:{x:-100,y:-50,width:250,height:250},wallKit:{layout:authored},wallDoor:{version:2},animations:{open_inward:{}}},right={skeleton:{x:-50,y:-80,width:150,height:300},wallGate:{}},record={origin:{x:0,y:0},skeletons:[{json:left,_wallSourceJson:left,matrix:[1,0,0,1,0,0],revision:'left'},{json:{fitted:true},_wallSourceJson:right,matrix:[1,0,0,1,0,0],revision:'right'}]},before=clone(record),host=new Element('div');editor=Editor.mount(host,{record,run,face:'NW'});
 assert.equal(editor.value(),null);assert.equal(fits[0].record.skeletons.length,2);assert.equal(fits[0].record.skeletons[1].json,right);assert.equal(fits[0].face,'NW');assert.deepEqual(record,before);
 const controls=Object.fromEntries(host.children[0].children.filter(e=>e.tagName==='label').map(e=>[e.children[0].textContent,e.children[1]]));
 controls.Tier.value='3';controls.Tier.onchange();controls['Open gate'].checked=true;controls['Open gate'].onchange();assert.equal(editor.value(),null);assert(fits.at(-1).record.skeletons.every(part=>part.skin===Kit.skins[2]&&part.animation==='open'));
 controls['Opening preview'].value='Inward';controls['Opening preview'].onchange();assert.equal(editor.value(),null,'Preview direction does not seed a saved setting');assert.equal(fits.at(-1).record.skeletons[0].animation,'open_inward');assert.equal(fits.at(-1).record.skeletons[1].animation,'open','Legacy side parts retain compatible clips');assert.equal(fits.at(-1).component.wallOpening,'inward');controls['Opening preview'].value='Outward';controls['Opening preview'].onchange();assert.equal(editor.value(),null);
 controls['Right sections'].value=String(authored.rightCount);controls['Right sections'].onchange();assert.equal(editor.value(),null);
 controls['Right sections'].value=String(authored.rightCount+1);controls['Right sections'].onchange();assert.equal(editor.value().right,authored.rightCount+1);assert.deepEqual(editor.value().FutureField,run.FutureField);assert.deepEqual(record,before);
 const action=name=>host.children[0].children.find(e=>e.textContent===name).onclick();action('Reset layout changes');assert.equal(editor.value(),null);
 controls['Wall side'].value='Right';controls['Wall side'].onchange();controls.Direction.value='NE';controls.Direction.onchange();controls['Add pieces'].value='2';controls['Add pieces'].onchange();assert.equal(editor.value(),null);
 action('Extend / turn');assert.equal(editor.value().right,authored.rightCount+2);assert(Editor.bent(editor.value(),'right'));assert(controls['Right sections'].disabled);assert(JSON.parse(fits.at(-1).component.wallRun).routes.right.length===3);
 action('Remove last stretch');assert.equal(editor.value().right,authored.rightCount);assert(!controls['Right sections'].disabled);action('Reset layout changes');assert.equal(editor.value(),null);
 controls['Left sections'].value='';controls['Left sections'].onchange();assert.throws(()=>editor.value(),/Correct the wall layout/);
 editor.destroy();const legacyRecord=clone(record);legacyRecord.wallOpening='inward';for(const part of legacyRecord.skeletons)for(const json of [part.json,part._wallSourceJson])if(json){delete json.wallDoor;if(json.animations)delete json.animations.open_inward;}const legacyBefore=clone(legacyRecord),legacyHost=new Element('div');editor=Editor.mount(legacyHost,{record:legacyRecord,run,face:'NW'});const legacyControls=Object.fromEntries(legacyHost.children[0].children.filter(e=>e.tagName==='label').map(e=>[e.children[0].textContent,e.children[1]]));assert(!legacyControls['Opening preview'],'Legacy artwork offers no unsupported opening direction');legacyControls['Open gate'].checked=true;legacyControls['Open gate'].onchange();assert(fits.at(-1).record.skeletons.every(part=>part.animation==='open'),'Explicit old metadata retains native legacy opening');assert.equal(editor.value(),null);assert.deepEqual(legacyRecord,legacyBefore,'Hiding the unsupported control preserves existing explicit metadata');
 editor.destroy();const closedRecord=clone(record);closedRecord.wallOpening='inward';closedRecord.skeletons[0].json.wallDoor.closedOnly=true;const closedBefore=clone(closedRecord),closedHost=new Element('div');editor=Editor.mount(closedHost,{record:closedRecord,run,face:'NW'});const closedControls=Object.fromEntries(closedHost.children[0].children.filter(e=>e.tagName==='label').map(e=>[e.children[0].textContent,e.children[1]]));assert(!closedControls['Opening preview'],'Closed-only gates hide direction despite compatibility clip names');closedControls['Open gate'].checked=true;closedControls['Open gate'].onchange();assert.equal(fits.at(-1).record.skeletons[0].animation,'open_inward','The existing open-state controller still runs');assert.equal(editor.value(),null);assert.deepEqual(closedRecord,closedBefore);
});

test('turns extend native routes while leaving earlier stretches and both gate anchors fixed',()=>{
 const run=native(),before=clone(run),a=Kit.layout(run),turned=Editor.extend(run,'right',{u:0,v:1},2),b=Kit.layout(turned);
 assert.equal(turned.right,5);assert.deepEqual(turned.routes.right,[{u:0,v:0},{u:3,v:0},{u:3,v:2}]);assert(Editor.bent(turned,'right'));assert.deepEqual(b.left,a.left);assert.deepEqual(b.right,a.right);assert.deepEqual(run,before);
 assert.equal(b.rightSegments.length,2);assert.deepEqual(b.rightEnd,{x:a.right.x+225,y:a.right.y-30});
 const extended=Editor.extend(turned,'right',{u:0,v:1},3);assert.equal(extended.right,8);assert.equal(extended.routes.right.length,3);assert.deepEqual(extended.routes.right[2],{u:3,v:5});
 assert.throws(()=>Editor.count(turned,'right',8),/bent route/);assert.deepEqual(Editor.count(turned,'right',5),turned);
});
test('dragging a bent end resizes only its final stretch and can remove that stretch',()=>{
 const run=Editor.extend(native(),'right',{u:0,v:1},2);run.routes.right[2].future={keep:'endpoint'};
 const before=clone(run),result=Editor.move(run,Kit.layout(run),{kind:'end',side:'right'},45);
 assert.equal(result.right,6);assert.deepEqual(result.routes.right.slice(0,2),before.routes.right.slice(0,2));assert.deepEqual(result.routes.right[2],{u:3,v:3,future:{keep:'endpoint'}});assert.deepEqual(run,before);
 const h=Editor.handles(Kit.layout(run)).find(h=>h.side==='right'&&h.draggable);assert.deepEqual(h.axis,{x:45,y:30});
 const shorter=Editor.resizeLast(run,'right',-100);assert.equal(shorter.right,3);assert.deepEqual(shorter.routes.right,[{u:0,v:0},{u:3,v:0}]);assert(!Editor.bent(shorter,'right'));
 const count=Editor.count(shorter,'right',4);assert.deepEqual(count.routes.right,[{u:0,v:0},{u:4,v:0}]);assert.equal(count.right,4);
});
test('route edits refuse crossings, backtracking and oversized additions without mutating input',()=>{
 const run=Editor.extend(native(),'right',{u:0,v:1},2),before=clone(run);assert.throws(()=>Editor.extend(run,'right',{u:0,v:-1},1),/route crosses/);
 const corner=Editor.extend(run,'right',{u:-1,v:0},2);assert.throws(()=>Editor.extend(corner,'right',{u:0,v:-1},2),/route crosses/);
 assert.throws(()=>Editor.extend(run,'right',{u:1,v:1},1),/native diagonal/);assert.throws(()=>Editor.extend(run,'right',{u:0,v:1},0),/1–256/);
 assert.throws(()=>Editor.extend(native({right:256}),'right',{u:1,v:0},1),/piece limit/);assert.deepEqual(run,before);
});
test('removing the last stretch and capping an end preserve all other metadata',()=>{
 const run=native({start:'shared',end:'corner'}),before=clone(run),capped=Editor.capEnd(run,'left');assert.equal(capped.start,'post');assert.equal(capped.end,'corner');assert.deepEqual(capped.FutureField,run.FutureField);assert.deepEqual(run,before);
 const turned=Editor.extend(run,'right',{u:0,v:1},2);assert.equal(turned.end,'post');assert.equal(turned.start,'shared');const removed=Editor.removeLast(turned,'right');assert.equal(removed.right,3);assert.equal(removed.left,2);assert.deepEqual(removed.FutureField,run.FutureField);
 const empty=Editor.removeLast(removed,'right');assert.equal(empty.right,0);assert.deepEqual(Editor.removeLast(empty,'right'),empty);assert(Kit.validRun(empty));
 assert.throws(()=>Editor.removeLast(native({gate:false,left:1,right:0}),'left'),/at least one piece/);
});
test('direction labels follow screen projection without modifying or flipping artwork',()=>{
 const m=[1,0,0,1,0,0],before=clone(m);assert.deepEqual(Editor.directions(m),{NE:{u:0,v:1},NW:{u:-1,v:0},SE:{u:1,v:0},SW:{u:0,v:-1}});
 assert.deepEqual(Editor.directions([-1,0,0,1,0,0]),{NE:{u:-1,v:0},NW:{u:0,v:1},SE:{u:0,v:-1},SW:{u:1,v:0}});
 assert.deepEqual(Editor.directions([0,1,-1,0,0,0]),{NE:{u:1,v:0},NW:{u:0,v:1},SE:{u:0,v:-1},SW:{u:-1,v:0}});assert.deepEqual(m,before);
});

test('shared foreground endpoints retain their integrated native connector',()=>{
 const run=native({left:3,start:'shared',routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:-1}]}}),layout=Kit.layout(run),end=Kit.posts(layout).find(p=>Math.abs(p.x-layout.leftEnd.x)<1e-7&&Math.abs(p.y-layout.leftEnd.y)<1e-7);
 assert(end);assert.equal(end.part,'right');
 const straight=Kit.layout(native({start:'shared'}));assert(!Kit.posts(straight).some(p=>Math.abs(p.x-straight.leftEnd.x)<1e-7&&Math.abs(p.y-straight.leftEnd.y)<1e-7),'only a standalone shared endpoint post may be omitted');
});
test('every native route edge is drawn by its foreground connector without rotating artwork',()=>{
 const dirs=[{u:1,v:0},{u:0,v:1},{u:-1,v:0},{u:0,v:-1}],used=new Set();
 for(const first of dirs)for(const second of dirs){if(first.u===-second.u&&first.v===-second.v)continue;const run=native({left:0,right:2,gate:false,routes:{right:[{u:0,v:0},first,{u:first.u+second.u,v:first.v+second.v}]}}),layout=Kit.layout(run),parts=Kit.posts(layout),points=layout.rightPoints;assert(Kit.validRun(run));
  for(const part of parts)used.add(part.part);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],front=a.y<b.y?a:b,back=a.y<b.y?b:a,part=parts.find(p=>Math.abs(p.x-front.x)<1e-7&&Math.abs(p.y-front.y)<1e-7);assert(part);assert(back.x<front.x?['top','corner'].includes(part.part):['right','corner'].includes(part.part));}
 }
 assert.deepEqual(Array.from(used).sort(),['corner','post','right','top']);
});

test('zero-length saved routes remain unchanged on no-op and can be extended normally',()=>{
 const run=native({right:0,routes:{right:[{u:0,v:0,FuturePortal:{keep:1}},{u:0,v:0,FutureEnd:{keep:2}}]}}),before=clone(run);assert(Kit.validRun(run));assert(!Editor.bent(run,'right'));assert.deepEqual(Editor.removeLast(run,'right'),before);assert.deepEqual(Editor.move(run,Kit.layout(run),{kind:'end',side:'right'},0),before);
 const extended=Editor.extend(run,'right',{u:0,v:1},2);assert.equal(extended.right,2);assert.deepEqual(extended.routes.right,[before.routes.right[0],{u:0,v:2,FutureEnd:{keep:2}}]);
 const dragged=Editor.resizeLast(run,'right',1);assert.equal(dragged.right,1);assert.deepEqual(dragged.routes.right[1],{u:1,v:0,FutureEnd:{keep:2}});assert.deepEqual(run,before);
});
test('a corner end stub adds only its explicit branch on a bent endpoint',()=>{
 const run=Editor.extend(native(),'right',{u:0,v:1},2);run.end='corner';const layout=Kit.layout(run),end=Kit.posts(layout).find(p=>Math.abs(p.x-layout.rightEnd.x)<1e-7&&Math.abs(p.y-layout.rightEnd.y)<1e-7);
 assert.equal(end.part,'right','a rear endpoint receives only its upper-right stub');assert.equal(Kit.fixtures(layout).wingSegments[3].length,1);
 const straight=Kit.layout(native({end:'corner'})),corner=Kit.posts(straight).find(p=>Math.abs(p.x-straight.rightEnd.x)<1e-7&&Math.abs(p.y-straight.rightEnd.y)<1e-7);assert.equal(corner.part,'corner','an incoming upper-left edge combines with the upper-right stub');
});
