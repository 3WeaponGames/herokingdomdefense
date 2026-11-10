'use strict';
const Units=require('../../game-data-editor/lib/unit-assets');
const clone=value=>JSON.parse(JSON.stringify(value));
function skeleton(spine,rig){
  const copy=clone(rig);copy.slots=[];copy.skins=[{name:'default',attachments:{}}];
  for(const clip of Object.values(copy.animations)){delete clip.slots;delete clip.deform;delete clip.drawOrder;}
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas('',()=>null))).readSkeletonData(copy);
  return {data,pose:new spine.Skeleton(data)};
}
// Preserve the original horse's legs, neck, meshes and timing. Correct only
// whole-horse travel so its saddle performs the cavalry's preparation, lunge
// and recovery at the same phase and relative scale as the Maker rider.
function synchronize(horse,cavalry,scale){
  const spine=require(Units.enginePath()),actual=skeleton(spine,horse),reference=skeleton(spine,cavalry),root=horse.bones.find(b=>!b.parent);
  function sample(model,name,time){model.pose.setToSetupPose();model.data.findAnimation(name).apply(model.pose,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);model.pose.updateWorldTransform();const saddle=model.pose.findBone('bone2'),bone=model.pose.findBone(root.name);return{x:saddle.worldX,y:saddle.worldY,rootX:bone.x-bone.data.x,rootY:bone.y-bone.data.y};}
  for(const [name,clip]of Object.entries(horse.animations)){
    if(!/^attack(?:_|$)/.test(name))continue;
    const end=Number(actual.data.findAnimation(name).duration.toFixed(7)),sourceEnd=Number(reference.data.findAnimation('attack').duration.toFixed(7)),split=name==='attack'?.95:7/6,release=.1667,times=new Set([0,release,end]);
    const toReference=time=>time<=release?time/release*split:split+(time-release)/(end-release)*(sourceEnd-split);
    const fromReference=time=>time<=split?time/split*release:release+(time-split)/(sourceEnd-split)*(end-release);
    const collect=(value,map)=>{if(!value||typeof value!=='object')return;if(typeof value.time==='number')times.add(Number(map(value.time).toFixed(7)));Object.values(value).forEach(child=>collect(child,map));};
    collect(clip,time=>time);collect(cavalry.animations.attack,fromReference);for(let t=0;t<end;t+=1/120)times.add(Number(t.toFixed(7)));
    const first=sample(actual,name,0),origin=sample(reference,'attack',0),frames=[],cache=new Map();
    function value(time){
      if(cache.has(time))return cache.get(time);
      const own=sample(actual,name,time),target=sample(reference,'attack',toReference(time));
      const frame={time,x:Number((own.rootX+(target.x-origin.x)*scale-(own.x-first.x)).toFixed(7)),y:Number((own.rootY+(target.y-origin.y)*scale-(own.y-first.y)).toFixed(7))};cache.set(time,frame);return frame;
    }
    // Preserve fast, curved preparations when this clip is stretched back
    // onto the library mount clock, rather than undersampling the lunge.
    function segment(a,b,depth){
      const left=value(a),right=value(b),error=[.25,.5,.75].some(fraction=>{const time=Number((a+(b-a)*fraction).toFixed(7)),point=value(time);return Math.max(...['x','y'].map(axis=>Math.abs(point[axis]-(left[axis]+(right[axis]-left[axis])*fraction))))>.005;});
      if(error&&depth<12&&b-a>.000002){const middle=Number(((a+b)/2).toFixed(7));segment(a,middle,depth+1);segment(middle,b,depth+1);}else frames.push(left);
    }
    const ordered=[...times].sort((a,b)=>a-b);for(let i=1;i<ordered.length;i++)segment(ordered[i-1],ordered[i],0);frames.push(value(end));
    (clip.bones[root.name]||(clip.bones[root.name]={})).translate=frames;
  }
}
module.exports={synchronize};
