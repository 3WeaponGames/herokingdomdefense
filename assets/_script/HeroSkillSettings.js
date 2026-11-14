"use strict";
// One field contract for runtime, authoring and preview. Reading defaults never
// creates saved overrides or changes an existing skill document.
var Core = require("./HeroStyleSkills"), VFXCatalog = require("./HeroSkillVFXCatalog");
var RESOURCE_PREFIXES=["resource","impactResource","passiveResource","beamResource","markResource","buffResource","tauntResource","shieldResource"];
var styles = [
  {id:"skirmisher",name:"Skirmisher",weapon:"Bow",skill:"Piercing Arrow"},
  {id:"fighter",name:"Fighter",weapon:"Sword",skill:"Battle Cry"},
  {id:"vanguard",name:"Vanguard",weapon:"Spear",skill:"Spear Barrage"},
  {id:"mystic",name:"Mystic",weapon:"Staff",skill:"Arcane Burst"},
  {id:"bruiser",name:"Bruiser",weapon:"Axe",skill:"Blood Cleave"},
  {id:"guardian",name:"Guardian",weapon:"Hammer and shield",skill:"Iron Bulwark"}
];
var VISUAL = {originX:0,originY:0,targetX:0,targetY:0,offsetX:0,offsetY:0,rotation:0,scale:1,opacity:1,lineWidth:0,color:"",effectDuration:.35,resource:"",resourceAnimation:"",showBuiltin:true,animation:"",holdTime:-1,impactResource:"",impactResourceAnimation:"",impactScale:1,impactDuration:.35,impactDelay:0,impactOffsetX:0,impactOffsetY:0,impactRotation:0,impactOpacity:1,impactColor:""};
["passive","beam","mark","buff","taunt","shield"].forEach(function(slot){
  VISUAL[slot+"Resource"]="";VISUAL[slot+"ResourceAnimation"]="";
  VISUAL[slot+"Scale"]=1;VISUAL[slot+"ScaleX"]=1;VISUAL[slot+"ScaleY"]=1;VISUAL[slot+"OffsetX"]=0;VISUAL[slot+"OffsetY"]=0;
  VISUAL[slot+"Rotation"]=0;VISUAL[slot+"Opacity"]=1;VISUAL[slot+"Color"]="";
});
Object.assign(VISUAL,{passiveMinScale:.35,passiveMinPlayback:.3,passivePlayback:1,beamWidth:48,beamEndDuration:.25,markSpawnDuration:.5,shieldSpawnDuration:.5,shieldEndDuration:.625});
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
var VISUAL_HELP = {
  originX:"Horizontal visual offset from the equipped weapon's release point. Moves the beam or arrow artwork, not its damage path.",
  originY:"Vertical visual offset from the equipped weapon's release point. Positive values move artwork upward; damage stays unchanged.",
  targetX:"Horizontal visual offset from the beam target. Moves its endpoint and attached VFX, not the target or hit range.",
  targetY:"Vertical visual offset from the beam target. Positive values move the endpoint and attached VFX upward; damage stays unchanged.",
  offsetX:"Additional horizontal offset for the entire displayed skill effect, after its origin or target offsets. Does not move damage geometry.",
  offsetY:"Additional vertical offset for the entire displayed skill effect, after its origin or target offsets. Positive values move artwork upward.",
  rotation:"Visual rotation in degrees. Rotates the displayed effect without changing the skill's aim or damage arc.",
  scale:"Visual size multiplier for the skill effect. 1 is its imported size; damage range and projectile width stay unchanged.",
  opacity:"Opacity of the skill effect. 1 is fully visible and 0 hides it without disabling damage.",
  lineWidth:"Visual thickness of built-in lines and arcs. 0 uses the style default; this is separate from projectile hit width.",
  color:"Optional visual tint. Empty keeps the original effect colors; this does not change gameplay.",
  effectDuration:"Lifetime of the skill's area or arc artwork in gameplay seconds. Does not change damage timing or buff duration.",
  resource:"Optional imported effect used on the projectile, beam target, or skill area. This is separate from the effect played on each enemy hit.",
  resourceAnimation:"Animation from the selected Spine VFX asset. Empty uses its first available animation; sprite flipbooks use imported timing.",
  showBuiltin:"Show the procedural skill artwork alongside the selected VFX. Turning it off does not disable damage or custom effects.",
  animation:"Authored rider attack clip used for this skill. Empty uses the equipped fighting style; the selected clip supplies its attack marker.",
  holdTime:"Mystic source-animation time to hold the scepter pose before beam damage begins. -1 uses the clip's authored attack marker.",
  impactResource:"Optional effect played at every enemy actually hit by the hero's basic attacks or active skill. Empty adds no custom on-hit effect.",
  impactResourceAnimation:"Animation from the selected on-hit Spine VFX. Empty uses its first available animation; sprites use their imported flipbook timing.",
  impactScale:"Size multiplier for the on-hit VFX only. 1 uses the imported size; damage and enemy size stay unchanged.",
  impactDuration:"How long each on-hit VFX stays visible, in gameplay seconds after its delay. Does not delay damage.",
  impactDelay:"Seconds after actual damage before the on-hit VFX and the enemy's existing get-hit animation start. 0 preserves immediate feedback. Damage is always applied at the real hit.",
  impactOffsetX:"Horizontal offset from the enemy's position when the hit landed. Applies only to on-hit VFX; positive values move it right.",
  impactOffsetY:"Vertical offset from the enemy's position when the hit landed. Applies only to on-hit VFX; positive values move it upward.",
  impactRotation:"Rotation of each on-hit effect in degrees. Does not rotate the enemy or alter the attack direction.",
  impactOpacity:"Opacity of on-hit VFX only. 1 is fully visible and 0 hides its artwork without affecting damage or hit reactions.",
  impactColor:"Optional tint for on-hit VFX. Empty preserves its imported colors."
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
  if(RESOURCE_PREFIXES.indexOf(key)>=0)return {path:"visual."+key,key:key,label:key==="resource"?"VFX asset":key==="impactResource"?"On-hit VFX asset":label(key.replace(/Resource$/,""))+" VFX asset",type:"vfx",emptyLabel:key==="resource"?"Built-in effect":key==="impactResource"?"No custom on-hit effect":"No "+label(key.replace(/Resource$/,"")).toLowerCase()+" effect"};
  if(/ResourceAnimation$/.test(key)||key==="resourceAnimation")return {path:"visual."+key,key:key,label:key==="resourceAnimation"?"VFX animation":"On-hit VFX animation",type:"effect-animation",emptyLabel:"Asset default",resourcePath:"visual."+key.replace(/Animation$/,"")};
  if(key==="showBuiltin")return {path:"visual.showBuiltin",key:key,label:"Show built-in effect",type:"boolean"};
  if(key==="animation")return {path:"visual.animation",key:key,label:"Rider animation",type:"animation",emptyLabel:"Style default"};
  if(/Color$/.test(key)||key==="color")return {path:"visual."+key,key:key,label:key==="color"?"Effect color":"On-hit effect color",type:"color",allowEmpty:true};
  var min=-4096,max=4096,step=.1,unit="units";
  if(/Rotation$/.test(key)||key==="rotation"){min=-360;max=360;unit="degrees";}
  if(/Scale(?:X|Y)?$/.test(key)||key==="scale"){min=.01;max=10;step=.01;unit="";}
  if(/Opacity$/.test(key)||key==="opacity"){min=0;max=1;step=.01;unit="fraction";}
  if(/Playback$/.test(key)){min=0;max=4;step=.01;unit="playback multiplier";}
  if(key==="beamWidth"){min=1;max=200;step=1;unit="visual units";}
  if(key==="beamEndDuration"||key==="markSpawnDuration"||key==="shieldSpawnDuration"||key==="shieldEndDuration"){min=.01;max=5;step=.01;unit="seconds";}
  if(key==="lineWidth"){min=0;max=200;step=.5;unit="0 = style default";}
  if(key==="effectDuration"||key==="impactDuration"){min=.01;max=30;step=.01;unit="seconds";}
  if(key==="impactDelay"){min=0;max=30;step=.01;unit="seconds";}
  if(key==="holdTime"){min=-1;max=30;step=.001;unit="seconds; -1 = authored hit";}
  return number("visual."+key,key.indexOf("impact")===0?"On-hit "+label(key.slice(6)).toLowerCase():label(key),min,max,step,unit);
}).map(function(field){var key=field.key,slot=/^(passive|beam|mark|buff|taunt|shield)/.exec(key),purpose=slot?{passive:"the state-driven passive aura",beam:"Mystic's continuous beam",mark:"the overhead target mark",buff:"Guardian's shield aura",taunt:"the one-shot effect above each taunted enemy",shield:"Guardian's body shield"}[slot[1]]:"";
  if(slot)field.label=label(key).replace(/Resource Animation$/,"VFX animation").replace(/Resource$/,"VFX asset");
  field.help=VISUAL_HELP[key]||(slot?(field.type==="vfx"?"Imported VFX for "+purpose+". Empty disables this artwork without affecting gameplay.":field.type==="effect-animation"?"Animation from the selected VFX; flipbooks use their imported timing.":/Offset/.test(key)?"Visual offset for "+purpose+" in world units; positive Y moves upward. Damage geometry is unchanged.":/Scale/.test(key)?"Size multiplier for "+purpose+". Minimum scale is the size at the lowest passive intensity.":/Playback/.test(key)?"Animation speed at minimum or maximum passive intensity. Speed blends with stacks, momentum or missing HP without seeking the animation.":/Opacity/.test(key)?"Opacity of "+purpose+" from 0 (hidden) to 1 (fully visible).":/Color/.test(key)?"Optional tint for "+purpose+". Empty preserves the imported colors.":/Rotation/.test(key)?"Visual rotation in degrees; gameplay direction is unchanged.":key==="beamWidth"?"Displayed beam thickness in world units. Origin and target flares keep their proportions.":key==="beamEndDuration"?"Seconds for the release frames after a beam stops or switches targets.":key==="markSpawnDuration"?"Seconds for the non-looping mark to appear before its persistent loop.":"Presentation setting for "+purpose+"; does not change gameplay."):undefined);return field;});
