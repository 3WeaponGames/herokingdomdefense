'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),cp=require('node:child_process');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid');
const bounds={minX:-100,minY:-100,maxX:100,maxY:100};
const box=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
function safe(grid,plan,radius){assert(plan);for(const p of plan.points)assert(grid.isWalkable(p,radius));for(let i=1;i<plan.points.length;i++)assert(grid.segmentClear(plan.points[i-1],plan.points[i],radius));assert.deepEqual(plan.points.at(-1),plan.goal);}
function corrupt(plan){for(const p of plan.points)p.x=p.y=1e6;plan.goal.x=plan.goal.y=2e6;if(plan.escape){plan.escape.from.x=3e6;plan.escape.to.x=4e6;}plan.points.length=0;}
function random(seed=35){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('returned detours, projected goals, escapes and shared frontier routes never expose internal geometry',()=>{
 const cases=[{polygon:box(-10,-40,10,40),from:{x:-70,y:0},to:{x:70,y:0}},{polygon:box(-10,-40,10,40),from:{x:-70,y:0},to:{x:0,y:0}},{polygon:box(-10,-40,10,40),from:{x:-5,y:0},to:{x:70,y:0}},{polygon:box(-5,-100,5,100),from:{x:-70,y:0},to:{x:70,y:0},partial:true}];
 for(const c of cases){
  const grid=new NavigationGrid([c.polygon],bounds,10),plan=grid.findPath(c.from,c.to,5,c.partial);safe(grid,plan,5);const before=JSON.stringify(grid._centers);corrupt(plan);assert.equal(JSON.stringify(grid._centers),before);
  const second=grid.findPath(c.from,c.to,5,c.partial);safe(grid,second,5);if(c.partial){assert.equal(grid.lastSearch.shared,true);corrupt(second);safe(grid,grid.findPath(c.from,c.to,5,true),5);}
 }
});

test('sub-unit route endings preserve the exact requested goal after direct movement, escape and detouring',()=>{
 const empty=new NavigationGrid([],bounds,10),close={x:.0001,y:0};safe(empty,empty.findPath({x:0,y:0},close,0),0);assert.deepEqual(empty.findPath({x:0,y:0},close,0).points,[{x:0,y:0},close]);
 const grid=new NavigationGrid([box(-10,-40,10,40)],bounds,10),goal={x:75.0001,y:5};safe(grid,grid.findPath({x:-75,y:5},goal,5),5);
 const escape=grid.findPath({x:-5,y:5},{x:-24.9999,y:5},5);safe(grid,escape,5);assert(escape.escape);
});

test('passage geometry is validated and detached from all caller-owned arrays and points',()=>{
 const passages=[box(-10,-5,10,5)],expected=JSON.parse(JSON.stringify(passages)),grid=new NavigationGrid([],bounds,10,passages);passages[0][0].x=-999;passages[0].push({x:90,y:90});passages.push(box(30,30,40,40));assert.deepEqual(grid._passages,expected);
 for(const value of [{},[[]],[[{x:0,y:0},{x:1,y:0},{x:NaN,y:1}]]])assert.throws(()=>new NavigationGrid([],bounds,10,value),/passages|finite/);
});

test('large translated maps build a bounded relative spatial index without non-advancing numeric loops',()=>{
 const moduleFile=path.resolve(__dirname,'../../assets/_script/NavigationGrid');
 const code=`const {NavigationGrid}=require(${JSON.stringify(moduleFile)});const n=1e19,d=4096;const g=new NavigationGrid([[{x:n,y:n},{x:n+d,y:n},{x:n+d,y:n+d},{x:n,y:n+d}]],{minX:n,minY:n,maxX:n+d,maxY:n+d},20);console.log(g._index.size);`;
 // Concurrent Windows checks can delay child startup; retain a finite hang guard.
 const result=cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:30000,windowsHide:true});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert(Number(result.stdout)>0&&Number(result.stdout)<2048);
 const tiny=new NavigationGrid([],{minX:0,minY:0,maxX:1e-200,maxY:1e-200},1e200);assert.equal(tiny.count,1);assert.equal(tiny.columns,1);assert.equal(tiny.rows,1);
});

