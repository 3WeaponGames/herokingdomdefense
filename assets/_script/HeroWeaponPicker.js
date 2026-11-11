"use strict";
// Browse styles and current levels without purchases. Only Equip changes the
// active loadout; all upgrading stays on the Gear page.
var Weapons = require("HeroWeapons");
function open(owner) {
  if (owner._weaponPicker) return;
  var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance(), user = player.getUserData();
  var canvas = cc.find("Canvas") || owner.node, root = new cc.Node("Choose fighting style");
  root.setParent(canvas); root.setContentSize(canvas.width, canvas.height); root.zIndex = 10000; root.addComponent(cc.BlockInputEvents);
  owner._weaponPicker = root;
  var backdrop = root.addComponent(cc.Graphics); backdrop.fillColor = cc.color(0, 0, 0, 190); backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
  var content = new cc.Node("Weapon choices"); content.setParent(root); content.setContentSize(660, 620);content.scale = Math.min(1, (canvas.width-24)/660, (canvas.height-48)/620);
  var panel = content.addComponent(cc.Graphics); panel.fillColor = cc.color(29, 37, 55);panel.roundRect(-330, -310, 660, 620, 20); panel.fill();
  var chosen = user.getHeroWeapon().id;
  function label(parent, text, x, y, size) { var node = new cc.Node(text);node.setParent(parent);node.setPosition(x,y);var value=node.addComponent(cc.Label);value.string=text;value.fontSize=size||22;value.lineHeight=(size||22)+6;value.horizontalAlign=cc.Label.HorizontalAlign.CENTER;node.color=cc.color(240,244,255);return node; }
  function close() { if (owner._weaponPicker === root) owner._weaponPicker = null;root.destroy(); }
  function button(parent, text, x, y, width, height, action, selected, disabled) {
    var node = new cc.Node(text);node.setParent(parent);node.setPosition(x,y);node.setContentSize(width,height);
    var graphics=node.addComponent(cc.Graphics);graphics.fillColor=cc.color(disabled?'#343e50':selected?'#3465ac':'#263d61');graphics.roundRect(-width/2,-height/2,width,height,9);graphics.fill();
    var textNode=label(node,text,0,0,20);if(disabled)textNode.opacity=140;
    node.on(cc.Node.EventType.TOUCH_END,function(event){event.stopPropagation();if(!disabled)action();});return node;
  }
  label(content,"Fighting style",0,267,29);button(content,"×",283,269,46,44,close);
  var body=new cc.Node("Choices");body.setParent(content);
  function render() {
    body.removeAllChildren();
    Weapons.styles.forEach(function(style,index){
      var equipped=user.getHeroWeapon().id===style.id;
      button(body,style.name+(equipped?"\nEquipped":""),(index%2===0?-154:154),178-Math.floor(index/2)*91,292,78,function(){chosen=style.id;render();},chosen===style.id);
    });
    var weapon=Weapons.find(chosen),equipped=user.getHeroWeapon().id===chosen;
    [4,3].forEach(function(slot,index){
      label(body,Weapons.gear(chosen,slot,'upgrade').name+" · Lv "+user.getHeroWeaponLevel(chosen,slot),0,-95-index*47,22);
    });
    button(body,equipped?"Equipped":"Equip "+weapon.name,0,-245,372,48,function(){user.setHeroWeapon(chosen);owner.initView();render();},true,equipped);
  }
  render();root.on(cc.Node.EventType.TOUCH_END,function(event){if(event.target===root)close();});
}
function close(owner) { if (owner._weaponPicker) { owner._weaponPicker.destroy(); owner._weaponPicker=null; } }
function installSwitch(owner) {
  if (owner._weaponSwitch || !owner.ndItemTop[0]) return;
  var parent=owner.ndItemTop[0].parent,node=new cc.Node('Switch fighting style');node.setParent(parent);node.setContentSize(56,56);
  var left=Math.min.apply(null,owner.ndItemTop.map(function(item){return item.x-item.width/2;})),middle=(owner.ndItemTop[0].y+owner.ndItemTop[3].y)/2;
  node.setPosition(left-39,middle);node.zIndex=20;
  var graphics=node.addComponent(cc.Graphics);graphics.fillColor=cc.color('#315b98');graphics.strokeColor=cc.color('#fff0b5');graphics.lineWidth=3;graphics.circle(0,0,27);graphics.fill();graphics.stroke();
  var icon=new cc.Node('Switch icon');icon.setParent(node);icon.setContentSize(36,36);var sprite=icon.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;
  cc.resources.load('icons/Pictograms/Pictoicon_Switch',cc.SpriteFrame,function(error,frame){if(!error&&cc.isValid(node)){require('EquipmentIconFit').apply(sprite,frame);}});
  node.on(cc.Node.EventType.TOUCH_END,function(event){event.stopPropagation();open(owner);});owner._weaponSwitch=node;
}
exports.open=open;exports.close=close;exports.installSwitch=installSwitch;
