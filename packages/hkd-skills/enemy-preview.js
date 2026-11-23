'use strict';

const Renderer=require('../game-data-editor/preview/spine-renderer');
const Visuals=require('../../assets/_script/EnemySkillVisuals');
const castAt=.4;

function clipInfo(layers,name,playback=1) {
  const layer=layers[0];
  if(!layer)return {name:'',duration:0};
  const fallback=layer.description.animation;
  const clip=(name&&layer.data.findAnimation(name))||(fallback&&layer.data.findAnimation(fallback));
  return {name:clip?.name||'',duration:(clip?.duration||0)/playback};
}

function rgb(hex) {
  return [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255);
}

function tint(layers,color) {
  for(const layer of layers){
    layer.skeleton.color?.set(...rgb(color||layer.description.tint||'#ffffff'),1);
  }
}

function placeEffect(layer,visual,anchor=[1,0,0,1]) {
  const angle=visual.rotation*Math.PI/180,c=Math.cos(angle)*visual.scale,s=Math.sin(angle)*visual.scale;
  const [xx,xy,yx,yy]=anchor,x=visual.offsetX,y=visual.offsetY;
  Object.assign(layer.description,{x,y,opacity:visual.opacity,
    matrix:[xx*c+yx*s,xy*c+yy*s,yx*c-xx*s,yy*c-xy*s,xx*x+yx*y,xy*x+yy*y]});
}

function includeIndicator(box,pose,padding) {
  const radius=Visuals.indicatorSize*pose.scale/2+padding;
  const minX=Math.min(box.minX,pose.x-radius),maxX=Math.max(box.maxX,pose.x+radius);
  const minY=Math.min(box.minY,pose.y-radius),maxY=Math.max(box.maxY,pose.y+radius);
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}

