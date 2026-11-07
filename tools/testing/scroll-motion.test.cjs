'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(native=false){
 function Scroll(){Object.assign(this,{vertical:true,horizontal:false,inertia:true,content:{},enabledInHierarchy:true,brake:.75,current:100,maximum:500,calls:[],events:[]});}
 Scroll.prototype._onMouseWheel=function(){this.fallback=(this.fallback||0)+1;};Scroll.prototype._onTouchBegan=function(){this.auto=false;};Scroll.prototype.onEnable=function(){this.enabled=true;};Scroll.prototype.onDisable=function(){this.auto=false;};
 Object.assign(Scroll.prototype,{hasNestedViewGroup(){return !!this.nested;},getScrollOffset(){return{x:0,y:this.current};},getMaxScrollOffset(){return{x:0,y:this.maximum};},isAutoScrolling(){return this.auto;},_dispatchEvent(name){this.events.push(name);},_stopPropagationIfTargetIsMe(){this.stopped=true;},scrollToOffset(target,duration){this.calls.push({target,duration});this.auto=true;this._autoScrollTargetDelta={y:target.y-this.current};}});
 const cc={ScrollView:Scroll,sys:{isNative:native,os:'windows',OS_WINDOWS:'windows',browserType:'chromium',BROWSER_TYPE_FIREFOX:'firefox'},v2:(x,y)=>({x,y})},context={cc,exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/SmoothScroll.js'),'utf8'),context);context.exports.install();return{view:new Scroll(),cc,install:context.exports.install,wheel:delta=>({getScrollY:()=>delta})};
}
test('wheel notches accumulate into native interpolated motion; reversal and touch interrupt immediately',()=>{
 const f=fixture(),v=f.view;v.onEnable();assert.equal(v.brake,.45);
 v._onMouseWheel(f.wheel(-120));assert.equal(v.current,100,'wheel input must not jump the content');assert.equal(v.calls[0].target.y,112);assert.equal(v.calls[0].duration,.16);
 v.current=104;v._onMouseWheel(f.wheel(-120));assert.equal(v.calls[1].target.y,124,'rapid input keeps the pending distance');
 v._onMouseWheel(f.wheel(120));assert.equal(v.calls[2].target.y,92,'reversal starts at the visible position');
 v._onTouchBegan({});assert.equal(v._hkdWheel,null);assert.equal(v.auto,false);
 v._onMouseWheel(f.wheel(-120));assert.equal(v.calls[3].target.y,116);v.onDisable();assert.equal(v._hkdWheel,null);
});
test('nested/horizontal/page controls retain their native handler and install is idempotent',()=>{
 for(const mode of ['nested','horizontal','inertia']){const f=fixture(),v=f.view;v[mode]=mode==='inertia'?false:true;v._onMouseWheel(f.wheel(-120));assert.equal(v.fallback,1);assert.equal(v.calls.length,0);}
 const f=fixture(),handler=f.cc.ScrollView.prototype._onMouseWheel;f.install();assert.equal(f.cc.ScrollView.prototype._onMouseWheel,handler);f.view.brake=.9;f.view.onEnable();assert.equal(f.view.brake,.9);
});
test('native wheel calibration, list edges and programmatic motion cannot accumulate stale wheel targets',()=>{
 const f=fixture(true),v=f.view;v._onMouseWheel(f.wheel(-1));assert.equal(v.calls[0].target.y,107);
 v.current=200;v._autoScrollTargetDelta={y:300};v._onMouseWheel(f.wheel(-1));assert.equal(v.calls[1].target.y,207);
 v.current=495;v.auto=false;v._onMouseWheel(f.wheel(-20));assert.equal(v.calls[2].target.y,500);v.current=0;v.auto=false;v.maximum=0;v._onMouseWheel(f.wheel(-20));assert.equal(v.calls.length,3);
});
