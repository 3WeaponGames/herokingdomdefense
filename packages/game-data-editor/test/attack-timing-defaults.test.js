'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const Defaults=require('../lib/attack-timing-defaults'),Assets=require('../lib/unit-assets');
const root=path.resolve(__dirname,'../../..');
let count=0;
function test(name,fn){fn();console.log('PASS '+name);count++;}
function layer(events,source){return {name:'body',source:source||'example.json',json:{animations:{attack:{events}}}};}

test('authored attack event is selected without mistaking sound or footstep events for a hit',()=>{
    const result=Defaults.fromLayers([layer([{time:.1,name:'sound'},{time:.5,name:'attack'},{time:.7,name:'footstep'}])]);
    assert.equal(result.defaultTiming,.5);assert.equal(result.timingEvents.length,3);
});
test('equivalent layered event times resolve to one hit rather than repeated effects',()=>{
    const result=Defaults.fromLayers([layer([{time:.1667,name:'attack'}],'body.json'),layer([{time:.1667,name:'attack'}],'bow.json')]);
    assert.equal(result.defaultTiming,.1667);assert.equal(result.timingEvents.length,2);
});
test('missing, invalid or ambiguous authored attack events are not guessed',()=>{
    for(const layers of [[],[layer([{time:.3,name:'sound'}])],[layer([{time:-1,name:'attack'},{time:'0.5',name:'attack'}])],[layer([{time:.2,name:'attack'},{time:.5,name:'attack'}])]])assert.equal(Defaults.fromLayers(layers).defaultTiming,null);
    assert.equal(Defaults.fromLayers([layer([{name:'attack'}])]).defaultTiming,0);
});
test('all actual reachable units resolve the authored animation defaults independently',()=>{
    const result=Defaults.collect(root);assert.equal(Object.keys(result).length,17);
    assert.equal(result['hero:hero:default'].attack,.1667);
    Object.keys(result).filter(key=>key!=='hero:hero:default').forEach(key=>assert.equal(result[key].attack,.5,key));
    assert(result['enemy:90010:1']);assert(result['enemy:90011:2']);assert(result['enemy:90012:3']);
    assert(result['enemy:90001:default']);assert(result['ally:90001:default']);assert.notStrictEqual(result['enemy:90001:default'],result['ally:90001:default']);
});
test('describe exposes the reference and sources, while collecting leaves assets and configuration untouched',()=>{
    const files=Assets.index(root).files.filter(file=>/\.json$/.test(file));
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');const before=new Map(files.map(file=>[file,hash(file)]));
    const description=Assets.describe(root,{type:'hero',id:'hero',noRuntime:true});assert.equal(description.defaultTiming,.1667);assert.equal(description.timingDefaultSource,'Authored attack event');assert.equal(description.timingEvents.length,7);assert(description.timingEvents.every(event=>event.source&&event.name==='attack'));
    Defaults.collect(root);before.forEach((value,file)=>assert.equal(hash(file),value,file));
});
console.log(count+' authored attack timing default checks passed.');
