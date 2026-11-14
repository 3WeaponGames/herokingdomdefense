"use strict";
// A private weather clock and RNG. Never consumes the combat random stream.
function random(state){var x=state.seed;x^=x<<13;x^=x>>>17;x^=x<<5;state.seed=x>>>0;return state.seed/4294967296;}
function hold(state){return 20+random(state)*25;}
function create(seed){var state={seed:(seed>>>0)||314159,time:0,current:"soft",age:0,remaining:0,previous:null,previousAge:0,fade:2};state.remaining=hold(state);return state;}
function step(state,dt){
  dt=typeof dt==="number"&&isFinite(dt)?Math.max(0,dt):0;
  while(dt>1e-9){var amount=Math.min(dt,state.remaining);state.time+=amount;state.age+=amount;state.previousAge+=amount;state.fade=Math.max(0,state.fade-amount);if(!state.fade)state.previous=null;state.remaining-=amount;dt-=amount;
    if(state.remaining<=1e-9){state.previous=state.current;state.previousAge=state.age;state.current=state.current==="soft"?["intense","light","none"][Math.min(2,Math.floor(random(state)*3))]:"soft";state.age=0;state.fade=2;state.remaining=hold(state);}
  }
  var result=[],alpha=1-state.fade/2;if(state.previous&&state.previous!=="none"&&state.fade>0)result.push({kind:state.previous,age:state.previousAge,opacity:1-alpha});
  if(state.current!=="none"&&alpha>0)result.push({kind:state.current,age:state.age,opacity:alpha});return result;
}
exports.create=create;exports.step=step;
