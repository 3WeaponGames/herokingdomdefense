"use strict";
// Battle-owned presentation and input only. Damage, targeting and cooldowns
// remain in HeroStyleRuntime; no editor or progression data is written here.
var TITLES = { skirmisher: "hero.skills.skirmisher", fighter: "hero.skills.fighter", vanguard: "hero.skills.vanguard", mystic: "hero.skills.mystic", bruiser: "hero.skills.bruiser", guardian: "hero.skills.guardian" };
var Presentation=require("./HeroSkillPresentation");
var LanguageMgr=require("LanguageMgr").LanguageMgr;
var COOLDOWN_EPSILON=1e-9;
function live(node) { return !!node && (typeof cc === "undefined" || !cc.isValid || cc.isValid(node, true)); }
function ready() { return typeof cc !== "undefined" && cc.Node && cc.Graphics && cc.Label; }
function vec(x,y) { return cc.v2 ? cc.v2(x,y) : new cc.Vec2(x,y); }
function node(parent,name,width,height) { var n=new cc.Node(name); n.setParent(parent); if(width)n.setContentSize(width,height);return n; }
function color(value) { return cc.color(value); }
function graphics(parent,name) { var n=node(parent,name);return {node:n,g:n.addComponent(cc.Graphics)}; }
function text(parent,name,size,y) { var n=node(parent,name);n.y=y||0;var l=n.addComponent(cc.Label);l.fontSize=size;l.lineHeight=size+2;l.horizontalAlign=cc.Label.HorizontalAlign.CENTER;l.verticalAlign=cc.Label.VerticalAlign.CENTER;l.overflow=cc.Label.Overflow.SHRINK;l.enableWrapText=true;n.setContentSize(116,50);n.color=color("#ffffff");if(cc.LabelOutline){var o=n.addComponent(cc.LabelOutline);o.color=color("#13101c");o.width=2;}return l; }
function location(event) { var touch=event&&event.touch;return touch&&touch.getLocation?touch.getLocation():event&&event.getLocation?event.getLocation():null; }
function touchId(event) { var touch=event&&event.touch;return touch&&touch.getID?touch.getID():0; }
function stop(event) { if(event&&event.stopPropagation)event.stopPropagation(); }
function available(rt) { return !!rt && (!rt.available || rt.available()) && !(rt.ui&&rt.ui.isPauset); }
function usable(rt) { if(!available(rt))return false;if(rt.canCast)return rt.canCast();var s=rt.state;return s&&!(s.cooldown>COOLDOWN_EPSILON)&&!s.active&&(s.style!=="mystic"||s.marked&&s.target&&s.target.hp>0&&(!s.target.isDead||!s.target.isDead())); }
function directional(style) { return style==="skirmisher"||style==="fighter"||style==="vanguard"; }
function normalize(p) { var length=p&&Math.hypot(p.x,p.y);return length>0?{x:p.x/length,y:p.y/length}:{x:1,y:0}; }
function rayEnd(origin,direction,bounds) {
  var d=normalize(direction),t=Infinity;
  if(d.x>0)t=Math.min(t,(bounds.maxX-origin.x)/d.x);else if(d.x<0)t=Math.min(t,(bounds.minX-origin.x)/d.x);
  if(d.y>0)t=Math.min(t,(bounds.maxY-origin.y)/d.y);else if(d.y<0)t=Math.min(t,(bounds.minY-origin.y)/d.y);
  if(!isFinite(t)||t<0)t=0;
  return {x:origin.x+d.x*t,y:origin.y+d.y*t};
}
function pointIn(rt,layer,p) { return layer.convertToNodeSpaceAR(rt.game.ndMain.convertToWorldSpaceAR(vec(p.x,p.y))); }
function worldIn(layer,p) { return layer.convertToNodeSpaceAR(p); }
function actorPoint(layer,actor,overhead) {
  var ground=actor.node.convertToWorldSpaceAR(vec(0,0)),bar=actor.ndHp||actor.ctrHp&&actor.ctrHp.node;
  if(bar){var top=bar.convertToWorldSpaceAR(vec(0,overhead?18:0));if(overhead)return worldIn(layer,top);ground=vec(ground.x+(top.x-ground.x)*.55,ground.y+(top.y-ground.y)*.55);}
  else if(overhead)ground.y+=80;
  return worldIn(layer,ground);
}
function tint(value,opacity){var result=color(value);if(result&&typeof result==="object"&&opacity!==undefined)result.a=Math.round((result.a===undefined?255:result.a)*opacity);return result;}
function line(g,a,b,width,value,opacity) { g.lineWidth=width;g.strokeColor=tint(value,opacity);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke(); }
function circle(g,p,r,value,fill,opacity) { if(fill)g.fillColor=tint(value,opacity);else{g.strokeColor=tint(value,opacity);g.lineWidth=3;}g.circle(p.x,p.y,r);if(fill)g.fill();else g.stroke(); }
function offsetIn(rt,layer,p,x,y){var delta=pointIn(rt,layer,{x:x,y:y}),zero=pointIn(rt,layer,{x:0,y:0});return {x:p.x+delta.x-zero.x,y:p.y+delta.y-zero.y};}
function localDirection(rt,screenStart,screenEnd) { var main=rt.game.ndMain,camera=rt.game.camera,a=main.convertToNodeSpaceAR(camera&&camera.getScreenToWorldPoint?camera.getScreenToWorldPoint(screenStart):screenStart),b=main.convertToNodeSpaceAR(camera&&camera.getScreenToWorldPoint?camera.getScreenToWorldPoint(screenEnd):screenEnd);return normalize({x:b.x-a.x,y:b.y-a.y}); }
function aimDefault(rt) {
  var hero=rt.hero,target=hero.tagEnemy;
  if(!target||!live(target.node)||!(target.hp>0)||target.isDead&&target.isDead())target=rt.nearest?rt.nearest():null;
  if(target&&live(target.node)){
    var a=hero.node.getPosition(),b=target.node.getPosition();rt.aimDirection=normalize({x:b.x-a.x,y:b.y-a.y});
  }else{
    var body=hero.ctrPlayAni&&hero.ctrPlayAni.spAniBody,face=body&&body.node?body.node.scaleX:hero.isLeft&&hero.isLeft()?-1:1;
    rt.aimDirection={x:face<0?-1:1,y:0};
  }
}
function buttonStart(hud,event) {
  stop(event);if(hud.press)return;var rt=hud.runtime;
  // A second input surface cancels the owned world gesture. Keep its finger
  // reserved until release so it cannot cast later or turn into movement.
  if(hud.worldTouch){hud.worldTouch.cancelled=true;rt.aiming=false;return;}
  if(!usable(rt))return;
  hud.press={id:touchId(event),start:location(event),time:Date.now(),dragged:false,wasArmed:rt.aiming};
  if(directional(rt.state.style)){rt.aiming=true;aimDefault(rt);}
}
function buttonMove(hud,event) {
  stop(event);var p=hud.press,rt=hud.runtime,at=location(event);if(!p||p.id!==touchId(event)||!at||!p.start)return;
  if(Math.hypot(at.x-p.start.x,at.y-p.start.y)>12)p.dragged=true;
  if(p.dragged&&directional(rt.state.style)&&available(rt)){rt.aiming=true;rt.aimDirection=localDirection(rt,p.start,at);}
}
function buttonEnd(hud,event,cancelled) {
  stop(event);var p=hud.press,rt=hud.runtime;if(!p||p.id!==touchId(event))return;hud.press=null;
  // Cocos sends the node TOUCH_CANCEL when an ordinary touch ends outside
  // the button. Its underlying ENDED code is still 2; native/OS cancellation
  // is code 3 and must not release a skill.
  var outsideRelease=cancelled&&p.dragged&&event&&event.getEventCode&&event.getEventCode()===2;
  if(cancelled&&!outsideRelease||!usable(rt)){rt.aiming=false;return;}
  if(!directional(rt.state.style)){rt.cast();return;}
  if(p.dragged||Date.now()-p.time>=220){rt.cast(rt.aimDirection);return;}
  // A short tap arms direction selection. Tapping the button again cancels.
  rt.aiming=!p.wasArmed;
}
function install(hero,rt) {
  if(!ready()||!rt.ui||!rt.ui.ctrUI||!live(rt.ui.ctrUI.node)||!rt.game||!rt.game.ndUI||!rt.game.ndMain)return null;
  var parent=rt.ui.ctrUI.node,hud={runtime:rt};
  hud.button=node(parent,"Hero active skill",132,118);hud.button.zIndex=80;hud.buttonGraphics=hud.button.addComponent(cc.Graphics);
  if(cc.BlockInputEvents)hud.button.addComponent(cc.BlockInputEvents);
  hud.title=text(hud.button,"Skill name",21,17);hud.status=text(hud.button,"Skill readiness",19,-29);hud.status.node.height=28;
  hud.visual=graphics(rt.game.ndUI,"Hero skill effects");hud.visual.node.zIndex=80;
  var types=cc.Node.EventType;
  hud.button.on(types.TOUCH_START,function(e){buttonStart(hud,e);});hud.button.on(types.TOUCH_MOVE,function(e){buttonMove(hud,e);});
  hud.button.on(types.TOUCH_END,function(e){buttonEnd(hud,e,false);});hud.button.on(types.TOUCH_CANCEL,function(e){buttonEnd(hud,e,true);});
  hero._skillHUD=hud;return hud;
}
function safeBounds(root) {
  if(cc.view&&cc.view.getVisibleSize){var size=cc.view.getVisibleSize(),origin=cc.view.getVisibleOrigin?cc.view.getVisibleOrigin():vec(0,0),safe=cc.sys&&cc.sys.getSafeAreaRect?cc.sys.getSafeAreaRect():{x:origin.x,y:origin.y,width:size.width,height:size.height};var a=root.convertToNodeSpaceAR(vec(Math.max(origin.x,safe.x),Math.max(origin.y,safe.y))),b=root.convertToNodeSpaceAR(vec(Math.min(origin.x+size.width,safe.x+safe.width),Math.min(origin.y+size.height,safe.y+safe.height)));return {left:a.x,right:b.x,bottom:a.y,top:b.y};}
  return {left:-root.width/2,right:root.width/2,bottom:-root.height/2,top:root.height/2};
}
function layout(hud,rt) {
  var parent=hud.button.parent,b=safeBounds(parent),x=b.right-86,y=b.bottom+86;
  [rt.ui.btnAgg,rt.ui.btnFollow].forEach(function(other){if(!live(other)||!other.activeInHierarchy)return;var p=parent.convertToNodeSpaceAR(other.convertToWorldSpaceAR(vec(0,0))),w=Math.abs(other.width*other.scaleX)/2,h=Math.abs(other.height*other.scaleY)/2;if(Math.abs(p.x-x)<w+76&&Math.abs(p.y-y)<h+70)y=p.y+h+80;});
  hud.button.setPosition(x,Math.min(b.top-88,y));
}
function paintButton(hud,rt) {
  var s=rt.state,can=usable(rt),cooldown=s.cooldown>COOLDOWN_EPSILON?Math.ceil(s.cooldown):0,signature=[s.style,can,rt.aiming,cooldown,!!s.active,!!s.marked].join(":");if(hud.buttonSignature===signature)return;hud.buttonSignature=signature;
  var g=hud.buttonGraphics;g.clear();g.fillColor=color("#17101f");g.roundRect(-66,-59,132,118,24);g.fill();g.fillColor=color(can?rt.aiming?"#ffdc53":"#9a60d5":"#646277");g.roundRect(-61,-54,122,108,20);g.fill();g.fillColor=color(can?"#2765a3":"#343b51");g.roundRect(-55,-48,110,96,16);g.fill();
  var language=LanguageMgr.getInstance();
  language.bindLabel(hud.title,TITLES[s.style]||"hero.skills.name");
  var status=cooldown?"cooldown":s.active?"casting":s.style==="mystic"&&!can?s.marked?"outOfRange":"markTarget":rt.aiming?"chooseAim":can?"ready":"unavailable";
  language.bindLabel(hud.status,"hero.skills."+status,status==="cooldown"?{0:cooldown}:undefined);
}
function drawCharge(hud,hero,rt) {
  var s=rt.state,hp=hero.ctrHp&&hero.ctrHp.node,show=(s.style==="vanguard"||s.style==="skirmisher")&&hp&&hp.parent;
  if(!show){if(hud.charge)hud.charge.node.active=false;return;}
  if(!hud.charge||!live(hud.charge.node)||hud.charge.node.parent!==hp.parent){if(hud.charge&&live(hud.charge.node))hud.charge.node.destroy();hud.charge=graphics(hp.parent,"Hero charge meter");}
  var meter=hud.charge.node,w=hp.width||64,h=(hp.height||10)*.5;
  meter.active=true;meter.setContentSize(w,h);meter.scaleX=hp.scaleX;meter.scaleY=hp.scaleY;meter.angle=hp.angle||0;meter.zIndex=(hp.zIndex||0)+1;
  var center=hp.convertToWorldSpaceAR(vec(hp.width*(.5-hp.anchorX),-hp.height*hp.anchorY-h/2));meter.setPosition(hp.parent.convertToNodeSpaceAR(center));
  var amount=Math.max(0,Math.min(1,s.charge||0)),signature=[s.style,w,h,amount].join(":");
  if(hud.charge.signature===signature)return;hud.charge.signature=signature;
  var g=hud.charge.g;g.clear();g.fillColor=color("#151727");g.rect(-w/2,-h/2,w,h);g.fill();if(amount>0){g.fillColor=color(s.style==="vanguard"?"#ffab38":"#a4ee53");g.rect(-w/2+1,-h/2+1,Math.max(0,w-2)*amount,Math.max(0,h-2));g.fill();}
}
function aimOrigin(rt,v) {
  var o=rt.hero.node.getPosition(),controller=rt.hero.ctrPlayAni,maker=require("HeroMakerRider"),world=controller&&maker.skillOrigin&&maker.skillOrigin(controller,rt.aimDirection,v.animation),tip=world&&rt.game.ndMain.convertToNodeSpaceAR(world);
  return Presentation.projectilePoint({x:o.x,y:o.y,visualOffset:tip?{x:tip.x-o.x,y:tip.y-o.y}:null},v);
}
function draw(hud,hero,rt) {
  var view=hud.visual,g=view.g,layer=view.node,v=Presentation.visual(rt),builtin=v.showBuiltin!==false;
  var targetAlive=rt.beamTarget&&live(rt.beamTarget.node)&&rt.beamTarget.hp>0,marked=rt.state.style==="mystic"&&rt.state.marked&&rt.state.target&&live(rt.state.target.node)&&rt.state.target.hp>0;
  var empty=!rt.aiming&&!targetAlive&&!marked&&(!builtin||!(rt.projectiles||[]).length&&!(rt.effects||[]).length);
  hud.beamVfxPosition=null;
  if(empty&&hud.visualEmpty){Presentation.attachments(hud,rt);return;}
  g.clear();hud.visualEmpty=empty;
  if(rt.aiming){var o=hero.node.getPosition(),d=normalize(rt.aimDirection),size=rt.game.mapSize||{width:2000,height:2000};if(rt.state.style==="skirmisher"){var end=rayEnd(o,d,{minX:-size.width/2,maxX:size.width/2,minY:-size.height/2,maxY:size.height/2});var launch=aimOrigin(rt,v),finish={x:end.x+launch.x-o.x,y:end.y+launch.y-o.y};line(g,pointIn(rt,layer,launch),pointIn(rt,layer,finish),7,"#26322a");line(g,pointIn(rt,layer,launch),pointIn(rt,layer,finish),3,"#f7ed8c");}else{var tip={x:o.x+d.x*(hero.attackRange||155),y:o.y+d.y*(hero.attackRange||155)};line(g,pointIn(rt,layer,o),pointIn(rt,layer,tip),4,"#ffdf76");}}
  var target=rt.beamTarget;if(target&&live(target.node)&&target.hp>0){var from=hero.getAttWpos?hero.getAttWpos():hero.node.convertToWorldSpaceAR(vec(0,0)),a=offsetIn(rt,layer,worldIn(layer,from),v.originX,v.originY),b=offsetIn(rt,layer,actorPoint(layer,target,false),v.targetX,v.targetY);hud.beamVfxPosition=rt.game.ndMain.convertToNodeSpaceAR(layer.convertToWorldSpaceAR(b));if(builtin){line(g,a,b,Presentation.width(rt,10),Presentation.color(rt,"#7134a4"),v.opacity);line(g,a,b,Presentation.width(rt,4),Presentation.color(rt,"#d9a4ff"),v.opacity);circle(g,b,6*v.scale,Presentation.color(rt,"#f5d3ff"),true,v.opacity);}}
  if(rt.state.style==="mystic"&&rt.state.marked&&rt.state.target&&live(rt.state.target.node)&&rt.state.target.hp>0){var m=actorPoint(layer,rt.state.target,true);g.fillColor=color("#d790ff");g.strokeColor=color("#231330");g.lineWidth=2;g.moveTo(m.x,m.y+10);g.lineTo(m.x+7,m.y);g.lineTo(m.x,m.y-10);g.lineTo(m.x-7,m.y);g.close();g.fill();g.stroke();}
  if(builtin)(rt.projectiles||[]).forEach(function(p){var center=Presentation.projectilePoint(p,v),direction=Presentation.rotated(p.direction,v.rotation),a=pointIn(rt,layer,{x:center.x-direction.x*46*v.scale,y:center.y-direction.y*46*v.scale}),b=pointIn(rt,layer,center);line(g,a,b,Presentation.width(rt,8),Presentation.color(rt,"#fdf1a4"),v.opacity);var d=normalize({x:b.x-a.x,y:b.y-a.y});g.fillColor=tint(Presentation.color(rt,"#ffffff"),v.opacity);g.moveTo(b.x+d.x*13*v.scale,b.y+d.y*13*v.scale);g.lineTo(b.x-d.y*10*v.scale,b.y+d.x*10*v.scale);g.lineTo(b.x+d.y*10*v.scale,b.y-d.x*10*v.scale);g.close();g.fill();});
  if(builtin)(rt.effects||[]).forEach(function(e){var center=Presentation.offset(e,v.offsetX,v.offsetY),p=pointIn(rt,layer,center),edge=pointIn(rt,layer,{x:center.x+e.radius*v.scale,y:center.y}),r=Math.hypot(edge.x-p.x,edge.y-p.y),progress=1-Math.max(0,e.remaining/e.duration);g.strokeColor=tint(Presentation.color(rt,e.kind==="burst"?"#d69fff":e.kind==="arc"?"#fff5b0":rt.state.style==="guardian"?"#70c8ff":"#ff5b65"),v.opacity);g.lineWidth=Presentation.width(rt,Math.max(2,7*(1-progress)));if(e.kind==="arc"&&e.direction){var direction=Presentation.rotated(e.direction,v.rotation),tip=pointIn(rt,layer,{x:center.x+direction.x,y:center.y+direction.y}),angle=Math.atan2(tip.y-p.y,tip.x-p.x);g.arc(p.x,p.y,r*(.65+progress*.35),angle-(e.halfAngle===undefined?Math.PI/3:e.halfAngle),angle+(e.halfAngle===undefined?Math.PI/3:e.halfAngle),true);}else g.circle(p.x,p.y,r*(.65+progress*.35));g.stroke();});
  Presentation.attachments(hud,rt);
}
function update(hero,rt) {
  if(!ready())return;
  var hud=hero._skillHUD;if(hud&&(!live(hud.button)||hud.runtime!==rt)){clear(hero);hud=null;}
  if(!hud)hud=install(hero,rt);if(!hud)return;hud.runtime=rt;
  var active=available(rt);hud.button.active=hud.visual.node.active=active;
  if(!active){rt.aiming=false;hud.press=null;hud.worldTouch=null;if(hud.charge)hud.charge.node.active=false;hud.visual.g.clear();return;}
  layout(hud,rt);paintButton(hud,rt);drawCharge(hud,hero,rt);draw(hud,hero,rt);
}
function clear(hero) {
  var hud=hero&&hero._skillHUD;if(!hud)return;
  if(hud.runtime)Presentation.clear(hud.runtime);
  if(hud.runtime)hud.runtime.aiming=false;
  if(hud.controller&&hud.controller._skillAimHUD===hud)delete hud.controller._skillAimHUD;
  [hud.button,hud.visual&&hud.visual.node,hud.charge&&hud.charge.node].forEach(function(n){if(live(n))n.destroy();});delete hero._skillHUD;
}
function handleTouch(controller,phase,event) {
  var game=controller&&controller._followGame&&controller._followGame(),hero=game&&game.ctrPlay,hud=hero&&hero._skillHUD||controller&&controller._skillAimHUD,rt=hud&&hud.runtime,id=touchId(event);
  if(!rt||!hud)return false;
  var pending=hud.worldTouch;
  if(pending&&pending.id===id){stop(event);if(pending.cancelled||!rt.aiming||!available(rt)){pending.cancelled=true;if(phase==="end"||phase==="cancel")hud.worldTouch=null;rt.aiming=false;return true;}var p=location(event);if(p&&phase!=="cancel")rt.screenAim(p);if(phase==="end"||phase==="cancel"){hud.worldTouch=null;if(phase==="end")rt.cast(rt.aimDirection);else rt.aiming=false;}return true;}
  if(pending||hud.press)return false;
  if(phase!=="start"||!rt.aiming||!available(rt)||controller.touchID!==false&&controller.touchID===id)return false;
  var at=location(event);if(!at)return false;rt.screenAim(at);hud.worldTouch={id:id};hud.controller=controller;controller._skillAimHUD=hud;stop(event);return true;
}
exports.update=update;exports.clear=clear;exports.handleTouch=handleTouch;
exports.rayEnd=rayEnd;