function create(host,options) {
  const renderer=options.renderer||Renderer,doc=host.ownerDocument||document;
  const canvas=doc.createElement('canvas');
  canvas.style.cssText='display:block;width:100%;height:100%';
  canvas.setAttribute('aria-label','Enemy skill effect preview');
  host.appendChild(canvas);
  let assets=null,request=0,disposed=false,rig=null,loading=null,spine=null,visual={},fitted=null;
  let indicatorCanvas=null;
  let time=0,duration=2,playing=true,scenario={speed:1,repeat:true},frame=null,previous=null;
  const status=error=>options.onStatus?.({playing,time,duration,cast:time>=castAt,error});
  const showsIndicator=()=>assets.indicator&&visual.showIndicator&&visual.indicatorOpacity;

  function drawIndicator(pose,viewport,scale) {
    if(!pose){
      if(indicatorCanvas)indicatorCanvas.hidden=true;
      return;
    }
    if(!indicatorCanvas){
      indicatorCanvas=doc.createElement('canvas');
      indicatorCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      indicatorCanvas.setAttribute('aria-hidden','true');
      host.appendChild(indicatorCanvas);
    }
    indicatorCanvas.hidden=false;
    const {width,height,bounds,panY}=viewport;
    if(indicatorCanvas.width!==width)indicatorCanvas.width=width;
    if(indicatorCanvas.height!==height)indicatorCanvas.height=height;
    const ctx=indicatorCanvas.getContext('2d'),size=Visuals.indicatorSize;
    const [r,g,b]=rgb(visual.indicatorColor);
    const image=renderer.tintedImage(assets.indicator,{r,g,b});
    ctx.clearRect(0,0,width,height);
    ctx.save();
    ctx.translate(width/2-(bounds.minX+bounds.maxX)/2*scale,height-12+bounds.minY*scale+panY);
    ctx.scale(scale,-scale);
    // Body bounds and the icon's offset already share the preview's battle coordinates.
    ctx.translate(pose.x,pose.y);
    ctx.scale(pose.scale,-pose.scale);
    ctx.globalAlpha=pose.opacity;
    ctx.drawImage(image,-size/2,-size/2,size,size);
    ctx.restore();
  }

  function draw() {
    if(!assets||disposed)return;
    const age=time-castAt,active=age>=0,transformed=active&&assets.form.length&&(rig.skill!=='polymorph'||age<assets.duration);
    const body=transformed?assets.form:assets.unit;
    renderer.seek(spine,body,'idle',time,true);
    tint(body,active&&age<assets.duration&&visual.showBuiltin&&visual.tint);
    const layers=body.slice();
    if(active&&visual.showBuiltin&&assets.builtin.length){
      const healing=rig.skill==='heal'&&Visuals.healingEffect;
      const clip=clipInfo(assets.builtin,healing&&healing.resourceAnimation);
      if(age<(healing?clip.duration:assets.duration)){
        if(healing)placeEffect(assets.builtin[0],healing,rig.effectAnchor);
        renderer.seek(spine,assets.builtin,clip.name,age,!healing);
        layers.push(...assets.builtin);
      }
    }
    const effect=clipInfo(assets.effect,visual.resourceAnimation,visual.playback);
    if(active&&age<effect.duration){
      placeEffect(assets.effect[0],visual,(transformed?rig.nextForm:rig).effectAnchor);
      renderer.seek(spine,assets.effect,effect.name,age*visual.playback,false);
      tint(assets.effect,visual.color);
      layers.push(...assets.effect);
    }
    const width=Math.max(64,Math.round(host.clientWidth)),height=Math.max(64,Math.round(host.clientHeight));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const pose=showsIndicator()&&active&&age<assets.duration
      ? Visuals.indicatorPose(rig.skill,visual,age,renderer.bounds(spine,body)) : null;
    let bounds=fitted||measure();
    if(pose)bounds=includeIndicator(bounds,pose,12);
    const scale=Math.min((width-32)/bounds.width,(height-24)/bounds.height);
    const viewport={width,height,bounds,panY:-(height-24-bounds.height*scale)/2};
    renderer.drawCanvas(spine,canvas,layers,viewport);
    drawIndicator(pose,viewport,scale);
  }

  function measure() {
    const body=assets.unit.concat(assets.form);
    let box=renderer.bounds(spine,body);
    if(showsIndicator())box=includeIndicator(box,Visuals.indicatorPose(rig.skill,visual,0,box),Visuals.indicatorSize*.2*visual.indicatorScale+3);
    let {minX,minY,maxX,maxY}=box;
    const healing=visual.showBuiltin&&rig.skill==='heal'&&Visuals.healingEffect;
    for(const [layers,settings] of [[assets.builtin,healing],[assets.effect,visual]]){
      if(!settings||!layers.length)continue;
      const clip=clipInfo(layers,settings.resourceAnimation);
      placeEffect(layers[0],settings,(rig.nextForm||rig).effectAnchor);
      renderer.seek(spine,layers,clip.name,clip.duration*.5,false);
      const overlay=renderer.bounds(spine,layers);
      minX=Math.min(minX,overlay.minX);minY=Math.min(minY,overlay.minY);
      maxX=Math.max(maxX,overlay.maxX);maxY=Math.max(maxY,overlay.maxY);
    }
    minX-=20;maxX+=20;minY-=20;maxY+=20;
    return {minX,minY,maxX,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
  }

  function stopFrame(){if(frame!==null)cancelAnimationFrame(frame);frame=null;previous=null;}
  function tick(stamp){
    frame=null;
    if(!playing||disposed)return;
    if(previous!==null)time+=Math.min(.1,(stamp-previous)/1000)*scenario.speed;
    previous=stamp;
    if(time>=duration){if(scenario.repeat)time=0;else{time=duration;playing=false;}}
    try { draw();status();schedule(); }
    catch(error) { playing=false;stopFrame();status(error.message); }
  }
  function schedule(){if(assets&&playing&&frame===null&&!disposed)frame=requestAnimationFrame(tick);}
  function seek(value){time=Math.min(duration,Math.max(0,value));draw();status();}
  function play(value){playing=!!value;stopFrame();if(playing&&time>=duration)time=0;draw();status();schedule();}
  function fit(){if(!assets)return;fitted=measure();draw();}
  const restart=()=>{time=0;play(true);};

  async function set({settings,description}) {
    visual=settings.visual||{};
    if(rig!==description){
      rig=description;assets=null;fitted=null;stopFrame();
      if(indicatorCanvas)indicatorCanvas.hidden=true;
      const token=++request;
      loading=(async()=>{
        const runtime=options.runtime(description);
        const layers=[description,description.nextForm,description.builtin,description.effect]
          .map(item=>item?renderer.createLayers(runtime,item.layers.map(layer=>({...layer}))):[]);
        const [unit,form,builtin,effect,indicator]=await Promise.all([...layers,description.indicator&&renderer.loadImage(description.indicator)]);
        if(disposed||token!==request)return;
        spine=runtime;
        assets={unit,form,builtin,effect,indicator,duration:description.duration};
        time=0;fitted=measure();
      })();
    }
    const token=request;
    try { await loading; } catch(error){if(!disposed&&token===request){rig=null;status(error.message);}return;}
    if(disposed||token!==request||!assets)return;
    duration=castAt+Math.max(1,assets.duration,clipInfo(assets.builtin).duration,
      clipInfo(assets.effect,visual.resourceAnimation,visual.playback).duration)+.4;
    seek(time);schedule();
  }

  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>draw()):null;
  if(observer)observer.observe(host);
  return {set,setScenario(value){Object.assign(scenario,value);},play,seek,step(delta){play(false);seek(time+delta);},
    cast:restart,restart,fit,destroy(){disposed=true;request++;stopFrame();observer?.disconnect();renderer.destroyCanvas(canvas);canvas.remove();indicatorCanvas?.remove();}};
}

module.exports={create};