test('bodies that cannot fit inside the map allocate no search or passage caches',()=>{
 const grid=new NavigationGrid([box(-5,-10,5,10)],bounds,10,[box(-20,-20,20,20)]);assert.equal(grid.findPath({x:0,y:0},{x:50,y:50},101,true),null);assert.equal(grid._caches.size,0);assert.equal(grid.lastSearch.expanded,0);
});

test('query generation wrap preserves deduplication and outside-map polygon checks',()=>{
 const grid=new NavigationGrid([box(-80,-80,80,80),box(-30,-30,30,30),box(-150,-20,-90,20)],bounds,10),expected=grid._query(-90,-90,90,90);grid._querySerial=4294967294;assert.deepEqual(grid._query(-90,-90,90,90),expected);assert.equal(new Set(expected).size,expected.length);assert.equal(grid._querySerial,1);assert.deepEqual(grid._query(-200,-20,-120,20),[2]);assert.deepEqual(grid._query(-90,-90,90,90),expected);
});

test('indexed clearance agrees with a full polygon scan at negative, shifted and off-map coordinates',()=>{
 const rng=random();let compared=0;
 for(const shift of [0,-3000,1e12])for(let scene=0;scene<4;scene++){
  const b={minX:shift-300,minY:shift-300,maxX:shift+300,maxY:shift+300},polygons=[];for(let i=0;i<20;i++){const x=shift-330+rng()*640,y=shift-330+rng()*640;polygons.push(box(x,y,x+5+rng()*90,y+5+rng()*90));}
  const indexed=new NavigationGrid(polygons,b,20),scanned=new NavigationGrid(polygons,b,20);scanned._query=()=>scanned.polygons.map((_,i)=>i);
  for(let i=0;i<250;i++){const a={x:shift-320+rng()*640,y:shift-320+rng()*640},z={x:shift-320+rng()*640,y:shift-320+rng()*640},r=[0,8,24][i%3];assert.equal(indexed.isWalkable(a,r),scanned.isWalkable(a,r));assert.equal(indexed.segmentClear(a,z,r),scanned.segmentClear(a,z,r));compared+=2;}
 }
 assert.equal(compared,6000);
});

test('A* does not miss any reachable reference-lattice route and every returned shortcut remains clear',()=>{
 const rng=random(82),b={minX:0,minY:0,maxX:240,maxY:240},size=20,columns=12;
 for(let scene=0;scene<30;scene++){
  const polygons=[];for(let i=0;i<10;i++){const x=20+rng()*180,y=20+rng()*180;polygons.push(box(x,y,x+5+rng()*35,y+5+rng()*35));}
  const grid=new NavigationGrid(polygons,b,size),oracle=new NavigationGrid(polygons,b,size);oracle._query=()=>oracle.polygons.map((_,i)=>i);const r=scene%2?5:0,center=id=>({x:id%columns*size+size/2,y:Math.floor(id/columns)*size+size/2}),free=[];
  for(let id=0;id<144;id++)if(oracle.isWalkable(center(id),r))free.push(id);
  const start=free[Math.floor(rng()*free.length)],goal=free[Math.floor(rng()*free.length)],queue=[start],seen=new Set(queue);
  for(let at=0;at<queue.length;at++){const id=queue[at],x=id%columns,y=Math.floor(id/columns);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy||x+dx<0||x+dx>=columns||y+dy<0||y+dy>=columns)continue;const next=id+dy*columns+dx;if(seen.has(next)||!oracle.isWalkable(center(next),r))continue;if(dx&&dy&&(!oracle.isWalkable(center(id+dx),r)||!oracle.isWalkable(center(id+dy*columns),r)))continue;if(!oracle.segmentClear(center(id),center(next),r))continue;seen.add(next);queue.push(next);}}
  const plan=grid.findPath(center(start),center(goal),r);if(seen.has(goal))assert(plan&&plan.reached,'Reachable reference route was missed in scene '+scene);if(plan){safe(oracle,plan,r);assert(plan.reached);}
 }
});
