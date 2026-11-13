'use strict';
// Preview labels only. The saved shape and the original instance indices stay intact.
const Maps=require('../lib/map-assets');
const names={gate:'Gate opening',pillar:'Pillars (upright posts)',span:'Wall sections (between posts)'};
function title(part){return names[part.key]||part.label;}
function entries(part,parts){
 if(!part||!names[part.key])return [];
 const center=part.key==='span'?{x:-22.5,y:15}:{x:0,y:0};
 const result=part.instances.map((m,index)=>Object.assign({index},Maps.point(m,center))).sort((a,b)=>a.x-b.x||a.y-b.y||a.index-b.index);
 const gate=parts.find(p=>p.key==='gate'),origin=gate&&gate.instances[0]?Maps.point(gate.instances[0],{x:0,y:0}):{x:result.reduce((s,p)=>s+p.x,0)/result.length,y:result.reduce((s,p)=>s+p.y,0)/result.length};
 const sides=[result.filter(p=>p.x<origin.x),result.filter(p=>p.x>=origin.x)];
 return result.map((p,i)=>{
  const id=(part.key==='pillar'?'P':part.key==='span'?'W':'G')+(i+1);
  if(part.key==='gate')return Object.assign(p,{id,label:id+' · Gate opening'});
  const side=sides[p.x<origin.x?0:1].slice().sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
  const direction=(p.y>=origin.y?'Upper':'Lower')+'-'+(p.x<origin.x?'left':'right');
  const where=p===side[0]?(part.key==='pillar'?'gate post':'gate-side section'):p===side[side.length-1]?(part.key==='pillar'?'end post':'outer section'):(part.key==='pillar'?'middle post':'middle section');
  return Object.assign(p,{id,label:id+' · '+direction+' '+where});
 });
}
function explain(part,parts,index,layer){
 const selected=entries(part,parts).find(p=>p.index===index);if(!selected)return '';
 const definition=part.key==='pillar'?'Upright posts.':part.key==='span'?'Short fence sections between posts.':'The central opening between the two gate posts.';
 return 'Selected '+selected.label+'. '+definition+' '+(part.instances.length>1?'All '+part.instances.length+' copies share this '+(layer==='shadow'?'shadow':'blocker')+' shape. Click a numbered marker to choose the preview copy.':'');
}
function badges(part,parts,view){return entries(part,parts).map(p=>Object.assign({},p,{x:view.width/2+(p.x-view.cx)*view.scale,y:view.height/2-(p.y-view.cy)*view.scale+28}));}
function hit(part,parts,view,point){const p=badges(part,parts,view).find(p=>Math.hypot(point.x-p.x,point.y-p.y)<=14);return p?p.index:null;}
function draw(ctx,part,parts,index,view){
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.font='bold 11px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const p of badges(part,parts,view)){
  const selected=p.index===index;ctx.strokeStyle=selected?'#74edff':'#d8e4e0';ctx.lineWidth=selected?2:1;ctx.beginPath();ctx.moveTo(p.x,p.y-28);ctx.lineTo(p.x,p.y-12);ctx.stroke();
  if(selected){ctx.beginPath();ctx.ellipse(p.x,p.y-28,10,5,0,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.fillStyle=selected?'#74edff':'#263b39';ctx.fill();ctx.stroke();ctx.fillStyle=selected?'#132b32':'#f0faf6';ctx.fillText(p.id,p.x,p.y+.5);
 }
 ctx.restore();
}
module.exports={title,entries,explain,draw,hit};
