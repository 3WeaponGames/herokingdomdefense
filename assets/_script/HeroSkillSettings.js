"use strict";
// One field contract for runtime, authoring and preview. Reading defaults never
// creates saved overrides or changes an existing skill document.
var Core = require("./HeroStyleSkills");
var styles = [
  {id:"skirmisher",name:"Skirmisher",weapon:"Bow",skill:"Piercing Arrow"},
  {id:"fighter",name:"Fighter",weapon:"Sword",skill:"Battle Cry"},
  {id:"vanguard",name:"Vanguard",weapon:"Spear",skill:"Spear Barrage"},
  {id:"mystic",name:"Mystic",weapon:"Staff",skill:"Arcane Burst"},
  {id:"bruiser",name:"Bruiser",weapon:"Axe",skill:"Blood Cleave"},
  {id:"guardian",name:"Guardian",weapon:"Hammer and shield",skill:"Iron Bulwark"}
];
var VISUAL = {originX:0,originY:0,targetX:0,targetY:0,offsetX:0,offsetY:0,rotation:0,scale:1,opacity:1,lineWidth:0,color:"",effectDuration:.35,resource:"",resourceAnimation:"",showBuiltin:true,animation:"",holdTime:-1};
var AUDIO = {clip:"",volume:1,delay:0};
var HELP = {
  cooldown:"Seconds between active-skill uses.",
  chargeRate:"Fraction of a full charge bar gained each second. 0.25 fills the bar in four seconds.",
  chargeDecay:"Fraction of momentum lost each second while standing still.",
  chargedDamage:"Extra shot damage at full Steady Aim charge. 0.5 means 50% additional damage.",
  windup:"Seconds between confirming the aimed skill and releasing its arrow.",
  projectileSpeed:"Arrow travel speed in world units per second.",
  distanceDamagePer100:"Added damage multiplier for every 100 units travelled. 0.1 adds 10% per 100 units.",
  projectileWidth:"Hit distance to either side of the arrow path, measured from an enemy's center.",
  maxStacks:"Maximum number of temporary melee-hit stacks.",
  stackDuration:"Time after the latest qualifying hit before the melee stacks expire.",
  stackDamage:"Additional attack damage per stack. 0.03 means 3% per stack.",
  stackReduction:"Incoming damage reduction per stack. 0.025 means 2.5% per stack.",
  stackTenacity:"Slow and stun duration reduction per stack. 0.08 means 8% per stack.",
  buffDuration:"How long the active or momentum buff lasts, in seconds.",
  buffDamage:"Attack damage bonus during the active buff. 0.25 means 25%.",
  buffAttackRate:"Attack speed bonus during the active buff. 0.35 means 35%.",
  knockback:"Distance enemies are pushed by the arc attack, in world units.",
  momentumMove:"Movement speed bonus from a full momentum bar. 1 means 100% additional movement speed.",
  momentumAttackRate:"Attack speed bonus from a full momentum bar. 0.35 means 35%.",
  duration:"Total duration of the spear-thrust sequence, in seconds.",
  strikes:"Number of distinct spear impacts spread across the sequence duration.",
  strikeDamage:"Basic-attack damage multiplier for each thrust before movement and attack-speed scaling.",
  moveScaling:"Thrust-damage contribution from current movement speed divided by Reference move.",
  attackScaling:"Thrust-damage contribution per current attack per second.",
  referenceMove:"Movement speed used as the baseline for spear-thrust damage scaling.",
  maxCharges:"Maximum number of same-target beam hits stored for Arcane Burst.",
  chargeDamage:"Additional active damage multiplier per stored beam hit. 0.15 adds 15% of basic damage per charge.",
  activeDamage:"Arcane Burst's basic-attack damage multiplier before stored charge and Crystal Orb bonuses.",
  slow:"Movement speed reduction on each beam hit. 0.2 means 20%.",
  slowDuration:"How many seconds the beam's slow lasts after a hit.",
  missingDamage:"Extra passive damage at 100% missing HP, scaled by the actual missing-HP fraction.",
  missingAttackRate:"Extra passive attack speed at 100% missing HP, scaled by the actual missing-HP fraction.",
  sacrifice:"Fraction of CURRENT HP sacrificed before Blood Cleave. 0.5 sacrifices half the current HP.",
  allyReduction:"Incoming damage reduction for nearby allies. 0.1 means 10%.",
  shieldHealth:"Shield size as a fraction of maximum HP. 0.25 means 25% of maximum HP.",
  shieldDuration:"Shield lifetime in seconds, unless damage consumes it first.",
  tauntDuration:"Seconds nearby hostile attackers prioritize the hero."
};
function clone(value){return JSON.parse(JSON.stringify(value));}
function known(style){return styles.some(function(row){return row.id===style;});}
function label(key){return key.replace(/([A-Z])/g," $1").replace(/^./,function(c){return c.toUpperCase();});}
function number(path,name,min,max,step,unit){return {path:path,key:path.split(".").pop(),label:name,type:"number",min:min,max:max,step:step||.01,unit:unit||""};}
function tuningFields(style){
  if(!known(style))return [];
  var values=Object.assign({},Core.DEFAULTS.common,Core.DEFAULTS[style]);
  return Object.keys(values).map(function(key){
    var min=0,max=20,step=.01,unit="";
    if(/^(cooldown|windup|.*Duration|duration)$/.test(key)){max=300;unit="seconds";}
    if(key==="duration"){min=.1;max=30;}
    if(/^(maxStacks|maxCharges|strikes)$/.test(key)){min=1;max=100;step=1;}
    if(key==="projectileSpeed"||key==="referenceMove"){min=1;max=5000;step=1;unit="units / second";}
    if(key==="projectileWidth"){min=1;max=500;step=1;unit="units";}
    if(key==="knockback"){max=2000;step=1;unit="units";}
    if(key==="slow"||key==="stackTenacity"||key==="stackReduction"||key==="allyReduction"){max=.95;unit="fraction";}
    if(key==="sacrifice"){max=.99;unit="current HP fraction";}
    var field=number(key,label(key),min,max,step,unit);if(/^(maxStacks|maxCharges|strikes)$/.test(key))field.integer=true;if(HELP[key])field.help=HELP[key];return field;
  });
}
var visualFields = Object.keys(VISUAL).map(function(key){
  if(key==="resource")return {path:"visual.resource",key:key,label:"VFX asset",type:"vfx",emptyLabel:"Built-in effect"};
  if(key==="resourceAnimation")return {path:"visual.resourceAnimation",key:key,label:"VFX animation",type:"effect-animation",emptyLabel:"Asset default"};
  if(key==="showBuiltin")return {path:"visual.showBuiltin",key:key,label:"Show built-in effect",type:"boolean"};
  if(key==="animation")return {path:"visual.animation",key:key,label:"Rider animation",type:"animation",emptyLabel:"Style default"};
  if(key==="color")return {path:"visual.color",key:key,label:"Effect color",type:"color",allowEmpty:true};
  var min=-4096,max=4096,step=.1,unit="units";
  if(key==="rotation"){min=-360;max=360;unit="degrees";}
  if(key==="scale"){min=.01;max=10;step=.01;unit="";}
  if(key==="opacity"){min=0;max=1;step=.01;unit="fraction";}
  if(key==="lineWidth"){min=0;max=200;step=.5;unit="0 = style default";}
  if(key==="effectDuration"){min=.01;max=30;step=.01;unit="seconds";}
  if(key==="holdTime"){min=-1;max=30;step=.001;unit="seconds; -1 = authored hit";}
  return number("visual."+key,label(key),min,max,step,unit);
});
var audioFields=[];
["cast","impact","channel"].forEach(function(phase){
  audioFields.push({path:"audio."+phase+".clip",key:"clip",label:label(phase)+" sound",type:"audio",phase:phase,emptyLabel:"No custom sound"});
  audioFields.push(Object.assign(number("audio."+phase+".volume",label(phase)+" volume",0,1,.01),{phase:phase}));
  audioFields.push(Object.assign(number("audio."+phase+".delay",label(phase)+" delay",0,30,.01,"seconds"),{phase:phase}));
});
function fields(style){
  var visual=clone(visualFields).filter(function(field){
    if(["holdTime","targetX","targetY"].indexOf(field.key)>=0)return style==="mystic";
    if(["originX","originY"].indexOf(field.key)>=0)return style==="mystic"||style==="skirmisher";
    if(field.key==="effectDuration")return style!=="skirmisher";
    return true;
  });
  return {tuning:tuningFields(style),visual:visual,audio:clone(audioFields).filter(function(field){return field.phase!=="channel"||style==="mystic";})};
}
function descriptors(style){var f=fields(style);return f.tuning.concat(f.visual,f.audio);}
function get(object,path){return path.split(".").reduce(function(value,key){return value&&typeof value==="object"?value[key]:undefined;},object);}
function valid(descriptor,value){
  if(descriptor.type==="boolean")return typeof value==="boolean";
  if(descriptor.type==="number")return typeof value==="number"&&isFinite(value)&&value>=descriptor.min&&value<=descriptor.max&&(!descriptor.integer||Math.floor(value)===value);
  if(typeof value!=="string")return false;
  if(descriptor.type==="audio"||descriptor.type==="vfx")return value===""||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[a-z0-9]+)?$/i.test(value);
  if(descriptor.type==="color")return value===""||/^#[0-9a-f]{6}$/i.test(value);
  return value.length<=150&&!/[\u0000-\u001f]/.test(value);
}
function defaults(style){
  style=known(style)?style:"skirmisher";
  return Object.assign({},Core.DEFAULTS.common,Core.DEFAULTS[style],{visual:clone(VISUAL),audio:{cast:clone(AUDIO),impact:clone(AUDIO),channel:clone(AUDIO)}});
}
function set(object,path,value){var keys=path.split("."),key=keys.pop(),parent=object;keys.forEach(function(part){if(!parent[part]||typeof parent[part]!=="object"||Array.isArray(parent[part]))parent[part]={};parent=parent[part];});parent[key]=value;}
// Imported flipbooks remain sprites; these derived fields describe one frame
// without changing the saved asset ID or exposing raw atlas settings in the UI.
function flipbook(value){
  value=value||{};var frames=value.resourceFrames,columns=value.resourceColumns,cell=value.resourceCell,fps=value.resourceFps;
  function integer(n,max){return typeof n==="number"&&isFinite(n)&&n>=1&&n<=max&&Math.floor(n)===n;}
  if(!integer(frames,4096)||!integer(columns,256)||!integer(cell,4096)||typeof fps!=="number"||!isFinite(fps)||fps<=0||fps>240||value.resourceLoop!==undefined&&typeof value.resourceLoop!=="boolean")return null;
  return {frames:frames,columns:columns,cell:cell,fps:fps,loop:value.resourceLoop===true};
}
function effective(style,config){
  var result=defaults(style),saved=config&&config.HeroSkills&&config.HeroSkills[style];
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return result;
  descriptors(style).forEach(function(field){var value=get(saved,field.path);if(value!==undefined&&valid(field,value))set(result,field.path,value);});
  ["visual.resourceBundle","visual.resourcePath","visual.resourceKind"].concat(["cast","impact","channel"].reduce(function(paths,phase){return paths.concat("audio."+phase+".bundle","audio."+phase+".path");},[])).forEach(function(path){var value=get(saved,path),kind=/Kind$/.test(path),bundle=/Bundle$|\.bundle$/.test(path);if(typeof value!=="string"||value.length>500||/[\u0000-\u001f]/.test(value))return;if(kind&&!/^(sprite|spine)$/.test(value))return;if(bundle&&!/^[a-z0-9_-]+$/i.test(value))return;if(!kind&&!bundle&&(!value||/\\|:|(^|\/)\.\.?($|\/)/.test(value)||value[0]==='/'))return;set(result,path,value);});
  var frames=flipbook(saved.visual);if(frames)Object.keys(frames).forEach(function(key){result.visual['resource'+key.charAt(0).toUpperCase()+key.slice(1)]=frames[key];});
  return result;
}
function validateStyle(style,value){
  if(!known(style))throw Error("Choose one of the six hero fighting styles.");
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("A skill override must be an object.");
  ["visual","audio"].forEach(function(group){if(value[group]!==undefined&&(!value[group]||typeof value[group]!=="object"||Array.isArray(value[group])))throw Error("Invalid "+group+" skill settings.");});
  ["cast","impact","channel"].forEach(function(phase){var audio=value.audio&&value.audio[phase];if(audio!==undefined&&(!audio||typeof audio!=="object"||Array.isArray(audio)))throw Error("Invalid "+phase+" sound settings.");});
  descriptors(style).forEach(function(field){var current=get(value,field.path);if(current!==undefined&&!valid(field,current))throw Error(field.label+": choose a valid "+(field.type==="number"?"value between "+field.min+" and "+field.max:field.type)+".");});
  return true;
}
function riderAnimations(description){
  var layers=(description&&description.layers||[]).filter(function(layer){return !(layer.json&&layer.json._heroMakerMount)&&!/(?:^|_)ma$|horse|mount/i.test(layer.name||"");});
  var tagged=layers.filter(function(layer){return !!(layer.json&&layer.json._heroMaker);});if(tagged.length)layers=tagged;
  if(!layers.length)return [];
  var lists=layers.map(function(layer){return layer.animations||Object.keys(layer.json&&layer.json.animations||{});});
  var source=layers.filter(function(layer){return layer.json&&layer.json._heroMaker&&layer.json._heroMaker.role===0;})[0]||layers[0];
  return lists[0].filter(function(name){var clip=source.json&&source.json.animations&&source.json.animations[name];return /^attack(?:_|$)/.test(name)&&lists.every(function(list){return list.indexOf(name)>=0;})&&!!(clip&&Array.isArray(clip.events)&&clip.events.some(function(event){return event.name==='attack'&&typeof event.time==='number'&&isFinite(event.time)&&event.time>=0;}));});
}
exports.styles=styles;exports.tuningFields=tuningFields;exports.visualFields=visualFields;exports.audioFields=audioFields;exports.fields=fields;exports.descriptors=descriptors;exports.defaults=defaults;exports.effective=effective;exports.validateStyle=validateStyle;exports.valid=valid;exports.get=get;exports.set=set;
exports.riderAnimations=riderAnimations;
exports.flipbook=flipbook;