var audioFields=[];
["cast","impact","channel"].forEach(function(phase){
  var anchor=phase==="cast"?"skill confirmation":phase==="impact"?"the actual enemy hit":"the visible Mystic beam start";
  audioFields.push({path:"audio."+phase+".clip",key:"clip",label:label(phase)+" sound",type:"audio",phase:phase,emptyLabel:"No custom sound",help:"Custom "+phase+" sound anchored to "+anchor+". Empty preserves the built-in sound behavior; audio preview remains optional."});
  audioFields.push(Object.assign(number("audio."+phase+".volume",label(phase)+" volume",0,1,.01),{phase:phase,help:"Volume multiplier for this custom "+phase+" cue, before the player's effects-volume setting. 1 is full volume and 0 is silent."}));
  audioFields.push(Object.assign(number("audio."+phase+".delay",label(phase)+" delay",0,30,.01,"seconds"),{phase:phase,help:"Gameplay seconds after "+anchor+" before this sound starts. Independent of visual on-hit delay; use matching values to align them."}));
});
function fields(style){
  var visual=clone(visualFields).filter(function(field){
    if(/^(beam|mark|buff|taunt|shield)Scale[XY]$/.test(field.key))return false;
    var slot=/^(passive|beam|mark|buff|taunt|shield)/.exec(field.key);
    if(slot){if(slot[1]==="passive")return ["fighter","vanguard","bruiser"].indexOf(style)>=0;if(slot[1]==="beam"||slot[1]==="mark")return style==="mystic";return style==="guardian";}
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
  var result=Object.assign({},Core.DEFAULTS.common,Core.DEFAULTS[style],{visual:clone(VISUAL),audio:{cast:clone(AUDIO),impact:clone(AUDIO),channel:clone(AUDIO)}}),v=result.visual;
  var preset=VFXCatalog.presets[style]||{};Object.keys(preset).forEach(function(slot){var clip=VFXCatalog.clips.filter(function(row){return row.id===preset[slot];})[0];if(clip)applyClip(v,slot+"Resource",clip);});
  if(style==="fighter")Object.assign(v,{passiveScale:1.8,passiveOffsetY:80,passiveMinScale:.5,passiveMinPlayback:.55,passivePlayback:1.35});
  if(style==="vanguard")Object.assign(v,{passiveScale:1.8,passiveScaleY:.45,passiveOffsetY:12,passiveMinScale:.3,passiveMinPlayback:.2,passivePlayback:.45});
  if(style==="bruiser")Object.assign(v,{passiveScale:1.8,passiveColor:"#ff5367",passiveMinScale:.35,passiveMinPlayback:.3,passivePlayback:1});
  if(style==="mystic")Object.assign(v,{beamScale:.65,markScale:.45});
  if(style==="guardian")Object.assign(v,{buffScale:1.8,tauntScale:1.25,shieldScale:1.5,shieldOffsetY:0,shieldOpacity:.85});
  return result;
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
function impactVisual(value) {
  value=Object.assign({},VISUAL,value||{});var result={};
  ["resource","resourceAnimation","resourceBundle","resourcePath","resourceKind","resourceFrames","resourceColumns","resourceCell","resourceFps","resourceLoop","scale","rotation","opacity","color","offsetX","offsetY"].forEach(function(key){result[key]=value['impact'+key.charAt(0).toUpperCase()+key.slice(1)];});
  result.effectDuration=value.impactDuration;result.delay=value.impactDelay;return result;
}
function resourceVisual(value,prefix){
  var result={};["resource","resourceAnimation","resourceBundle","resourcePath","resourceKind","resourceFrames","resourceColumns","resourceCell","resourceFps","resourceLoop"].forEach(function(key){result[key]=value[prefix+key.slice(8)];});
  var slot=prefix.replace(/Resource$/,"");["scale","scaleX","scaleY","rotation","opacity","color","offsetX","offsetY"].forEach(function(key){result[key]=value[slot+key.charAt(0).toUpperCase()+key.slice(1)];});return result;
}
function applyClip(value,prefix,clip){
  value[prefix]=clip.uuid;value[prefix+"Kind"]="sprite";value[prefix+"Bundle"]=clip.bundle;value[prefix+"Path"]=clip.resource;
  ["frames","columns","cell","fps","loop"].forEach(function(key){value[prefix+key.charAt(0).toUpperCase()+key.slice(1)]=clip[key];});
}
function effective(style,config){
  var result=defaults(style),saved=config&&config.HeroSkills&&config.HeroSkills[style];
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return result;
  RESOURCE_PREFIXES.forEach(function(prefix){var value=saved.visual&&saved.visual[prefix],field=descriptors(style).filter(function(row){return row.path==="visual."+prefix;})[0];if(field&&valid(field,value)&&value!==result.visual[prefix])Object.keys(result.visual).forEach(function(key){if(key!==prefix&&key!==prefix+"Animation"&&key.indexOf(prefix)===0)delete result.visual[key];});});
  descriptors(style).forEach(function(field){var value=get(saved,field.path);if(value!==undefined&&valid(field,value))set(result,field.path,value);});
  RESOURCE_PREFIXES.reduce(function(paths,prefix){return paths.concat("visual."+prefix+"Bundle","visual."+prefix+"Path","visual."+prefix+"Kind");},[]).concat(["cast","impact","channel"].reduce(function(paths,phase){return paths.concat("audio."+phase+".bundle","audio."+phase+".path");},[])).forEach(function(path){var match=/^visual\.(passiveResource|beamResource|markResource|buffResource|tauntResource|shieldResource)/.exec(path);if(match&&get(saved,"visual."+match[1])!==result.visual[match[1]])return;var value=get(saved,path),kind=/Kind$/.test(path),bundle=/Bundle$|\.bundle$/.test(path);if(typeof value!=="string"||value.length>500||/[\u0000-\u001f]/.test(value))return;if(kind&&!/^(sprite|spine)$/.test(value))return;if(bundle&&!/^[a-z0-9_-]+$/i.test(value))return;if(!kind&&!bundle&&(!value||/\\|:|(^|\/)\.\.?($|\/)/.test(value)||value[0]==='/'))return;set(result,path,value);});
  RESOURCE_PREFIXES.forEach(function(prefix){if(RESOURCE_PREFIXES.indexOf(prefix)>=2&&get(saved,"visual."+prefix)!==result.visual[prefix])return;var raw={};["Frames","Columns","Cell","Fps","Loop"].forEach(function(key){raw["resource"+key]=saved.visual&&saved.visual[prefix+key];});var frames=flipbook(raw);if(frames)Object.keys(frames).forEach(function(key){result.visual[prefix+key.charAt(0).toUpperCase()+key.slice(1)]=frames[key];});});
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
exports.impactVisual=impactVisual;

exports.resourcePrefixes=RESOURCE_PREFIXES;exports.resourceVisual=resourceVisual;exports.applyClip=applyClip;
