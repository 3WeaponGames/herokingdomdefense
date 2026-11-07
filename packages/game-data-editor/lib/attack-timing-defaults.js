'use strict';
const fs=require('fs'),path=require('path');

// These are authored reference times, not gameplay callbacks. Reading or
// previewing them never writes configuration or changes a player.
function fromLayers(layers){
    const timingEvents=[];
    (layers||[]).forEach(layer=>{
        const animation=layer.json&&layer.json.animations&&layer.json.animations.attack;
        ((animation&&animation.events)||[]).forEach(event=>{
            const time=event.time===undefined?0:event.time;
            if(typeof time==='number'&&Number.isFinite(time)&&time>=0)timingEvents.push({name:event.name,time,source:layer.source,layer:layer.name});
        });
    });
    const attacks=timingEvents.filter(event=>event.name==='attack');
    const times=Array.from(new Set(attacks.map(event=>event.time))).sort((a,b)=>a-b);
    if(times.length!==1)return {defaultTiming:null,timingDefaultSource:times.length?'Multiple distinct attack events; choose a timing explicitly.':'No authored attack event.',timingEvents};
    return {defaultTiming:times[0],timingDefaultSource:'Authored attack event',timingEvents};
}

function collect(root,documents){
    const cfg=documents&&documents.A?documents.A.data:JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8').replace(/^\uFEFF/,''));
    // Lazy import keeps describe() able to use the pure layer resolver above.
    const Assets=require('./unit-assets'),result={};
    const requests=[{type:'hero',id:'hero'}]
        .concat(Object.keys(cfg.SoldierCfg).sort((a,b)=>Number(a)-Number(b)).map(id=>({type:'enemy',id})))
        .concat([90001,90002,90003,90004].map(id=>({type:'ally',id})));
    requests.forEach(request=>{
        const description=Assets.describe(root,Object.assign({},request,{documents,noRuntime:true}));
        if(typeof description.defaultTiming!=='number')throw Error('Cannot apply a default for '+description.key+': '+description.timingDefaultSource);
        result[description.key]={attack:description.defaultTiming};
    });
    return result;
}

module.exports={fromLayers,collect};
