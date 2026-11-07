'use strict';
const fs=require('fs'),path=require('path');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid.js');
const results=[];
for(let id=1;id<=4;id++){
  const f=require('./fixtures/map0'+id+'-authored.json');
  const grid=new NavigationGrid(f.obstacles.flatMap(o=>o.polygons),f.bounds,20);
  const row={map:f.map,bounds:f.bounds,tests:[],blockedPoints:[],directSegmentsBlocked:[]};
  for(const radius of [16,20,30]){
    let segments=0,blockedDirect=0,solved=0,missing=0,adjustedGoals=0;
    for(const [routeIndex,route]of f.routes.entries()){
      route.points.forEach((point,i)=>{if(!grid.isWalkable(point,radius))row.blockedPoints.push({routeIndex,name:route.name,pointIndex:i,radius,point});});
      const starts=route.spawns.map(n=>f.spawns.find(s=>s.name==='ndEnemy'+n)?.position).filter(Boolean);
      const pairs=starts.map(p=>[p,route.points[0],-1]).concat(route.points.slice(1).map((p,i)=>[route.points[i],p,i]));
      for(const [from,to,segmentIndex]of pairs){
        segments++;
        if(!grid.segmentClear(from,to,radius)){blockedDirect++;row.directSegmentsBlocked.push({routeIndex,name:route.name,segmentIndex,radius,from,to});}
        const plan=grid.findPath(from,to,radius);
        if(plan){solved++;if(Math.hypot(plan.goal.x-to.x,plan.goal.y-to.y)>1)adjustedGoals++;}else missing++;
      }
    }
    row.tests.push({radius,segments,blockedDirect,solved,missing,adjustedGoals});
  }
  results.push(row);
}
const report=require('../testing/artifact-paths.cjs').reportPath('audit','authored-route-audit.json');
fs.mkdirSync(path.dirname(report),{recursive:true});
fs.writeFileSync(report,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(x=>({map:x.map,tests:x.tests,blockedPointCount:x.blockedPoints.length})),null,2));
if(results.some(map=>map.tests.some(result=>result.missing>0||result.segments===0)))process.exitCode=1;
