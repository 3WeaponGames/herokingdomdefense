"use strict";
// Authoring views select existing settings paths. They never migrate, default,
// or mutate a saved skill merely because an inspector is opened.
var VFXCatalog=require("./HeroSkillVFXCatalog");
var VanguardSpear=require("./VanguardSpearVFX");
var ACTIVE={skirmisher:"Arrow Volley",fighter:"Battle Cry",vanguard:"Spear Barrage",mystic:"Arcane Burst",bruiser:"Blood Cleave",guardian:"Iron Bulwark"};
var PASSIVE={fighter:"Combat Stacks",vanguard:"Momentum",mystic:"Electric Channel",bruiser:"Blood Rage",guardian:"Protective Presence"};
var NOTES={
  skirmisher:{active:"Fire five equipped arrows in a spread. Each arrow travels straight and disappears when it hits its first enemy."},
  fighter:{active:"An arc slash pushes enemies back and starts the damage and attack-speed buff.",passive:"Landed melee hits fill the stack bar. The final hit grants the full buff and plays the activation effect once. Later hits refresh the buff duration."},
  vanguard:{active:"One rider cast releases a directional effect with multiple timed hits. Each contact checks enemies in the committed arc.",passive:"Moving builds Momentum and increases movement speed. The first landed hit locks the current amount and grants attack speed until Momentum resets."},
  mystic:{active:"Burst around the marked target. Same-target hits increase damage and the splash area; Crystal Orb upgrades affect active damage.",passive:"A continuous single-target channel slows and marks its victim. The target effect lasts only while the channel is connected."},
  bruiser:{active:"Pay current HP first, then hit the circular area. Landed damage can restore HP through the Skull Charm.",passive:"Missing HP increases damage and attack speed. The aura appears at 90% HP and brightens every 5% HP lost."},
  guardian:{active:"Raise the shield, play the cast effects and taunt nearby enemies. Shield and body effects end with their owning buff.",passive:"Nearby protected allies display the aura only while they receive the passive damage reduction."}
};
var TUNING={
  skirmisher:{active:["cooldown","activeDamage","windup","volleyRange"]},
  fighter:{active:["cooldown","buffDuration","buffDamage","buffAttackRate","knockback"],passive:["maxStacks","stackDuration","stackDamage","stackReduction","stackTenacity"]},
  vanguard:{active:["cooldown","duration","strikes","strikeDamage","moveScaling","attackScaling","referenceMove","castDuration","hitDelay"],passive:["chargeRate","chargeDecay","buffDuration","momentumMove","momentumAttackRate"]},
  mystic:{active:["cooldown","activeDamage","chargeDamage","maxCharges","splashRadius","baseSplashRadius","splashRadiusPerCharge","splashGrowth","radiusGrowth","radiusPerCharge","maxSplashRadius","explosionTime"],passive:["slow","slowDuration","maxCharges"]},
  bruiser:{active:["cooldown","activeDamage","sacrifice"],passive:["missingDamage","missingAttackRate"]},
  guardian:{active:["cooldown","shieldHealth","shieldDuration","tauntDuration","tauntRadius"],passive:["allyReduction","allyRadius"]}
};
var SLOT_NAMES={passive:"Passive aura",beam:"Channel beam",mark:"Target mark",buff:"Buff aura",taunt:"Taunted enemy",shield:"Body shield",target:"Target electricity",channelHit:"Target electricity",cast:"Cast effect",castSecondary:"Second cast effect",defense:"Shield cast",physicalShield:"Shield loop",presence:"Protected ally"};
var SLOT_MAP={
  fighter:{active:["buff","cast"],passive:["passive"]},
  vanguard:{active:["cast"],passive:["buff"]},
  skirmisher:{active:[],passive:[]},
  mystic:{active:["cast"],passive:["mark"]},
  bruiser:{active:["cast","castSecondary"],passive:["passive"]},
  guardian:{active:["buff","cast","taunt","shield","defense","physicalShield"],passive:["presence"]}
};
// Every exposed slot has the same saved/runtime transform contract.
var TRANSFORM_SLOTS=["passive","beam","mark","buff","taunt","shield","cast","castSecondary","channelHit","presence","defense","physicalShield"];
function entries(style){
  if(!ACTIVE[style])return [];
  var result=[{id:"active",kind:"active",name:ACTIVE[style],mode:"active",help:NOTES[style].active}];
  if(PASSIVE[style])result.push({id:"passive",kind:"passive",name:PASSIVE[style],mode:"basic",help:NOTES[style].passive});
  return result;
}
function entry(style,id){return entries(style).filter(function(row){return row.id===id;})[0]||entries(style)[0];}
function slotName(style,slot){
  if(slot==="passive"&&style==="fighter")return "Stack activation";
  if(slot==="buff"&&style==="fighter")return "Active center aura";
  if(slot==="buff"&&style==="vanguard")return "Locked momentum buff";
  if(slot==="passive"&&style==="guardian")return "Protected ally";
  if(slot==="cast"&&style==="guardian")return "Taunt ring";
  return SLOT_NAMES[slot]||slot.replace(/([A-Z])/g," $1");
}
function slotOf(key){var match=/^(passive|beam|mark|buff|taunt|shield|channelHit|castSecondary|cast|defense|physicalShield|presence)(?=[A-Z])/.exec(key);return match&&match[1];}
function slots(style,id){return (SLOT_MAP[style]&&SLOT_MAP[style][id]||[]).slice();}
function fields(style,id,source,effective,catalogs){
  var selected=entry(style,id),result={tuning:[],visual:[],audio:[]};if(!selected)return result;id=selected.id;
  var allowed=(TUNING[style]&&TUNING[style][id]||[]).slice(),allowedSlots=slots(style,id);var currentVisual=effective&&effective.visual||{},fullCast=!!(currentVisual.castResource||currentVisual.castSecondaryResource)&&!currentVisual.resource,authoredSpear=style==="vanguard"&&/vanguard-spear-(?:barrage|thrust)$/.test(currentVisual.castResourcePath||"");if(id==="active")allowed.push("contactDelay");
  var equippedSpear=style==="vanguard"&&VFXCatalog.clips.some(function(clip){return VanguardSpear.selected(clip)&&(clip.uuid===currentVisual.castResource||clip.id===currentVisual.castResource);});
  ["tuning","visual","audio"].forEach(function(group){
    (source&&source[group]||[]).forEach(function(original){
      var field=Object.assign({},original),key=field.key||String(field.path||"").split(".").pop(),slot=slotOf(key);
      if((key==="castAreaScale"||key==="castSpearScale")&&!equippedSpear)return;
      if(field.type==="description"){if(field.entry===id){field.group="Skill description";result.tuning.push(field);}return;}
      if(group==="visual"&&field.type==="effect-animation"){
        var resourceKey=(field.resourcePath||field.path.replace(/Animation$/,"")).split(".").pop(),resource=currentVisual[resourceKey],kind=currentVisual[resourceKey+"Kind"];
        var nativeClip=VFXCatalog.clips.some(function(clip){return clip.uuid===resource||clip.id===resource;});
        var asset=(catalogs&&catalogs.vfx||[]).filter(function(row){return (row.id||row.uuid)===resource;})[0];if(!kind&&asset)kind=asset.kind;
        // Authored catalog clips own their phase animation. Flipbooks have no
        // selectable Spine track; retain the picker for custom Spine assets.
        if(!resource||nativeClip||kind==="sprite"||kind==="flipbook")return;
      }
      if(group==="visual"&&style==="mystic"&&id==="active"&&(["animation","animationPlayback"].indexOf(key)>=0||fullCast&&["offsetX","offsetY","rotation","scale"].indexOf(key)>=0))return;
      // Ordinary hammer-hit feedback has no Iron Bulwark event. Circular
      // areas have no facing angle unless custom artwork consumes rotation.
      if(id==="active"&&group==="visual"&&(style==="guardian"&&key.indexOf("impact")===0||/^(guardian|bruiser)$/.test(style)&&key==="rotation"&&!currentVisual.resource))return;
      if(group==="tuning"){if(allowed.indexOf(key)<0||authoredSpear&&key==="strikes")return;field.group="Gameplay";if(style==='mystic'&&key==='contactDelay'){field.label='Additional actual hit delay';field.help='Extra gameplay seconds after the selected explosion source frame before damage, lifesteal and hit feedback. Zero keeps the actual hit synchronized to the explosion. This does not shift the cast VFX.';}if(authoredSpear&&key==="duration"){field.label="Barrage duration (VFX + hits)";field.help="Saved duration of the complete spear effect and all matching contacts. Shorter durations play faster; longer durations play slower. Rider animation speed is independent.";}}
      else if(group==="audio"){
        var phase=field.phase||String(field.path||"").split(".")[1];
        if(style==="guardian"&&id==="active"&&phase==="impact")return;
        if(id==="passive"?(style!=="mystic"||phase!=="channel"):phase==="channel")return;
        field.group=id==="passive"?"Channel sound":phase==="impact"?"Enemy contact":phase==="explosion"?"Arcane Burst explosion":"Skill cast";
      }else if(style==="skirmisher"&&key==="castDelay"){field.group="Rider cast";
      }else if(/^channelTrail/.test(key)){if(style!=="mystic"||id!=="passive")return;field.group="Passive trail";
      }else if(slot){
        if(style==='guardian'&&['buff','defense','shield'].indexOf(slot)>=0&&!currentVisual[slot+'Resource'])return;
        if(allowedSlots.indexOf(slot)<0||slot==="shield"&&!currentVisual.shieldResource&&currentVisual.physicalShieldResource)return;field.group=slotName(style,slot);
      }else if(id==="passive"){
        if(style!=="mystic"||["originX","originY","targetX","targetY","holdTime","animation","animationPlayback"].indexOf(key)<0)return;
        field.group=key==="holdTime"||key==="animation"||key==="animationPlayback"?"Channel animation":"Channel endpoints";
      }else {
        if(fullCast&&["resource","resourceAnimation","resourcePlaybackRate","showBuiltin","lineWidth","color","opacity","effectDuration"].indexOf(key)>=0)return;
        if(["originX","originY","targetX","targetY","holdTime"].indexOf(key)>=0)return;
        if(key.indexOf("impact")===0)field.group="Enemy contact";
        else if(key==="animation"||key==="animationPlayback")field.group="Rider cast";
        else field.group=style==="skirmisher"?"Arrow paths":style==="mystic"?"Marked-target burst":style==="guardian"?"Taunt area":"Skill effect";
      }
      if(group==="visual"&&slot&&!(style==="skirmisher"&&key==="castDelay")){
        var suffix=key.slice(slot.length).replace(/([A-Z])/g," $1").trim();
        field.label=slotName(style,slot)+" "+(suffix==="Resource Animation"?"VFX animation":suffix==="Resource"?"VFX asset":suffix.replace(/^./,function(c){return c.toLowerCase();}));
        if(key==="castDelay"){
          var castClip=VFXCatalog.clips.find(function(clip){return clip.uuid===currentVisual.castResource;});
          field.label=castClip&&castClip.startOnImpact?"Additional impact delay":"Additional VFX start delay";
          if(castClip&&castClip.startOnImpact)field.help=style==="guardian"?"Extra seconds before the taunt and its ring appear.":"Extra seconds before the hit and its slash effect.";
        }
      }
      if(style==='vanguard'&&id==='active'&&group==='visual'){
        if(key==='castAreaScale')field.label='VFX area';
        if(key==='castSpearScale')field.label='Spear sprite size';
        if(/^(?:cast)?[Oo]ffset[XY]$/.test(key)){field.label=(key.indexOf('cast')===0?'Cast effect ':'Arc ')+(key.slice(-1)==='X'?'along spear offset':'across spear offset');field.help='Offset from the spearhead in the spear’s own axes. This placement rotates and mirrors with the spear, so the same fit works in every direction.';}
        if(key==='castRotation')field.help='Additional artwork rotation around its attachment point at the spearhead.';
        if(key==='rotation')field.help='Rotate the spear aim, the center-bottom arc pivot and the attached cast effect together.';
      }
      if(style==='bruiser'&&id==='active'&&group==='visual'){
        if(/Pivot[XY]$/.test(key))field.label=slotName(style,slot)+" pivot "+key.slice(-1)+" from center";
        if(/Flip[XY]$/.test(key))field.label=slotName(style,slot)+(key.slice(-1)==="X"?" flip horizontally":" flip vertically");
        if(/^(cast|castSecondary)Rotation$/.test(key))field.help="Artwork rotation around this effect's editable pivot, relative to the captured target direction. The pivot stays on the skill origin; damage is unchanged.";
      }
      result[group].push(field);
    });
  });
  // Keep each independent effect together even if the schema adds another
  // property after the common fields. Stable ordering preserves field focus.
  Object.keys(result).forEach(function(group){var order=[];result[group].forEach(function(field){if(order.indexOf(field.group)<0)order.push(field.group);});result[group].sort(function(a,b){return order.indexOf(a.group)-order.indexOf(b.group);});});
  return result;
}
function handles(style,id,visual){
  var selected=entry(style,id);if(!selected)return [];id=selected.id;visual=visual||{};
  var result=[];
  if(id==="active"&&style!=="skirmisher"&&!(style==="mystic"&&visual.castResource&&!visual.resource))result.push(["effect",style==="mystic"?"Burst landing position":"Skill origin"]);
  if(id==="passive"&&style==="mystic")result.push(["origin","Scepter origin"],["target","Channel endpoint"]);
  slots(style,id).forEach(function(slot){if(TRANSFORM_SLOTS.indexOf(slot)>=0&&visual[slot+"Resource"])result.push([slot,slotName(style,slot)]);});
  if(id==="active"&&style!=="guardian"&&visual.impactResource)result.push(["impact","On-hit effect"]);
  return result;
}
function transform(style,id,handle,visual){
  var available=handles(style,id,visual),row=available.filter(function(item){return item[0]===handle;})[0];
  if(!row)return null;visual=visual||{};
  var result={id:handle,label:row[1]},prefix=TRANSFORM_SLOTS.indexOf(handle)>=0?handle:handle==="impact"?"impact":handle==="effect"?"":null;
  if(prefix===null){result.x="visual."+handle+"X";result.y="visual."+handle+"Y";return result;}
  result.x="visual."+(prefix?prefix+"OffsetX":"offsetX");result.y="visual."+(prefix?prefix+"OffsetY":"offsetY");
  result.scale="visual."+(prefix?prefix+"Scale":"scale");
  if(prefix&&prefix!=="impact"){result.scaleX="visual."+prefix+"ScaleX";result.scaleY="visual."+prefix+"ScaleY";}
  if(style==="bruiser"&&(prefix==="cast"||prefix==="castSecondary")){result.pivotX="visual."+prefix+"PivotX";result.pivotY="visual."+prefix+"PivotY";}
  if(prefix||!(/^(guardian|bruiser)$/.test(style)&&!visual.resource))result.rotation="visual."+(prefix?prefix+"Rotation":"rotation");
  return result;
}
exports.entries=entries;exports.entry=entry;exports.fields=fields;exports.handles=handles;exports.slots=slots;exports.slotName=slotName;exports.transform=transform;
