'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.style={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
    appendChild(child){this.children.push(child);child.parentNode=this;return child;}
    removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;return child;}
    remove(){if(this.parentNode)this.parentNode.removeChild(this);}
    setAttribute(name,value){this[name]=String(value);}
    set innerHTML(value){assert.equal(value,'');this.children=[];}
    querySelector(tag){return all(this,n=>n!==this&&n.tagName===tag)[0]||null;}
}
function all(root,match){const found=[];function visit(node){if(match(node))found.push(node);node.children.forEach(visit);}visit(root);return found;}
const button=(root,text)=>all(root,n=>n.tagName==='button'&&n.textContent===text)[0];
const field=(root,label)=>all(root,n=>n.tagName==='label'&&n.textContent===label)[0].children[0];
const clone=value=>JSON.parse(JSON.stringify(value));
const source=fs.readFileSync(path.join(__dirname,'../preview/client.js'),'utf8');
const runtime={exports:{},require(name){if(name==='./spine-renderer')return {
    createLayers:async(_spine,layers)=>layers.map(description=>({description,data:{findAnimation:name=>({duration:name==='attack'?description.attackDuration||1:1}),findSkin:()=>true},skeleton:{setSkinByName(){},color:{set(){}}}})),
    seek(){},bounds(){return{width:1,height:1};},drawCanvas(){},destroyCanvas(){}
};if(name==='./projectile')return{simulate:()=>null};if(name==='./building-artwork'){const child=Object.assign({},runtime,{module:{exports:{}}});vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/building-artwork.js'),'utf8'),child);return child.module.exports;}if(name==='fixture-spine')return{};return require(name);},document:{createElement:tag=>new Element(tag)},requestAnimationFrame(){throw Error('Playback was not requested');},cancelAnimationFrame(){},__dirname:path.join(__dirname,'../preview'),isFinite};
runtime.module={exports:{}};vm.runInNewContext(source,runtime,{filename:'preview/client.js'});const Client=runtime.module.exports;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options){
    options=options||{};const root=new Element('div'),edits=[],requests=[],metrics=[],type=options.type||'enemy',id=String(options.id||90001);
    const description={type,id,form:'default',key:type+':'+id+':default',effect:'Melee hit',defaultTiming:.4,runtimePath:'fixture-spine',shared:[],layers:[{animations:['idle','attack'],skins:['default'],skin:'default',json:{animations:{attack:{events:[{name:'attack',time:.4}]}}}}]};
    if(type==='ally')description.levels=[1,2,3];
    if(options.pack)description.layers[0].json._fantasy={pack:options.pack};
    if(options.unitAnimationSpeed!==undefined)description.unitAnimationSpeed=options.unitAnimationSpeed;
    if(options.events!==undefined){description.layers[0].json.animations.attack.events=options.events;description.defaultTiming=null;description.timingDefaultSource='No authored attack event.';}
    const request={type,id,record:Object.assign({ID:Number(id),AttackInterval:options.rate===undefined?1:options.rate},options.record),documents:{overrides:{data:{timings:{},timingDefaults:{}}}}};
    if(options.duration!==undefined)description.layers[0].attackDuration=options.duration;
    if(options.speeds)request.documents.overrides.data.animationSpeeds=clone(options.speeds);
    if(options.level!==undefined)request.level=options.level;
    if(options.default!==undefined)request.documents.overrides.data.timingDefaults[description.key]={attack:options.default};
    if(options.custom!==undefined)request.documents.overrides.data.timings[description.key]={attack:options.custom};
    const before=clone(description),client=Client.mount(root,{ipc:async(_message,payload)=>{requests.push(clone(payload));return description;},onChange:value=>edits.push(clone(value)),onAttackMetrics:value=>metrics.push(clone(value))});client.setUnit(request);
    return{root,edits,requests,metrics,description,before,request,client};
}
async function main(){
    let checks=0;async function test(name,body){await body();console.log('PASS '+name);checks++;}
    await test('Fantasy Boss previews inherit 0.25 attack speed and metrics without writing an override',async()=>{
        const f=fixture({pack:'fantasy-bosses',default:.52});await flush();assert.equal(f.client.getState().attackSpeed,.25);assert.equal(f.client.getState().attackMetrics.animationSpeed,.25);assert.equal(f.edits.length,0);assert.equal(field(f.root,'Attack animation speed (saved)').value,.25);f.client.destroy();
    });
    await test('Fantasy Monsters previews inherit 0.35 attack speed and metrics without writing an override',async()=>{
        const f=fixture({pack:'fantasy-monsters',default:.6});await flush();assert.equal(f.client.getState().attackSpeed,.35);assert.equal(f.client.getState().attackMetrics.animationSpeed,.35);assert.equal(f.edits.length,0);f.client.destroy();
    });
    await test('saved Characters playback controls the preview and metrics while legacy attack edits remain inactive',async()=>{
        const f=fixture({pack:'fantasy-bosses',unitAnimationSpeed:.5,default:.5,speeds:{'enemy:90001:default':2}});await flush();
        assert.equal(f.client.getState().attackSpeed,.125);assert.equal(f.client.getState().attackMetrics.animationSpeed,.125);assert.equal(f.client.getState().attackMetrics.unitAnimationSpeed,.5);const saved=field(f.root,'Attack animation speed (saved)');assert(saved.disabled);assert(button(f.root,'Reset attack speed').disabled);saved.value=3;saved.onchange();assert.equal(saved.value,.125);assert.equal(f.edits.length,0);assert(all(f.root,n=>n.tagName==='p'&&n.textContent.includes('Characters sets this unit to 50%')).length);f.client.destroy();
    });
    await test('saved zero playback reports a finite frozen rate without invalid release calculations or writes',async()=>{
        const f=fixture({pack:'fantasy-monsters',unitAnimationSpeed:0,default:.5});await flush();const state=f.client.getState();assert.equal(state.attackSpeed,0);assert.equal(state.attackMetrics.rate,0);assert.equal(state.attackMetrics.paused,true);assert(!all(f.root,n=>typeof n.textContent==='string'&&/Infinity|NaN/.test(n.textContent)).length);assert.equal(f.edits.length,0);assert(all(f.root,n=>n.tagName==='p'&&n.textContent.includes('animation is frozen in Characters')).length);f.client.destroy();
    });
    await test('saved whole-unit playback scales both attack and idle clocks, including a frozen zero',async()=>{
        const originalFrame=runtime.requestAnimationFrame,originalCancel=runtime.cancelAnimationFrame,scheduled=new Map();let id=0;
        runtime.requestAnimationFrame=callback=>{scheduled.set(++id,callback);return id;};runtime.cancelAnimationFrame=key=>scheduled.delete(key);
        const tick=stamp=>{const callbacks=[...scheduled.values()];scheduled.clear();callbacks.forEach(callback=>callback(stamp));};
        try{for(const relative of [.5,0]){const f=fixture({pack:'fantasy-bosses',unitAnimationSpeed:relative});try{await flush();f.client.togglePlayback();tick(1000);tick(2000);assert.equal(f.client.getState().time,.25*relative);const animation=field(f.root,'Animation');animation.value='idle';animation.onchange();f.client.togglePlayback();tick(3000);tick(4000);assert.equal(f.client.getState().time,.25*relative);assert.equal(f.edits.length,0);}finally{f.client.destroy();}}}
        finally{runtime.requestAnimationFrame=originalFrame;runtime.cancelAnimationFrame=originalCancel;}
    });
    await test('opening uses the saved default for gold and leaves animation reference green without edits',async()=>{
        const f=fixture({default:.5});await flush();assert.equal(f.client.getState().effect,.5);assert.equal(f.edits.length,0);
        const active=all(f.root,n=>n.className==='preview-marker active'),references=all(f.root,n=>n.className==='preview-marker reference');
        assert.equal(active.length,1);assert.equal(active[0].style.left,'50%');assert.equal(references[0].style.left,'40%');
        assert(active[0].title.includes('active gold marker'));assert(references[0].title.includes('original animation reference'));
        assert.equal(all(f.root,n=>/preview-marker (original|gameplay)/.test(n.className||'')).length,0);f.client.destroy();
    });
    await test('eventless imported rigs show saved gameplay timing without inventing an animation reference',async()=>{
        const f=fixture({default:.5,events:[]});await flush();assert.equal(f.client.getState().effect,.5);assert.equal(f.edits.length,0);
        assert.equal(all(f.root,n=>n.className==='preview-marker reference').length,0);
        assert.equal(all(f.root,n=>n.className==='preview-marker active')[0].style.left,'50%');
        assert.deepStrictEqual(f.description,f.before);f.client.destroy();
    });
    await test('Use current frame moves only active gold and creates a scoped draft',async()=>{
        const f=fixture({default:.5});await flush();const seconds=field(f.root,'Position (seconds)');seconds.value=.65;seconds.onchange();assert.equal(f.edits.length,0);
        button(f.root,'Use current frame').onclick();assert.equal(f.client.getState().effect,.65);
        assert.deepStrictEqual(f.edits,[[{doc:'overrides',path:['timings','enemy:90001:default'],value:{attack:.65}}]]);
        assert.equal(all(f.root,n=>n.className==='preview-marker active')[0].style.left,'65%');assert.equal(all(f.root,n=>n.className==='preview-marker reference')[0].style.left,'40%');
        assert.deepStrictEqual(f.description,f.before);f.client.destroy();
    });
    await test('Reset removes the custom timing and returns gold to the saved default',async()=>{
        const f=fixture({default:.5,custom:.7});await flush();assert.equal(f.client.getState().effect,.7);button(f.root,'Reset to default').onclick();
        assert.equal(f.client.getState().effect,.5);assert.deepStrictEqual(f.edits,[[{doc:'overrides',path:['timings','enemy:90001:default'],remove:true}]]);
        assert(all(f.root,n=>n.tagName==='p'&&n.textContent.includes('Gold melee hit at 0.5000 seconds (default).')).length);f.client.destroy();
    });
    await test('an authored event is the fallback default and explicit zero remains a custom timing',async()=>{
        const f=fixture({custom:0});await flush();assert.equal(f.client.getState().effect,0);button(f.root,'Reset to default').onclick();assert.equal(f.client.getState().effect,.4);f.client.destroy();
    });
    await test('a refreshed shared draft updates gold without moving the animation reference',async()=>{
        const f=fixture({default:.5});await flush();f.request.documents.overrides.data.timings[f.description.key]={attack:.8};f.client.setUnit(f.request);
        assert.equal(f.client.getState().effect,.8);assert.equal(f.edits.length,0);assert.equal(all(f.root,n=>n.className==='preview-marker reference')[0].style.left,'40%');f.client.destroy();
    });
    await test('Mirror is a persistent per-side draft and shared refresh updates facing without touching timing tables',async()=>{
        const f=fixture({default:.5});f.request.documents.overrides.data.visuals={'ally:90001:default':{mirrorX:true},'enemy:90001:default':{mirrorX:false,unknown:7}};await flush();assert.equal(f.client.getState().mirrored,false);assert.equal(f.edits.length,0);
        button(f.root,'Mirror model: Off').onclick();assert.equal(f.client.getState().mirrored,true);const change=f.edits[0][0];assert.deepStrictEqual(change.path,['visuals']);assert.equal(change.value['enemy:90001:default'].mirrorX,true);assert.equal(change.value['enemy:90001:default'].unknown,7);assert.equal(change.value['ally:90001:default'].mirrorX,true);assert.equal(f.client.getState().effect,.5);
        f.request.documents.overrides.data.visuals['enemy:90001:default'].mirrorX=false;f.client.setUnit(f.request);assert.equal(f.client.getState().mirrored,false);assert.equal(f.edits.length,1);f.client.destroy();
    });
    await test('saved attack playback is an independent draft with stable gold and authored reference markers',async()=>{
        const f=fixture({default:.5,custom:.7});await flush();assert.equal(f.edits.length,0);assert.equal(f.client.getState().attackSpeed,1);
        const speed=field(f.root,'Attack animation speed (saved)');speed.value='1.2';speed.onchange();
        assert.equal(f.client.getState().attackSpeed,1.2);assert.equal(f.client.getState().effect,.7);
        assert.deepStrictEqual(f.edits,[[{doc:'overrides',path:['animationSpeeds','enemy:90001:default'],value:1.2}]]);
        assert.equal(all(f.root,n=>n.className==='preview-marker reference')[0].style.left,'40%');
        assert.equal(all(f.root,n=>n.className==='preview-marker active')[0].style.left,'70%');
        f.request.documents.overrides.data.animationSpeeds={[f.description.key]:.8};f.client.setUnit(f.request);assert.equal(f.client.getState().attackSpeed,.8);
        button(f.root,'Reset attack speed').onclick();assert.equal(f.client.getState().attackSpeed,1);assert.equal(f.client.getState().effect,.7);
        assert.deepStrictEqual(f.edits[1],[{doc:'overrides',path:['animationSpeeds','enemy:90001:default'],remove:true}]);
        const count=f.edits.length;for(const value of ['0','5','NaN']){speed.value=value;speed.onchange();assert.equal(f.edits.length,count);}f.client.destroy();
    });
    await test('ally playback is independent per level, inherits the shared speed and resets only its selected level',async()=>{
        const speeds={'ally:90001:default':1.2,'ally:90001:level:2':2,'ally:90001:level:3':.5,'future:setting':{retained:true}};
        const f=fixture({type:'ally',level:2,default:.5,rate:.2,speeds});await flush();
        const before=clone(f.request.documents);assert.equal(f.client.getState().attackSpeed,2);assert.equal(f.edits.length,0);
        assert(all(f.root,n=>n.tagName==='p'&&n.textContent.includes('Saved for Level 2 only.')).length);
        const input=field(f.root,'Attack animation speed (saved)');input.value='2.5';input.onchange();
        assert.deepStrictEqual(f.edits[0],[{doc:'overrides',path:['animationSpeeds','ally:90001:level:2'],value:2.5}]);
        assert.equal(f.client.getState().attackSpeed,2.5);button(f.root,'Reset attack speed').onclick();
        assert.deepStrictEqual(f.edits[1],[{doc:'overrides',path:['animationSpeeds','ally:90001:level:2'],remove:true}]);
        assert.equal(f.client.getState().attackSpeed,1.2,'Reset inherits the previously authored shared unit speed');
        f.request.level=1;f.client.setUnit(f.request);await flush();assert.equal(f.client.getState().attackSpeed,1.2);assert.equal(button(f.root,'Reset attack speed').disabled,true);
        const count=f.edits.length;button(f.root,'Reset attack speed').onclick();assert.equal(f.edits.length,count,'Resetting an inherited value does not create a draft');
        f.request.level=3;f.client.setUnit(f.request);await flush();assert.equal(f.client.getState().attackSpeed,.5);
        assert.deepStrictEqual(f.request.documents,before,'Preview and per-key draft requests never mutate other level speeds, future fields or timing defaults');f.client.destroy();
    });
    await test('actual attack metrics update with level, speed, marker and cooldown while display stays at two decimals',async()=>{
        const f=fixture({type:'ally',level:2,default:.5,rate:.2,speeds:{'ally:90001:level:2':1}});await flush();
        let metric=f.metrics.at(-1);assert.equal(metric.type,'ally');assert.equal(metric.id,'90001');assert.equal(metric.level,2);assert.equal(metric.cooldownRate,.2);assert.equal(metric.hitTime,.5);assert.equal(metric.duration,1);assert.equal(metric.animationSpeed,1);assert(Math.abs(metric.rate-1/5.5)<1e-12);
        assert(all(f.root,n=>n.className==='preview-help preview-attack-rate'&&n.textContent.startsWith('Actual attacks per second: 0.18 ·')).length);
        const count=f.metrics.length;f.client.setUnit(f.request);assert.equal(f.metrics.length,count,'An unchanged shared snapshot does not emit a duplicate metrics callback');
        const input=field(f.root,'Attack animation speed (saved)');input.value='2';input.onchange();metric=f.metrics.at(-1);assert.equal(metric.animationSpeed,2);assert(Math.abs(metric.rate-1/5.25)<1e-12);
        assert(all(f.root,n=>n.className==='preview-help preview-attack-rate'&&n.textContent.startsWith('Actual attacks per second: 0.19 ·')).length);
        const marker=field(f.root,'Gold marker time (seconds)');marker.value='.8';marker.onchange();metric=f.metrics.at(-1);assert.equal(metric.hitTime,.8);assert(Math.abs(metric.rate-1/5.4)<1e-12);
        f.request.record.AttackInterval=.5;f.client.setUnit(f.request);assert.equal(f.metrics.at(-1),null,'Reloading a changed model/stat record invalidates old metrics immediately');await flush();metric=f.metrics.at(-1);assert.equal(metric.cooldownRate,.5);assert.equal(metric.level,2);
        f.request.level=3;f.client.setUnit(f.request);assert.equal(f.metrics.at(-1),null);await flush();assert.equal(f.metrics.at(-1).level,3);assert.equal(f.metrics.at(-1).animationSpeed,1);
        const edits=f.edits.length;f.client.destroy();assert.equal(f.metrics.at(-1),null);assert.equal(f.edits.length,edits);
    });
    await test('actual attack metrics honor the full attack animation limit instead of promising impossible hit frequency',async()=>{
        const f=fixture({duration:2,default:.5,rate:4});await flush();assert.equal(f.metrics.at(-1).rate,.5);
        const speed=field(f.root,'Attack animation speed (saved)');speed.value='2';speed.onchange();assert.equal(f.metrics.at(-1).rate,1);
        const preview=field(f.root,'Preview speed'),before=f.metrics.length;preview.value='.25';if(preview.onchange)preview.onchange();assert.equal(f.metrics.length,before,'Temporary viewer speed never changes authored attack frequency');
        assert.equal(f.metrics.at(-1).animationSpeed,2);assert.equal(f.metrics.at(-1).duration,2);f.client.destroy();
    });
    await test('ranged units overlap cooldown with windup and report their actual animation-limited rate',async()=>{
        const f=fixture({type:'ally',id:90003,level:1,record:{prefab:'ItemEnemy03'},duration:1.2,default:.5,rate:1});await flush();
        assert.equal(f.metrics.at(-1).cooldownStart,'start');assert(Math.abs(f.metrics.at(-1).rate-1/1.2)<1e-12);
        assert(all(f.root,n=>n.className==='preview-help preview-attack-rate'&&n.textContent.startsWith('Actual attacks per second: 0.83 ·')).length);
        const input=field(f.root,'Attack animation speed (saved)');input.value='2';input.onchange();assert.equal(f.metrics.at(-1).rate,1,'Faster firing animations retain the original one-second overlapping cooldown');
        assert.equal(f.metrics.at(-1).speedKey,'ally:90003:level:1');f.client.destroy();
    });
    await test('actual rate uses only saved gameplay timings while authored event markers remain visual references',async()=>{
        const absent=fixture({rate:1,duration:.6});await flush();assert.equal(absent.client.getState().effect,.4,'The authored event remains visible as an animation reference');assert.equal(absent.metrics.at(-1).hitTime,0);assert.equal(absent.metrics.at(-1).rate,1,'No saved default retains the immediate runtime hit path');
        const marker=field(absent.root,'Gold marker time (seconds)');marker.value='.5';marker.onchange();assert.equal(absent.metrics.at(-1).hitTime,.5);assert(Math.abs(absent.metrics.at(-1).rate-1/1.5)<1e-12,'A local committed timing draft updates the actual rate before the IPC snapshot returns');
        button(absent.root,'Reset to default').onclick();assert.equal(absent.metrics.at(-1).hitTime,0);assert.equal(absent.metrics.at(-1).rate,1);absent.client.destroy();
        const malformed=fixture({rate:1,duration:.6,default:.5,custom:'invalid'});await flush();assert.equal(malformed.metrics.at(-1).hitTime,0,'An invalid custom setting suppresses default fallback exactly as runtime does');assert.equal(malformed.metrics.at(-1).rate,1);button(malformed.root,'Reset to default').onclick();assert.equal(malformed.metrics.at(-1).hitTime,.5);malformed.client.destroy();
    });
    await test('the Units level selector controls the matching appearance without a second conflicting selector or draft edits',async()=>{
        const f=fixture({type:'ally',level:1,default:.5});await flush();
        assert.equal(f.requests[0].level,1);assert.equal(f.client.getState().level,1);
        assert.equal(field(f.root,'Character level').parentNode.hidden,true);
        assert(all(f.root,n=>n.tagName==='h3'&&n.textContent==='Unit 90001 · Level 1').length);
        f.request.level=2;f.client.setUnit(f.request);await flush();
        assert.equal(f.requests.length,2);assert.equal(f.requests[1].level,2);assert.equal(f.client.getState().level,2);
        assert.equal(f.client.getState().description.key,'ally:90001:default');assert.equal(f.client.getState().effect,.5);
        assert.deepStrictEqual(f.edits,[]);assert.deepStrictEqual(f.description,f.before);f.client.destroy();
    });
    await test('stat and saved-appearance refreshes retain the controlled level and preserve approved timing keys',async()=>{
        const f=fixture({type:'ally',level:2,default:.5,custom:.7});await flush();
        const timings=clone(f.request.documents.overrides.data);
        f.request.record={ID:90001,Health:200,AttackDamage:30};f.client.setUnit(f.request);await flush();
        assert.equal(f.requests.length,2);assert.equal(f.requests[1].level,2);assert.equal(f.requests[1].record.Health,200);
        f.client.refreshAppearance();await flush();assert.equal(f.requests[2].level,2);assert.equal(f.client.getState().level,2);
        const count=f.requests.length;f.client.setUnit(f.request);await flush();assert.equal(f.requests.length,count,'an unchanged shared draft does not reload the rig');
        assert.equal(f.client.getState().effect,.7);assert.equal(f.client.getState().description.key,'ally:90001:default');
        assert.deepStrictEqual(f.request.documents.overrides.data,timings);assert.deepStrictEqual(f.edits,[]);f.client.destroy();
    });
    await test('standalone ally previews keep their own read-only level selector across stat refreshes',async()=>{
        const f=fixture({type:'ally'});await flush();
        const input=field(f.root,'Character level');assert.equal(input.parentNode.hidden,false);assert.equal(f.requests[0].level,undefined);
        input.value='3';input.onchange();await flush();assert.equal(f.requests[1].level,3);assert.equal(f.client.getState().level,3);
        f.request.record={ID:90001,AttackRange:75};f.client.setUnit(f.request);await flush();assert.equal(f.requests[2].level,3);
        f.client.refreshAppearance();await flush();assert.equal(f.requests[3].level,3);
        assert.deepStrictEqual(f.edits,[]);f.client.destroy();
    });
    await test('playback API and Play button share pause behavior without edits, while loading and closed previews stay stopped',async()=>{
        const originalFrame=runtime.requestAnimationFrame,originalCancel=runtime.cancelAnimationFrame,scheduled=new Map();let id=0;
        runtime.requestAnimationFrame=callback=>{scheduled.set(++id,callback);return id;};runtime.cancelAnimationFrame=key=>scheduled.delete(key);
        let f;
        try{
            f=fixture({type:'ally',level:2});assert.equal(f.client.togglePlayback(),false,'loading has no playable model');await flush();
            const data=clone(f.request.documents);assert.equal(f.client.togglePlayback(),true);assert.equal(f.client.getState().playing,true);assert(button(f.root,'Pause'));assert.equal(scheduled.size,1);
            assert.equal(button(f.root,'Pause').onclick(),true);assert.equal(f.client.getState().playing,false);assert(button(f.root,'Play'));assert.equal(scheduled.size,0,'pausing cancels the queued frame');
            assert.equal(button(f.root,'Play').onclick(),true);assert.equal(f.client.getState().playing,true);
            f.client.refreshAppearance();assert.equal(f.client.getState().playing,false);assert.equal(f.client.togglePlayback(),false);assert.equal(scheduled.size,0);await flush();
            assert.equal(f.client.getState().playing,false);assert.equal(f.client.getState().level,2);assert.deepStrictEqual(f.request.documents,data);assert.deepStrictEqual(f.edits,[]);
            f.client.destroy();assert.equal(f.client.togglePlayback(),false);assert.equal(scheduled.size,0);
        }finally{if(f)f.client.destroy();runtime.requestAnimationFrame=originalFrame;runtime.cancelAnimationFrame=originalCancel;}
    });
    await test('playback API leaves unloaded and static building previews untouched',async()=>{
        const root=new Element('div'),edits=[],client=Client.mount(root,{ipc:async()=>({type:'building',id:'2',layers:[],image:'file:///base.png',runtimePath:null}),onChange:value=>edits.push(value)});
        assert.equal(client.togglePlayback(),false);client.setBuilding({id:'2',record:{}});await flush();
        assert.equal(client.getState().loaded,true);assert.equal(client.togglePlayback(),false);assert.equal(client.getState().playing,false);assert.deepStrictEqual(edits,[]);client.destroy();
    });
    await test('Equipment selected levels and weapon styles reload the real preview request without progress or timing edits',async()=>{
        const f=fixture({type:'hero',id:'hero'});await flush();
        f.description.equipment=[{id:2,label:'Helmet',level:25,max:50,levels:[{value:25,label:'Tier 3 · Level 5 · Upgrade 25'}]}];
        f.request.heroLevels={2:25};f.request.heroStyle='guardian';f.client.setUnit(f.request);await flush();
        assert.equal(f.requests.at(-1).heroLevels[2],25);assert.equal(f.requests.at(-1).heroStyle,'guardian');assert.equal(field(f.root,'Helmet').disabled,true);
        f.request.heroLevels={2:45};f.client.setUnit(f.request);await flush();assert.equal(f.requests.at(-1).heroLevels[2],45);
        f.request.heroStyle='fighter';f.client.setUnit(f.request);await flush();assert.equal(f.requests.at(-1).heroStyle,'fighter');assert.equal(f.requests.at(-1).heroLevels[2],45);
        f.client.refreshAppearance();await flush();assert.equal(f.requests.at(-1).heroLevels[2],45);assert.equal(f.requests.at(-1).heroStyle,'fighter');assert.deepStrictEqual(f.edits,[]);f.client.destroy();
    });
    await test('building weapon aiming previews live composition without drafts or base movement',async()=>{
        const root=new Element('div'),edits=[],description={type:'building',id:'2',layers:[],image:'file:///base.png',weaponImage:'file:///weapon.png',appearance:{sprite:'base',width:180,height:220,offsetX:-8,offsetY:3,weapon:{sprite:'weapon',width:120,height:70,pivotX:.2,pivotY:.7,offsetX:10,offsetY:175,muzzleX:85,muzzleY:20}},runtimePath:null};
        const before=clone(description),client=Client.mount(root,{ipc:async()=>description,onChange:value=>edits.push(value)});client.setBuilding({id:'2',record:{},documents:{}});await flush();
        const images=all(root,node=>node.tagName==='img');assert.equal(images.length,2);assert.equal(images[0].src,'file:///base.png');assert.equal(images[1].src,'file:///weapon.png');const baseStyle=images[0].style.cssText;
        const aim=field(root,'Preview aim (degrees)');aim.value='180';aim.oninput();assert(images[1].style.cssText.includes('scaleX(-1)'));assert.equal(images[0].style.cssText,baseStyle);
        button(root,'Reset reference pose').onclick();assert(images[1].style.cssText.includes('rotate(0deg) scaleX(1)'));assert.equal(edits.length,0);assert.deepStrictEqual(description,before);
        client.destroy();
    });
    await test('directional building preview swaps front/rear sprites and mirrors west without draft edits',async()=>{
        const root=new Element('div'),edits=[],description={type:'building',id:'2',layers:[],image:'file:///base.png',weaponImage:'file:///side.png',weaponImages:{north:'file:///north.png',southeast:'file:///southeast.png',south:'file:///south.png'},appearance:{sprite:'base',width:187,height:230,weapon:{sprite:'side',width:110,height:70,offsetY:133,muzzleX:48,muzzleY:27,views:{north:{sprite:'north',width:110,height:64,pivotX:.5,pivotY:.5,muzzleX:0,muzzleY:28},southeast:{sprite:'southeast',width:110,height:74,pivotX:.45,pivotY:.56,muzzleX:46,muzzleY:-25},south:{sprite:'south',width:110,height:64,pivotX:.5,pivotY:.5,muzzleX:0,muzzleY:-28}}}},runtimePath:null};
        const before=clone(description),client=Client.mount(root,{ipc:async()=>description,onChange:value=>edits.push(value)});client.setBuilding({id:'2',record:{},documents:{}});await flush();
        const images=all(root,node=>node.tagName==='img'),baseStyle=images[0].style.cssText,aim=field(root,'Preview aim (degrees)');
        for(const [angle,image]of [[90,'north'],[-90,'south'],[45,'side'],[135,'side'],[-45,'southeast'],[-135,'southeast'],[0,'side'],[180,'side']]){aim.value=String(angle);aim.oninput();assert.equal(images[1].src,'file:///'+image+'.png');assert.equal(images[0].style.cssText,baseStyle);assert(images[1].style.cssText.includes('scaleX('+(Math.abs(angle)>112.5?-1:1)+')'));}
        assert(images[1].style.cssText.includes('scaleX(-1)'));assert.equal(edits.length,0);assert.deepStrictEqual(description,before);client.destroy();
    });
    console.log(checks+' unit preview marker checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
