"use strict";
// One field contract for runtime, authoring and preview. Reading defaults never
// creates saved overrides or changes an existing skill document.
var Core = require("./HeroStyleSkills"), VFXCatalog = require("./HeroSkillVFXCatalog"), Descriptions = require("./HeroSkillDescriptions");
var EFFECT_SLOTS=["passive","beam","mark","buff","taunt","shield","cast","castSecondary","channelHit","presence","defense","physicalShield"];
var RESOURCE_PREFIXES=["resource","impactResource"].concat(EFFECT_SLOTS.map(function(slot){return slot+"Resource";}));
var styles = [
  {id:"skirmisher",name:"Skirmisher",weapon:"Bow",skill:"Arrow Volley"},
  {id:"fighter",name:"Fighter",weapon:"Sword",skill:"Battle Cry"},
  {id:"vanguard",name:"Vanguard",weapon:"Spear",skill:"Spear Barrage"},
  {id:"mystic",name:"Mystic",weapon:"Staff",skill:"Arcane Burst"},
  {id:"bruiser",name:"Bruiser",weapon:"Axe",skill:"Blood Cleave"},
  {id:"guardian",name:"Guardian",weapon:"Hammer and shield",skill:"Iron Bulwark"}
];
var VISUAL = {arcDegrees:120,originX:0,originY:0,targetX:0,targetY:0,offsetX:0,offsetY:0,rotation:0,scale:1,opacity:1,lineWidth:0,color:"",effectDuration:.35,resource:"",resourceAnimation:"",resourcePlaybackRate:1,showBuiltin:true,animation:"",animationPlayback:1,holdTime:-1,impactResource:"",impactResourceAnimation:"",impactPlaybackRate:1,impactScale:1,impactDuration:.35,impactDelay:0,impactOffsetX:0,impactOffsetY:0,impactRotation:0,impactOpacity:1,impactColor:""};
EFFECT_SLOTS.forEach(function(slot){
  if(slot!=="cast")VISUAL[slot+"Delay"]=0;
  VISUAL[slot+"Resource"]="";VISUAL[slot+"ResourceAnimation"]="";
  VISUAL[slot+"Scale"]=1;VISUAL[slot+"ScaleX"]=1;VISUAL[slot+"ScaleY"]=1;VISUAL[slot+"OffsetX"]=0;VISUAL[slot+"OffsetY"]=0;
  VISUAL[slot+"Rotation"]=0;VISUAL[slot+"Opacity"]=1;VISUAL[slot+"Color"]="";
  VISUAL[slot+"PlaybackRate"]=1;
});
["cast","castSecondary"].forEach(function(slot){VISUAL[slot+"PivotX"]=0;VISUAL[slot+"PivotY"]=0;VISUAL[slot+"FlipX"]=false;VISUAL[slot+"FlipY"]=false;});
Object.assign(VISUAL,{castDelay:0,arcStartWidth:120,passiveMinScale:.35,passiveMinPlayback:.3,passivePlayback:1,beamWidth:48,beamEndDuration:.25,markSpawnDuration:.5,shieldSpawnDuration:.5,shieldEndDuration:.625});
Object.assign(VISUAL,{channelTrailSpeed:700,channelTrailWidth:10,channelTrailTailWidth:.04,channelTrailLength:.7,channelTrailColor:"#5d2b8b",channelTrailTailColor:"#d8baff",channelTrailOpacity:.9});
var AUDIO = {clip:"",volume:1,delay:0};
var AUDIO_PHASES = ["cast","impact","channel","explosion"];
var HELP = {
  cooldown:"Seconds between active-skill uses.",
  contactDelay:"Additional seconds before the active skill's authored contact. The same delay controls preview, VFX and actual damage.",
  chargeRate:"Fraction of a full charge bar gained each second. 0.25 fills the bar in four seconds.",
  chargeDecay:"Fraction of momentum lost each second while standing still.",
  chargedDamage:"Extra shot damage at full Steady Aim charge. 0.5 means 50% additional damage.",
  chargedRange:"Extra basic-attack range at full Steady Aim charge. 0.5 means 50% additional range; the range ring grows with the charge.",
  windup:"Seconds from the start of the bow draw to the release of all five arrows.",
  volleyRange:"Maximum distance each arrow travels from the bow before it disappears.",
  splashRadius:"Base active-skill splash radius in world units before stored target charges.",
  splashRadiusPerCharge:"Additional splash radius in world units per same-target channel hit.",
  maxStacks:"Landed melee hits required to activate the full Combat Stacks buff.",
  stackDuration:"Seconds the full Combat Stacks buff lasts after the most recent landed hit.",
  stackDamage:"Additional attack damage per stack. 0.03 means 3% per stack.",
  stackReduction:"Incoming damage reduction per stack. 0.025 means 2.5% per stack.",
  stackTenacity:"Slow and stun duration reduction per stack. 0.08 means 8% per stack.",
  buffDuration:"How long the active or momentum buff lasts, in seconds.",
  buffDamage:"Attack damage bonus during the active buff. 0.25 means 25%.",
  buffAttackRate:"Attack speed bonus during the active buff. 0.35 means 35%.",
  knockback:"Distance enemies are pushed by the arc attack, in world units.",
  momentumMove:"Movement speed bonus from a full momentum bar. 0.5 means 50% additional movement speed.",
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
  explosionTime:"Explosion / actual hit time in the selected cast VFX's source seconds. The default 0.76666665 is the native burst's explosion frame. Cast VFX playback retimes this marker, blank lead-in trimming is subtracted, and Additional VFX start delay plus contact delay are added afterward. Zero applies the hit at the visible cast start. Damage, lifesteal, hit reactions and on-hit effects all wait for this actual hit.",
  slow:"Movement speed reduction on each beam hit. 0.2 means 20%.",
  slowDuration:"How many seconds the beam's slow lasts after a hit.",
  missingDamage:"Extra passive damage at 100% missing HP, scaled by the actual missing-HP fraction.",
  missingAttackRate:"Extra passive attack speed at 100% missing HP, scaled by the actual missing-HP fraction.",
  sacrifice:"Fraction of CURRENT HP sacrificed before Blood Cleave. 0.5 sacrifices half the current HP.",
  allyReduction:"Incoming damage reduction for nearby allies. 0.1 means 10%.",
  shieldHealth:"Shield size as a fraction of maximum HP. 0.25 means 25% of maximum HP.",
  shieldDuration:"Shield lifetime in seconds, unless damage consumes it first.",
  tauntDuration:"Seconds nearby hostile attackers prioritize the hero.",
  tauntRadius:"Base radius of Iron Bulwark's taunt in world units. Area size multiplies this range; VFX-only size settings do not change it.",
  allyRadius:"Radius around the hero in which allies receive Protective Presence damage reduction and its aura. Independent of the active taunt and VFX size."
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
  castDelay:"Additional seconds before the active effect and its matching damage contacts. The authored barrage and spear sequence use the same delay in gameplay and preview.",
  castSecondaryDelay:"Additional seconds after the shared cast start delay before Blood Cleave's second effect appears. Zero starts both effects together. Does not change damage timing.",
  arcStartWidth:"Width in world units of the flat rear hit-area edge for Vanguard. The sides join its rounded outer arc. Set to 0 for a pointed cone.",
  castScale:"Size of the complete skill VFX. The gold hit boundary has separate gameplay size controls.",
  castScaleX:"Horizontal size multiplier for the complete effect. Changes artwork only.",
  castScaleY:"Vertical size multiplier for the complete effect. Changes artwork only.",
  castOffsetX:"World-space horizontal artwork offset from its cast attachment. Does not move the damage origin.",
  castOffsetY:"World-space vertical artwork offset from its cast attachment. Does not move the damage origin.",
  castRotation:"Artwork rotation relative to the captured aim direction. Does not rotate the damage arc.",
  resource:"Optional imported effect used on the projectile, beam target, or skill area. This is separate from the effect played on each enemy hit.",
  resourceAnimation:"Animation from the selected Spine VFX asset. Empty uses its first available animation; sprite flipbooks use imported timing.",
  showBuiltin:"Show the procedural skill artwork alongside the selected VFX. Turning it off does not disable damage or custom effects.",
  animation:"Authored rider attack clip used for this skill. Empty uses the equipped fighting style; the selected clip supplies its attack marker.",
  animationPlayback:"Saved speed multiplier for this skill's rider attack and stationary horse, on top of the whole-unit animation speed. Other ordinary attacks and a moving horse keep their own speed. Mystic channel formation uses this speed; damage ticks still use attack speed.",
  resourcePlaybackRate:"Saved playback multiplier for the custom skill artwork. 0.5 plays at half speed and 2 plays at double speed; damage timing is unchanged.",
  impactPlaybackRate:"Saved playback multiplier for on-hit artwork. Visible duration scales with playback; damage and the get-hit reaction delay are unchanged.",
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
    if(key==="referenceMove"){min=1;max=5000;step=1;unit="units / second";}
    if(key==="splashRadius"||key==="splashRadiusPerCharge"){min=key==="splashRadius"?1:0;max=2000;step=1;unit="units";}
    if(key==="tauntRadius"||key==="allyRadius"){min=1;max=2000;step=1;unit="units";}
    if(key==="contactDelay"){max=30;unit="seconds";}
    if(key==="volleyRange"){min=1;max=2000;step=1;unit="units";}
    if(key==="explosionTime"){max=30;step=.001;unit="VFX source seconds";}
    if(key==="knockback"){max=2000;step=1;unit="units";}
    if(key==="slow"||key==="stackTenacity"||key==="stackReduction"||key==="allyReduction"){max=.95;unit="fraction";}
    if(key==="sacrifice"){max=.99;unit="current HP fraction";}
    var field=number(key,key==='explosionTime'?'Explosion / actual hit time':label(key),min,max,step,unit);if(/^(maxStacks|maxCharges|strikes)$/.test(key))field.integer=true;if(HELP[key])field.help=HELP[key];if(key==='activeDamage'&&style!=='mystic'){field.label='Active damage multiplier';field.help=style==='skirmisher'?'Bow damage per arrow. 1 is 100% of bow damage.':'Final Blood Cleave damage multiplier after its missing-HP bonus. 0.5 is half damage. The HP sacrifice and missing-HP passive are unchanged.';}if(style==='skirmisher'&&key==='contactDelay'){field.label='Additional release delay';field.help='Extra gameplay seconds before the five arrows leave the bow.';}return field;
  });
}
var visualFields = Object.keys(VISUAL).map(function(key){
  if(RESOURCE_PREFIXES.indexOf(key)>=0)return {path:"visual."+key,key:key,label:key==="resource"?"VFX asset":key==="impactResource"?"On-hit VFX asset":label(key.replace(/Resource$/,""))+" VFX asset",type:"vfx",emptyLabel:key==="resource"?"Built-in effect":key==="impactResource"?"No custom on-hit effect":"No "+label(key.replace(/Resource$/,"")).toLowerCase()+" effect"};
  if(/ResourceAnimation$/.test(key)||key==="resourceAnimation")return {path:"visual."+key,key:key,label:key==="resourceAnimation"?"VFX animation":"On-hit VFX animation",type:"effect-animation",emptyLabel:"Asset default",resourcePath:"visual."+key.replace(/Animation$/,"")};
  if(key==="showBuiltin")return {path:"visual.showBuiltin",key:key,label:"Show built-in effect",type:"boolean"};
  if(/Flip[XY]$/.test(key))return {path:"visual."+key,key:key,label:label(key),type:"boolean"};
  if(key==="animation")return {path:"visual.animation",key:key,label:"Rider animation",type:"animation",emptyLabel:"Style default"};
  if(/Color$/.test(key)||key==="color")return {path:"visual."+key,key:key,label:key==="color"?"Effect color":"On-hit effect color",type:"color",allowEmpty:true};
  var min=-4096,max=4096,step=.1,unit="units";
  if(/Rotation$/.test(key)||key==="rotation"){min=-360;max=360;unit="degrees";}
  if(/Scale(?:X|Y)?$/.test(key)||key==="scale"){min=.01;max=10;step=.01;unit="";}
  if(/Opacity$/.test(key)||key==="opacity"){min=0;max=1;step=.01;unit="fraction";}
  if(/Playback$/.test(key)){min=0;max=4;step=.01;unit="playback multiplier";}
  if(/PlaybackRate$/.test(key)||key==="animationPlayback"){min=.05;max=4;step=.01;unit="playback multiplier";}
  if(key==="beamWidth"){min=1;max=200;step=1;unit="visual units";}
  if(key==="channelTrailSpeed"){min=10;max=5000;step=10;unit="units / second";}
  if(key==="channelTrailWidth"){min=1;max=100;step=.5;unit="visual units";}
  if(key==="channelTrailTailWidth"){min=0;max=1;step=.01;unit="fraction of head width";}
  if(key==="channelTrailLength"){min=.05;max=1.5;step=.05;unit="fraction of one-way travel time";}
  if(key==="beamEndDuration"||key==="markSpawnDuration"||key==="shieldSpawnDuration"||key==="shieldEndDuration"){min=.01;max=5;step=.01;unit="seconds";}
  if(key==="lineWidth"){min=0;max=200;step=.5;unit="0 = style default";}
  if(key==="effectDuration"||key==="impactDuration"){min=.01;max=30;step=.01;unit="seconds";}
  if(/Delay$/.test(key)){min=0;max=30;step=.01;unit="seconds";}
  if(key==="arcStartWidth"){min=0;max=2000;step=1;unit="units";}
  if(key==="holdTime"){min=-1;max=30;step=.001;unit="seconds; -1 = authored hit";}
  return number("visual."+key,key==="animationPlayback"?"Rider animation playback":key.indexOf("impact")===0?"On-hit "+label(key.slice(6)).toLowerCase():label(key),min,max,step,unit);
}).map(function(field){var key=field.key,slot=/^(physicalShield|channelHit|presence|defense|passive|beam|mark|buff|taunt|shield|castSecondary|cast)/.exec(key),purpose=slot?{passive:"the state-driven passive aura",beam:"Mystic's continuous beam",mark:"the overhead target mark",buff:"the fighting style's active buff aura",taunt:"the one-shot effect above each taunted enemy",shield:"Guardian's body shield",cast:"the complete active-skill effect at its captured cast position",castSecondary:"Blood Cleave's second simultaneous body-centered cast effect",channelHit:"the electrified effect on Mystic's current beam target",presence:"Guardian's protection aura on each nearby ally",defense:"Guardian's one-shot defense appearance",physicalShield:"Guardian's physical shield appearance and sustain"}[slot[1]]:"";
  if(slot)field.label=label(key).replace(/Resource Animation$/,"VFX animation").replace(/Resource$/,"VFX asset");
  field.help=VISUAL_HELP[key]||(slot?(field.type==="vfx"?"Imported VFX for "+purpose+". Empty disables this artwork without affecting gameplay.":field.type==="effect-animation"?"Animation from the selected VFX; flipbooks use their imported timing.":/Delay$/.test(key)?"Seconds before "+purpose+" appears. Independent of the other effect layers and damage timing. The effect still stops as soon as its owning buff or target ends.":/Offset/.test(key)?"Visual offset for "+purpose+" in world units; positive Y moves upward. Damage geometry is unchanged.":/Scale/.test(key)?"Size multiplier for "+purpose+". Minimum scale is the size at the lowest passive intensity.":/PlaybackRate$/.test(key)?"Saved playback multiplier for "+purpose+". 0.5 is half speed; 2 is double speed. Buff duration and damage are unchanged. "+(slot[1]==="beam"?"Beam formation stays fitted to the rider's windup; this changes the connected loop and release.":""):/Playback/.test(key)?"Animation speed at minimum or maximum passive intensity. Speed blends with stacks, momentum or missing HP without seeking the animation.":/Opacity/.test(key)?"Opacity of "+purpose+" from 0 (hidden) to 1 (fully visible).":/Color/.test(key)?"Optional tint for "+purpose+". Empty preserves the imported colors.":/Rotation/.test(key)?"Visual rotation in degrees; gameplay direction is unchanged.":key==="beamWidth"?"Displayed beam thickness in world units. Origin and target flares keep their proportions.":key==="beamEndDuration"?"Seconds for the release frames after a beam stops or switches targets.":key==="markSpawnDuration"?"Seconds for the non-looping mark to appear before its persistent loop.":"Presentation setting for "+purpose+"; does not change gameplay."):undefined);return field;});
