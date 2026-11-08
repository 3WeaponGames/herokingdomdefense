'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.style={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
    appendChild(child){this.children.push(child);child.parentNode=this;return child;}
    removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;return child;}
    remove(){if(this.parentNode)this.parentNode.removeChild(this);}
    set innerHTML(value){assert.equal(value,'');this.children=[];}
    querySelector(tag){return all(this,n=>n!==this&&n.tagName===tag)[0]||null;}
}
function all(root,match){const found=[];function visit(node){if(match(node))found.push(node);node.children.forEach(visit);}visit(root);return found;}
const button=(root,text)=>all(root,n=>n.tagName==='button'&&n.textContent===text)[0];
const field=(root,label)=>all(root,n=>n.tagName==='label'&&n.textContent===label)[0].children[0];
const clone=value=>JSON.parse(JSON.stringify(value));
const source=fs.readFileSync(path.join(__dirname,'../preview/client.js'),'utf8');
const runtime={exports:{},require(name){if(name==='./spine-renderer')return {
    createLayers:async(_spine,layers)=>layers.map(description=>({description,data:{findAnimation:()=>({duration:1}),findSkin:()=>true},skeleton:{setSkinByName(){},color:{set(){}}}})),
    seek(){},bounds(){return{width:1,height:1};},drawCanvas(){},destroyCanvas(){}
};if(name==='./projectile')return{simulate:()=>null};if(name==='./building-artwork'){const child=Object.assign({},runtime,{module:{exports:{}}});vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/building-artwork.js'),'utf8'),child);return child.module.exports;}if(name==='fixture-spine')return{};return require(name);},document:{createElement:tag=>new Element(tag)},requestAnimationFrame(){throw Error('Playback was not requested');},cancelAnimationFrame(){},__dirname:path.join(__dirname,'../preview'),isFinite};
runtime.module={exports:{}};vm.runInNewContext(source,runtime,{filename:'preview/client.js'});const Client=runtime.module.exports;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options){
    options=options||{};const root=new Element('div'),edits=[];
    const description={type:'enemy',id:'90001',form:'default',key:'enemy:90001:default',effect:'Melee hit',defaultTiming:.4,runtimePath:'fixture-spine',shared:[],layers:[{animations:['idle','attack'],skins:['default'],skin:'default',json:{animations:{attack:{events:[{name:'attack',time:.4}]}}}}]};
    if(options.events!==undefined){description.layers[0].json.animations.attack.events=options.events;description.defaultTiming=null;description.timingDefaultSource='No authored attack event.';}
    const request={type:'enemy',id:'90001',record:{ID:90001},documents:{overrides:{data:{timings:{},timingDefaults:{}}}}};
    if(options.default!==undefined)request.documents.overrides.data.timingDefaults[description.key]={attack:options.default};
    if(options.custom!==undefined)request.documents.overrides.data.timings[description.key]={attack:options.custom};
    const before=clone(description),client=Client.mount(root,{ipc:async()=>description,onChange:value=>edits.push(clone(value))});client.setUnit(request);
    return{root,edits,description,before,request,client};
}
async function main(){
    let checks=0;async function test(name,body){await body();console.log('PASS '+name);checks++;}
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
        assert.deepStrictEqual(f.edits,[[{doc:'overrides',path:['animationSpeeds'],value:{'enemy:90001:default':1.2}}]]);
        assert.equal(all(f.root,n=>n.className==='preview-marker reference')[0].style.left,'40%');
        assert.equal(all(f.root,n=>n.className==='preview-marker active')[0].style.left,'70%');
        f.request.documents.overrides.data.animationSpeeds={[f.description.key]:.8};f.client.setUnit(f.request);assert.equal(f.client.getState().attackSpeed,.8);
        button(f.root,'Reset attack speed').onclick();assert.equal(f.client.getState().attackSpeed,1);assert.equal(f.client.getState().effect,.7);
        assert.deepStrictEqual(f.edits[1],[{doc:'overrides',path:['animationSpeeds'],value:{}}]);
        const count=f.edits.length;for(const value of ['0','5','NaN']){speed.value=value;speed.onchange();assert.equal(f.edits.length,count);}f.client.destroy();
    });
    await test('building weapon aiming previews live composition without drafts or base movement',async()=>{
        const root=new Element('div'),edits=[],description={type:'building',id:'2',layers:[],image:'file:///base.png',weaponImage:'file:///weapon.png',appearance:{sprite:'base',width:180,height:220,offsetX:-8,offsetY:3,weapon:{sprite:'weapon',width:120,height:70,pivotX:.2,pivotY:.7,offsetX:10,offsetY:175,muzzleX:85,muzzleY:20}},runtimePath:null};
        const before=clone(description),client=Client.mount(root,{ipc:async()=>description,onChange:value=>edits.push(value)});client.setBuilding({id:'2',record:{},documents:{}});await flush();
        const images=all(root,node=>node.tagName==='img');assert.equal(images.length,2);assert.equal(images[0].src,'file:///base.png');assert.equal(images[1].src,'file:///weapon.png');const baseStyle=images[0].style.cssText;
        const aim=field(root,'Preview aim (degrees)');aim.value='180';aim.oninput();assert(images[1].style.cssText.includes('scaleX(-1)'));assert.equal(images[0].style.cssText,baseStyle);
        button(root,'Reset reference pose').onclick();assert(images[1].style.cssText.includes('rotate(0deg) scaleX(1)'));assert.equal(edits.length,0);assert.deepStrictEqual(description,before);
        client.destroy();
    });
    console.log(checks+' unit preview marker checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
