'use strict';
// Read authored prefabs only: exported coordinates are relative to each map root.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'fixtures');
const MapCatalog=require('../../packages/game-data-editor/lib/map-catalog');
const OBSTACLE=require('../../packages/game-data-editor/lib/map-assets').OBSTACLE;
function extract(file){
  const a=JSON.parse(fs.readFileSync(file,'utf8')),nodes=a.map((v,i)=>({v,i})).filter(x=>x.v&&x.v.__type__==='cc.Node');
  function mat(i){const n=a[i],v=n._trs&&n._trs.array||[0,0,0,0,0,0,1,1,1,1];const z=v[5],w=v[6],c=1-2*z*z,s=2*w*z;let m=[c*v[7],s*v[7],-s*v[8],c*v[8],v[0],v[1]];if(n._parent){const q=mat(n._parent.__id__);m=[q[0]*m[0]+q[2]*m[1],q[1]*m[0]+q[3]*m[1],q[0]*m[2]+q[2]*m[3],q[1]*m[2]+q[3]*m[3],q[0]*m[4]+q[2]*m[5]+q[4],q[1]*m[4]+q[3]*m[5]+q[5]];}return m;}
  const point=(i,p={x:0,y:0})=>{const m=mat(i);return{x:m[0]*(p.x||0)+m[2]*(p.y||0)+m[4],y:m[1]*(p.x||0)+m[3]*(p.y||0)+m[5]};};
  const components=n=>(n._components||[]).map(r=>a[r.__id__]).filter(Boolean);
  function active(i){return a[i]._active!==false&&(!a[i]._parent||active(a[i]._parent.__id__));}
  function polygons(i){return components(a[i]).filter(c=>c.__type__==='cc.PhysicsPolygonCollider'&&c._enabled!==false&&!c.sensor).map(c=>c.points.map(p=>point(i,{x:p.x+(c._offset?.x||0),y:p.y+(c._offset?.y||0)})));}
  const bg=nodes.find(x=>x.v._name==='ndBg');const size=bg.v._contentSize;
  const routes=nodes.filter(x=>/^Path/.test(x.v._name)).map(({v,i})=>{const c=components(v).find(c=>Array.isArray(c.ndLockList))||{};return{name:v._name,index:i,spawns:c.ndLockList||[],buildings:c.ndBuildList||[],points:(v._children||[]).map(r=>point(r.__id__))};});
  const obstacles=nodes.filter(x=>active(x.i)&&components(x.v).some(c=>c.__type__===OBSTACLE)&&polygons(x.i).length).map(({v,i})=>({name:v._name,index:i,position:point(i),polygons:polygons(i)}));
  const buildings=nodes.filter(x=>/^\d+-/.test(x.v._name)).map(({v,i})=>({name:v._name,index:i,position:point(i),polygons:polygons(i),body:components(v).find(c=>c.__type__==='cc.RigidBody'),visuals:(v._children||[]).map(r=>({name:a[r.__id__]._name,index:r.__id__,position:point(r.__id__)}))}));
  return{map:a[0]._name,source:path.relative(root,file).replace(/\\/g,'/'),coordinateSpace:'authored map root; no runtime physics or canvas shift applied',bounds:{minX:-size.width/2,minY:-size.height/2,maxX:size.width/2,maxY:size.height/2},obstacles,routes,spawns:nodes.filter(x=>/^ndEnemy\d+$/.test(x.v._name)).map(x=>({name:x.v._name,position:point(x.i)})),hero:point(nodes.find(x=>x.v._name==='ndStar').i),buildings};
}
function main(){
fs.mkdirSync(out,{recursive:true});
const summary=[],selected=process.argv.includes('--map')?process.argv[process.argv.indexOf('--map')+1]:null;
if(selected&&!MapCatalog.has(selected))throw Error('Unknown authored map '+selected);
for(const name of selected?[selected]:MapCatalog.IDS){
  const fixture=extract(path.join(root,'assets/KinghtFallIconMap',name+'.prefab'));
  fs.writeFileSync(path.join(out,name.toLowerCase()+'-authored.json'),JSON.stringify(fixture,null,2)+'\n');
  summary.push({map:name,terrain:fixture.obstacles.length,polygons:fixture.obstacles.reduce((n,o)=>n+o.polygons.length,0),routes:fixture.routes.length,spawns:fixture.spawns.length,buildings:fixture.buildings.length,bounds:fixture.bounds});
}
if(selected){console.log(JSON.stringify({maps:summary}));return;}
const units=[];
for(const filename of fs.readdirSync(path.join(root,'assets/KinghtFallEnemy')).filter(f=>f.endsWith('.prefab'))){
  const a=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallEnemy',filename),'utf8'));
  for(const [i,c] of a.entries())if(/^cc.Physics(Circle|Box|Polygon)Collider$/.test(c.__type__||'')&&c._enabled!==false&&!c.sensor){const n=a[c.node.__id__],scale=n._trs?.array?.slice(7,9)||[1,1];units.push({file:filename,node:n._name,type:c.__type__,radius:c._radius||c.radius,points:c.points,boundingRadius:c.points?Math.max(...c.points.map(p=>Math.hypot((p.x+(c._offset?.x||0))*scale[0],(p.y+(c._offset?.y||0))*scale[1]))):undefined,size:c._size||c.size,offset:c._offset||{x:0,y:0},scale});}
}
fs.writeFileSync(path.join(out,'unit-colliders.json'),JSON.stringify(units,null,2)+'\n');
console.log(JSON.stringify({maps:summary,unitColliders:units},null,2));
}
module.exports={extract};
if(require.main===module)main();