visualFields.forEach(function(field){if(/^channelTrail/.test(field.key)){field.group="Passive trail";field.label={channelTrailSpeed:"Trail travel speed",channelTrailWidth:"Trail width",channelTrailLength:"Trail fade after arrival",channelTrailColor:"Trail color",channelTrailOpacity:"Trail opacity"}[field.key];field.help=field.key==="channelTrailLength"?"Fade time after a complete pass reaches the other unit, as a fraction of that pass's travel time. Each new strand connects both units in full, so increasing distance never opens a gap.":field.key==="channelTrailSpeed"?"Visual travel speed along the complete connection. A finished strand begins fading only after arrival. Standing units have a straight line; movement leaves a smooth curve. Attack timing is unchanged.":"Appearance of Mystic's complete connection to its target. Width is in world units; movement bends the line while idle weapon animation keeps it straight.";}});
visualFields.forEach(function(field){
  if(field.key==="channelTrailTailWidth"){field.label="Trail tail width";field.help="Tail width as a fraction of the head width. 0 is a point; 1 keeps the full head width. The head retains Trail width.";}
  if(field.key==="channelTrailTailColor"){field.label="Trail tail color";field.help="Light color at the thin tail. The ribbon blends into Trail head color as it widens toward the head.";}
  if(field.key==="channelTrailColor")field.label="Trail head color";
});
visualFields.forEach(function(field){
  if(/Pivot[XY]$/.test(field.key)){field.unit="source units from center";field.help="Rotation and flip pivot within this effect, in imported source units from its center. Zero uses the center; positive "+field.key.slice(-1)+" selects a point "+(field.key.slice(-1)==="X"?"to the right":"above it")+". Use Transform > Pivot to drag the pivot while keeping the artwork in place. Numeric edits move artwork around the fixed skill origin; the gold hit indicator and damage stay unchanged.";}
  if(/Flip[XY]$/.test(field.key))field.help="Flip this effect "+(field.key.slice(-1)==="X"?"horizontally":"vertically")+" around its own pivot before aiming it toward the target. Independent of the other cast effect; damage is unchanged.";
});
var audioFields=[];
AUDIO_PHASES.forEach(function(phase){
  var anchor=phase==="cast"?"skill confirmation":phase==="impact"?"the actual enemy hit":phase==="explosion"?"Mystic's actual Arcane Burst explosion":"the visible Mystic beam start";
  audioFields.push({path:"audio."+phase+".clip",key:"clip",label:label(phase)+" sound",type:"audio",phase:phase,emptyLabel:"No custom sound",help:"Custom "+phase+" sound anchored to "+anchor+". Empty preserves the built-in sound behavior; audio preview remains optional."});
  audioFields.push(Object.assign(number("audio."+phase+".volume",label(phase)+" volume",0,1,.01),{phase:phase,help:"Volume multiplier for this custom "+phase+" cue, before the player's effects-volume setting. 1 is full volume and 0 is silent."}));
  audioFields.push(Object.assign(number("audio."+phase+".delay",label(phase)+" delay",0,30,.01,"seconds"),{phase:phase,help:"Gameplay seconds after "+anchor+" before this sound starts. Independent of visual on-hit delay; use matching values to align them."}));
});
function fields(style){
  if(style==='skirmisher'){
    var volleyVisual=visualFields.filter(function(field){return ['arcDegrees','animation','castDelay'].indexOf(field.key)>=0||field.key.indexOf('impact')===0;}).map(function(field){return Object.assign({},field);});
    volleyVisual.forEach(function(field){
      if(field.key==='arcDegrees')Object.assign(field,{label:'Arrow spread',min:1,max:180,step:1,unit:'degrees',help:'Angle between the two outer arrows. Five paths are spaced evenly around the aim direction.'});
      if(field.key==='castDelay')Object.assign(field,{label:'Cast start delay',help:'Extra gameplay seconds before the bow release.'});
    });
    return {tuning:Descriptions.fields(style).concat(tuningFields(style)),visual:volleyVisual,audio:clone(audioFields).filter(function(field){return field.phase==="cast"||field.phase==="impact";})};
  }
  var visual=clone(visualFields).filter(function(field){
    if((style==="fighter"||style==="bruiser")&&["passiveMinScale","passiveMinPlayback","passivePlayback"].indexOf(field.key)>=0||style==="bruiser"&&field.key==="passiveOpacity")return false;
    if(/(?:Pivot|Flip)[XY]$/.test(field.key))return style==="bruiser";
    if(/^channelTrail/.test(field.key))return style==="mystic";
    if(style==="mystic"&&/^(beam|channelHit)/.test(field.key))return false;
    if(field.key==="castPlaybackRate"&&style==="vanguard")return false;
    var slot=/^(physicalShield|channelHit|presence|defense|passive|beam|mark|buff|taunt|shield|castSecondary|cast)/.exec(field.key);
    if(slot){if(slot[1]==="castSecondary")return style==="bruiser";if(slot[1]==="cast")return true;if(slot[1]==="buff")return ["fighter","vanguard","guardian"].indexOf(style)>=0;if(slot[1]==="passive")return ["fighter","bruiser"].indexOf(style)>=0;if(slot[1]==="beam"||slot[1]==="mark"||slot[1]==="channelHit")return style==="mystic";return style==="guardian";}
    if(["holdTime","targetX","targetY"].indexOf(field.key)>=0)return style==="mystic";
    if(["originX","originY"].indexOf(field.key)>=0)return style==="mystic";
    if(field.key==="arcDegrees")return style==="fighter"||style==="vanguard";
    if(field.key==="arcStartWidth")return style==="vanguard";
    return true;
  });
  var tuning=Descriptions.fields(style).concat(tuningFields(style));
  if(style!=='mystic')visual.forEach(function(field){
    if(field.key==='offsetX'||field.key==='offsetY'){field.label=(style==='bruiser'?'Body':'Weapon')+' offset '+field.key.slice(-1);field.help=style==='bruiser'?'Moves Blood Cleave hit area and both cast layers relative to the animated torso. Positive Y moves upward. Zero centers the cleave on the body.':'Moves both the active skill hit area and its artwork relative to the equipped weapon tip. Positive Y moves upward. Zero uses the weapon tip automatically.';}
    if(field.key==='scale'){field.label=style==='fighter'||style==='vanguard'?'Arc size':'Area size';field.help=style==='bruiser'?'Scales the circular hit area and both cast layers together around the animated torso. 0.5 is half the radius; 1 uses the normal radius.':'Scales the active skill hit area and artwork together around the weapon point. 0.5 is half the reach; 1 uses the normal reach.';}
    if(field.key==='rotation'){field.label='Skill rotation';field.help='Rotates the active skill hit area and its artwork together around the weapon point.';}
    if(field.key==='arcDegrees'){field.label='Arc angle';field.min=1;field.max=360;field.step=1;field.unit='degrees';field.help='Total angle of the visible arc and its damage area. A smaller angle makes a narrower swing; 360 makes a complete circle.';}
  });
  return {tuning:tuning,visual:visual,audio:clone(audioFields).filter(function(field){return field.phase!=="channel"&&field.phase!=="explosion"||style==="mystic";})};
}
function descriptors(style){var f=fields(style);return f.tuning.concat(f.visual,f.audio);}
function get(object,path){return path.split(".").reduce(function(value,key){return value&&typeof value==="object"?value[key]:undefined;},object);}
function valid(descriptor,value){
  if(descriptor.type==="description")return !Descriptions.error(descriptor.style,value);
  if(descriptor.type==="boolean")return typeof value==="boolean";
  if(descriptor.type==="number")return typeof value==="number"&&isFinite(value)&&value>=descriptor.min&&value<=descriptor.max&&(!descriptor.integer||Math.floor(value)===value);
  if(typeof value!=="string")return false;
  if(descriptor.type==="projectile")return value.length<=512&&!/[\u0000-\u001f]/.test(value);
  if(descriptor.type==="audio"||descriptor.type==="vfx")return value===""||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[a-z0-9]+)?$/i.test(value);
  if(descriptor.type==="color")return value===""||/^#[0-9a-f]{6}$/i.test(value);
  return value.length<=150&&!/[\u0000-\u001f]/.test(value);
}
function playbackRate(value){return typeof value==="number"&&isFinite(value)&&value>=.05&&value<=4?value:1;}
function animationPlaybackRate(style,visual){return style==="skirmisher"?1:playbackRate(visual&&visual.animationPlayback);}
function defaults(style){
  style=known(style)?style:"skirmisher";
  var result=Object.assign({},Core.DEFAULTS.common,Core.DEFAULTS[style],{descriptions:Descriptions.defaults(style),visual:clone(VISUAL),audio:{cast:clone(AUDIO),impact:clone(AUDIO),channel:clone(AUDIO)}}),v=result.visual;
  if(style==="mystic")result.audio.explosion=clone(AUDIO);
  var preset=VFXCatalog.presets[style]||{};Object.keys(preset).forEach(function(slot){var clip=VFXCatalog.clips.filter(function(row){return row.id===preset[slot];})[0];if(clip)applyClip(v,slot+"Resource",clip);});
  if(style==="fighter")Object.assign(v,{passiveScale:1.15,buffScale:1.65,buffColor:"#fff0d0",castScale:.8});
  if(style==="vanguard")Object.assign(v,{buffScale:1.65,buffOffsetY:0,castScale:1,castRotation:0});
  if(style==="bruiser")Object.assign(v,{passiveScale:1.4,passiveScaleX:1.5,castScale:1.2});
  if(style==="mystic")Object.assign(v,{beamScale:.65,markScale:.45,channelHitScale:1,castScale:1});
  if(style==="guardian")Object.assign(v,{buffScale:1.8,tauntScale:1.1,shieldScale:1.5,shieldOffsetY:0,shieldOpacity:.85,presenceScale:1.3,presenceOffsetY:0,defenseScale:.48,physicalShieldScale:.31});
  if(style==="vanguard")v.arcDegrees=72;if(style==="skirmisher")v.arcDegrees=16;
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
var IMPACT_VISUAL_FIELDS=["resource","resourceAnimation","resourceBundle","resourcePath","resourceKind","resourceFrames","resourceColumns","resourceCell","resourceFps","resourceLoop","scale","rotation","opacity","color","offsetX","offsetY","playbackRate"].map(function(key){return {key:key,source:"impact"+key.charAt(0).toUpperCase()+key.slice(1)};});
function impactValue(value,key) {
  // Match the previous merge's own enumerable fields, including an explicit
  // undefined override. Unrelated visual fields never need to be copied here.
  return value&&Object.prototype.propertyIsEnumerable.call(value,key)?value[key]:VISUAL[key];
}
function impactVisual(value) {
  var result={};
  IMPACT_VISUAL_FIELDS.forEach(function(field){result[field.key]=impactValue(value,field.source);});
  result.effectDuration=impactValue(value,"impactDuration");result.delay=impactValue(value,"impactDelay");return result;
}
function resourceVisual(value,prefix){
  var result={};["resource","resourceAnimation","resourceBundle","resourcePath","resourceKind","resourceFrames","resourceColumns","resourceCell","resourceFps","resourceLoop","resourcePremultipliedAlpha"].forEach(function(key){result[key]=value[prefix+key.slice(8)];});
  var slot=prefix.replace(/Resource$/,"");["scale","scaleX","scaleY","rotation","opacity","color","offsetX","offsetY","pivotX","pivotY","flipX","flipY","playbackRate"].forEach(function(key){result[key]=value[slot+key.charAt(0).toUpperCase()+key.slice(1)];});return result;
}
function applyClip(value,prefix,clip){
  ["Frames","Columns","Cell","Fps","Loop","PremultipliedAlpha"].forEach(function(key){delete value[prefix+key];});
  value[prefix]=clip.uuid;value[prefix+"Kind"]=clip.kind==="spine"?"spine":"sprite";value[prefix+"Bundle"]=clip.bundle;value[prefix+"Path"]=clip.resource;
  if(clip.kind==="spine"){value[prefix+"Animation"]=clip.animation;value[prefix+"PremultipliedAlpha"]=clip.premultipliedAlpha!==false;}
  ["frames","columns","cell","fps","loop"].forEach(function(key){if(clip[key]!==undefined)value[prefix+key.charAt(0).toUpperCase()+key.slice(1)]=clip[key];});
  if(prefix==="castResource"){delete value.castTrajectory;if(clip.trajectory)value.castTrajectory=clip.trajectory;}
}
function projectileVisual(value){
  var asset=value&&value.projectileAsset;
  if(!value||!value.projectile||!asset||asset.id!==value.projectile||!valid({type:'vfx'},asset.uuid)||!asset.uuid||
    !/^(sprite|spine)$/.test(asset.kind)||typeof asset.bundle!=='string'||!/^[a-z0-9_-]+$/i.test(asset.bundle)||
    typeof asset.path!=='string'||!asset.path||/\\|:|(^|\/)\.\.?($|\/)|[\u0000-\u001f]/.test(asset.path)||asset.path[0]==='/')return value;
  var result=Object.assign({},value);
  ['Frames','Columns','Cell','Fps','Loop','Skin','Rotation','PremultipliedAlpha','Trail'].forEach(function(key){delete result['resource'+key];});
  Object.assign(result,{resource:asset.uuid,resourceBundle:asset.bundle,resourcePath:asset.path,resourceKind:asset.kind,resourceAnimation:asset.animation||'',showBuiltin:false});
  if(typeof asset.skin==='string'&&asset.skin.length<=150&&!/[\u0000-\u001f]/.test(asset.skin))result.resourceSkin=asset.skin;
  if(typeof asset.rotation==='number'&&isFinite(asset.rotation))result.resourceRotation=asset.rotation;
  if(typeof asset.premultipliedAlpha==='boolean')result.resourcePremultipliedAlpha=asset.premultipliedAlpha;
  var trail=asset.trail;
  if(trail&&typeof trail.id==='string'&&valid({type:'vfx'},trail.textureUuid)&&/^[a-z0-9_-]+$/i.test(trail.bundle)&&
    typeof trail.resource==='string'&&trail.resource&&trail.resource[0]!=='/'&&!/\\|:|(^|\/)\.\.?($|\/)|[\u0000-\u001f]/.test(trail.resource)&&
    /^#[a-f\d]{6}$/i.test(trail.color)&&isFinite(trail.width)&&trail.width>0&&trail.width<=64&&isFinite(trail.lifetime)&&trail.lifetime>0&&trail.lifetime<=2&&
    (trail.opacity===undefined||isFinite(trail.opacity)&&trail.opacity>=0&&trail.opacity<=255)&&
    ['offsetX','offsetY'].every(function(key){return trail[key]===undefined||typeof trail[key]==='number'&&isFinite(trail[key])&&Math.abs(trail[key])<=256;}))result.resourceTrail=trail;
  var book=asset.flipbook,frames=book&&flipbook({resourceFrames:book.frames,resourceColumns:book.columns,resourceCell:book.cell,resourceFps:book.fps,resourceLoop:book.loop});
  if(frames)Object.keys(frames).forEach(function(key){result['resource'+key.charAt(0).toUpperCase()+key.slice(1)]=frames[key];});
  return result;
}
function effective(style,config){
  var result=defaults(style),saved=config&&config.HeroSkills&&config.HeroSkills[style];
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return result;
  // Resolve this call's editable contract once. Building it for every resource
  // slot repeatedly clones the same large field list during draft snapshots.
  var editable=descriptors(style);
  // The requested reversal belongs to the built-in Blood Cleave pair. Keep
  // legacy/custom asset selections unchanged unless their own flip is saved.
  if(style==='bruiser'&&saved.visual)["cast","castSecondary"].forEach(function(slot){var resource=saved.visual[slot+"Resource"];if(Object.prototype.hasOwnProperty.call(saved.visual,slot+"Resource")&&valid({type:'vfx'},resource)&&resource!==result.visual[slot+"Resource"])result.visual[slot+"FlipX"]=false;});
  if(style==='guardian'&&saved.visual&&Object.prototype.hasOwnProperty.call(saved.visual,'physicalShieldResource')&&valid({type:'vfx'},saved.visual.physicalShieldResource)&&saved.visual.physicalShieldResource!==result.visual.physicalShieldResource&&saved.visual.physicalShieldScale===undefined)result.visual.physicalShieldScale=.48;
  // An existing custom/disabled cleave keeps its complete authored appearance.
  // The newly introduced second default belongs to the new built-in pair only;
  // an explicitly selected secondary still takes precedence below.
  if(style==='bruiser'&&saved.visual&&Object.prototype.hasOwnProperty.call(saved.visual,'castResource')&&valid({type:'vfx'},saved.visual.castResource)&&saved.visual.castResource!==result.visual.castResource&&!Object.prototype.hasOwnProperty.call(saved.visual,'castSecondaryResource')){
    Object.keys(result.visual).forEach(function(key){if(key.indexOf('castSecondaryResource')===0)delete result.visual[key];});result.visual.castSecondaryResource='';
  }
  RESOURCE_PREFIXES.forEach(function(prefix){var value=saved.visual&&saved.visual[prefix],field=editable.filter(function(row){return row.path==="visual."+prefix;})[0],ownAnimation=saved.visual&&Object.prototype.hasOwnProperty.call(saved.visual,prefix+'Animation');if(field&&valid(field,value)&&value!==result.visual[prefix])Object.keys(result.visual).forEach(function(key){if(key!==prefix&&(key!==prefix+"Animation"||!ownAnimation)&&key.indexOf(prefix)===0)delete result.visual[key];});});
  editable.forEach(function(field){var value=get(saved,field.path);if(value!==undefined&&valid(field,value))set(result,field.path,value);});
  RESOURCE_PREFIXES.reduce(function(paths,prefix){return paths.concat("visual."+prefix+"Bundle","visual."+prefix+"Path","visual."+prefix+"Kind");},[]).concat(AUDIO_PHASES.reduce(function(paths,phase){return paths.concat("audio."+phase+".bundle","audio."+phase+".path");},[])).forEach(function(path){var match=RESOURCE_PREFIXES.filter(function(prefix){return path.indexOf("visual."+prefix)===0;}).sort(function(a,b){return b.length-a.length;})[0];if(match&&RESOURCE_PREFIXES.indexOf(match)>=2&&get(saved,"visual."+match)!==result.visual[match])return;var value=get(saved,path),kind=/Kind$/.test(path),bundle=/Bundle$|\.bundle$/.test(path);if(typeof value!=="string"||value.length>500||/[\u0000-\u001f]/.test(value))return;if(kind&&!/^(sprite|spine)$/.test(value))return;if(bundle&&!/^[a-z0-9_-]+$/i.test(value))return;if(!kind&&!bundle&&(!value||/\\|:|(^|\/)\.\.?($|\/)/.test(value)||value[0]==='/'))return;set(result,path,value);});
  RESOURCE_PREFIXES.forEach(function(prefix){if(RESOURCE_PREFIXES.indexOf(prefix)>=2&&get(saved,"visual."+prefix)!==result.visual[prefix])return;var raw={};["Frames","Columns","Cell","Fps","Loop"].forEach(function(key){raw["resource"+key]=saved.visual&&saved.visual[prefix+key];});var frames=flipbook(raw);if(frames)Object.keys(frames).forEach(function(key){result.visual[prefix+key.charAt(0).toUpperCase()+key.slice(1)]=frames[key];});});
  RESOURCE_PREFIXES.forEach(function(prefix){if(saved.visual&&Object.prototype.hasOwnProperty.call(saved.visual,prefix+'Animation'))return;var id=result.visual[prefix],clip=id&&VFXCatalog.clips.filter(function(clip){return clip.uuid===id||clip.id===id;})[0];if(clip&&clip.kind==='spine')result.visual[prefix+'Animation']=clip.animation;});
  delete result.visual.castTrajectory;
  if(result.visual.castResource){var castClip=VFXCatalog.clips.filter(function(clip){return clip.uuid===result.visual.castResource||clip.id===result.visual.castResource;})[0];delete result.visual.castTrajectory;if(castClip&&castClip.trajectory)result.visual.castTrajectory=castClip.trajectory;}
  // Resolve saved selections of the retired Battle Cry aura as an empty slot.
  if(style==="fighter"&&(result.visual.buffResource==="7099be28-1ad2-53e1-b671-0250e261c93d"||result.visual.buffResourcePath==="vfx/hero-skills/fighter-meshy-center")){
    Object.keys(result.visual).forEach(function(key){if(key.indexOf("buffResource")===0)delete result.visual[key];});
    result.visual.buffResource="";
  }
  return result;
}
function validateStyle(style,value){
  if(!known(style))throw Error("Choose one of the six hero fighting styles.");
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("A skill override must be an object.");
  ["visual","audio","descriptions"].forEach(function(group){if(value[group]!==undefined&&(!value[group]||typeof value[group]!=="object"||Array.isArray(value[group])))throw Error("Invalid "+group+" skill settings.");});
  AUDIO_PHASES.forEach(function(phase){var audio=value.audio&&value.audio[phase];if(audio!==undefined&&(!audio||typeof audio!=="object"||Array.isArray(audio)))throw Error("Invalid "+phase+" sound settings.");});
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
exports.styles=styles;exports.tuningFields=tuningFields;exports.visualFields=visualFields;exports.audioFields=audioFields;exports.audioPhases=AUDIO_PHASES;exports.fields=fields;exports.descriptors=descriptors;exports.defaults=defaults;exports.effective=effective;exports.validateStyle=validateStyle;exports.valid=valid;exports.get=get;exports.set=set;
exports.riderAnimations=riderAnimations;
exports.flipbook=flipbook;
exports.impactVisual=impactVisual;

exports.resourcePrefixes=RESOURCE_PREFIXES;exports.resourceVisual=resourceVisual;exports.applyClip=applyClip;
exports.projectileVisual=projectileVisual;
exports.playbackRate=playbackRate;exports.animationPlaybackRate=animationPlaybackRate;
