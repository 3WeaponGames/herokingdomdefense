'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const prefix=fs.readFileSync(path.join(root,'packages/game-data-editor/test/unit-preview-client.test.js'),'utf8').split('const source=')[0],calls=[],frames=new Map(),edits=[];let id=0;
 const context={module:{exports:{}},require,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key)};vm.createContext(context);vm.runInContext(prefix,context);context.document={createElement:tag=>vm.runInContext('new Element('+JSON.stringify(tag)+')',context)};
 const renderer={createLayers:async(_sp,layers)=>layers.map(description=>({description,data:{findAnimation:name=>({duration:name==='idle'?1.3333:.8333}),findSkin:()=>true},skeleton:{color:{set(){}}}})),seek(_sp,_layers,name,time,loop){calls.push({name,time,loop});},bounds:()=>({width:1,height:1}),drawCanvas(){},destroyCanvas(){}};
 const pure={'../../../assets/_script/AttackCadence':require('../../assets/_script/AttackCadence'),'../lib/attack-profile':require('../../packages/game-data-editor/lib/attack-profile')};
 context.require=name=>Object.hasOwn(pure,name)?pure[name]:name==='./spine-renderer'?renderer:name==='./projectile'?{simulate:()=>null}:name==='./building-artwork'?{mount:()=>({hide(){},destroy(){}})}:{};
 vm.runInContext('(function(){'+fs.readFileSync(path.join(root,'packages/game-data-editor/preview/client.js'),'utf8')+'})()',context);
 const documents={overrides:{data:{timingDefaults:{'hero:hero:default':{attack:.4}},timings:{}}}},description={type:'hero',id:'hero',key:'hero:hero:default',form:'default',effect:'Melee hit',shared:[],equipment:[],layers:[{uuid:'horse',name:'wqyl_lead_ma',animations:['idle','attack'],skins:['default'],json:{animations:{attack:{events:[]}}}},{uuid:'rider',name:'rider',animations:['idle','attack'],skins:['default'],json:{animations:{attack:{events:[]}}}}]};
 const host=vm.runInContext('new Element("div")',context),client=context.module.exports.mount(host,{ipc:async()=>description,onChange:edit=>edits.push(JSON.parse(JSON.stringify(edit)))});client.setUnit({type:'hero',id:'hero',documents});
 const field=vm.runInContext('field',context),button=vm.runInContext('button',context);
 return{client,calls,edits,documents,field:label=>field(host,label),button:label=>button(host,label),tick(time){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time));}};
}
test('Units preview preserves independent layer clocks while its scrubber and gold timing use the displayed action phase',async t=>{
 const f=fixture();t.after(()=>f.client.destroy());await flush();const before=JSON.stringify(f.documents);f.button('Play').onclick();f.tick(1000);f.tick(1600);f.tick(2200);f.tick(2800);
 assert(Math.abs(f.calls.at(-1).time-1.8)<1e-8);assert(Math.abs(f.client.getState().time-(1.8%.8333))<1e-8);assert.equal(JSON.stringify(f.documents),before);assert.equal(f.edits.length,0);
 f.button('Use current frame').onclick();assert(Math.abs(f.edits[0][0].value.attack-(1.8%.8333))<1e-8);
});
test('Units preview can scrub the final pose and replay a non-looping animation from the start',async t=>{
 const f=fixture();t.after(()=>f.client.destroy());await flush();const loop=f.field('Loop');loop.checked=false;loop.onchange();f.button('Play').onclick();f.tick(1000);f.tick(2500);
 assert.equal(f.client.getState().playing,false);assert.equal(f.calls.at(-1).time,.8333);assert.equal(f.calls.at(-1).loop,false);f.button('Play').onclick();assert.equal(f.calls.at(-1).time,0);
 assert.equal(f.edits.length,0);
});
