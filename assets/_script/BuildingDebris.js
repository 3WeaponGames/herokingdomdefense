"use strict";
// One existing native rubble image for every structure and crop. Layout stays
// in the owner's coordinates; the image always keeps its original aspect ratio.
var RESOURCE = "buildings/shared/debris", ASPECT = 66 / 115;
function valid(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function prepare(owner) {
    var state = owner._sharedBuildingDebris;
    if (!state) state = owner._sharedBuildingDebris = {records: [], generation: 0};
    if (state.frame || state.loading || !owner.loadSpriteFrame) return state;
    state.loading = true;
    var generation = state.generation;
    owner.loadSpriteFrame("resources", RESOURCE, function (frame) {
        if (!valid(owner.node) || owner._sharedBuildingDebris !== state || state.generation !== generation) return;
        state.loading = false;state.frame = frame;
        state.records.forEach(function (record) { if (valid(record.node) && frame) {record.sprite.spriteFrame = frame;record.node.active = record.visible;} });
    });
    return state;
}
function create(owner) {
    var state = prepare(owner), node = new cc.Node("Shared building debris");node.parent = owner.node;node.group = owner.node.group;
    node._depthGroundVisual = true;node.zIndex = -1;node.setAnchorPoint(.5, 0);
    // The shipped destroy clip tints its fx slot a7a7a7; retain that painted
    // rubble shade rather than displaying the brighter, untinted atlas pixels.
    node.color = cc.color(167,167,167);
    var sprite = node.addComponent(cc.Sprite);sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    if (state.frame) sprite.spriteFrame = state.frame;
    node.active = false;
    var record = {node: node, sprite: sprite, visible: false};state.records.push(record);return record;
}
function discard(owner, record) {
    if (!record) return;
    record.visible = false;
    if (valid(record.node)) {record.node.active = false;record.node.destroy();}
    var state = owner._sharedBuildingDebris;
    if (state) {var index = state.records.indexOf(record);if (index >= 0) state.records.splice(index, 1);}
}
function points(source, attachment, slot, owner, box) {
    var vertices = [];
    if (typeof attachment.computeWorldVertices === "function") {
        if (attachment.worldVerticesLength) attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
        else attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
    } else {
        // Native RegionAttachment exposes four local XY offsets, but does not
        // bind the web vertex method. Keep the crop's current animated bone.
        var offsets = typeof attachment.getOffset === "function" && attachment.getOffset(), bone = slot.bone;
        if (!offsets || offsets.length !== 8 || !bone) return;
        for (var at = 0; at < 8; at++) if (typeof offsets[at] !== "number" || !isFinite(offsets[at])) return;
        var a = bone.a, b = bone.b, c = bone.c, d = bone.d, x = bone.worldX, y = bone.worldY;
        for (at = 0; at < 8; at += 2) vertices.push(offsets[at] * a + offsets[at + 1] * b + x,
            offsets[at] * c + offsets[at + 1] * d + y);
    }
    for (var i = 0; i < vertices.length; i += 2) {
        var p = owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(vertices[i], vertices[i + 1])));
        box.minX = Math.min(box.minX, p.x);box.maxX = Math.max(box.maxX, p.x);box.minY = Math.min(box.minY, p.y);box.maxY = Math.max(box.maxY, p.y);
    }
}
function emptyBox() { return {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity}; }
function bodyBounds(owner) {
    var box = emptyBox(), appearance = owner._buildingAppearance, image = appearance && appearance.node;
    if (valid(image) && image.active && image.width > 0) {
        [[0,0],[1,0],[0,1],[1,1]].forEach(function (corner) {
            var p = owner.node.convertToNodeSpaceAR(image.convertToWorldSpaceAR(cc.v2((corner[0]-image.anchorX)*image.width,(corner[1]-image.anchorY)*image.height)));
            box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);
        });
    } else [owner.ndAniMain].concat(owner.ndAniOther || []).forEach(function (source) {
        if (!source) return;
        if(source._nativeSkeleton&&source._nativeSkeleton.getBoundingBox){
            var bounds=source._nativeSkeleton.getBoundingBox();
            [[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x,bounds.y+bounds.height],[bounds.x+bounds.width,bounds.y+bounds.height]].forEach(function(corner){var p=owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(corner[0],corner[1])));box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);});return;
        }
        if (!source._skeleton) return;
        source._skeleton.updateWorldTransform();
        source._skeleton.drawOrder.forEach(function (slot) {
            var a = slot.getAttachment();
            if (!a || !a.computeWorldVertices || slot.color.a <= 0 || /(?:^fx$|smoke|effect|star|light|guang|night|shadow|qizi|flag)/i.test(slot.data.name)) return;
            points(source,a,slot,owner,box);
        });
    });
    return box;
}
function wallGroups(owner) {
    var source=owner.ndAniMain,json=source&&source.skeletonData&&source.skeletonData.skeletonJson,plan=json&&json.wallKit&&json.wallKit.layout;
    if(!plan||!Array.isArray(plan.leftPoints)||!Array.isArray(plan.rightPoints))return null;
    var Assembly=require("WallAssembly"),Ground=require("WallShadowGround"),parts=Assembly.pieces(plan),positions={},skin=owner.buildInfo&&owner.buildInfo.cfg&&owner.buildInfo.cfg.Skin||source.defaultSkin;
    function local(x,y){var p=owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(x,y)));return{x:p.x,y:p.y};}
    var origin=local(0,0),axisX=local(1,0),axisY=local(0,1),matrix=[axisX.x-origin.x,axisX.y-origin.y,axisY.x-origin.x,axisY.y-origin.y,origin.x,origin.y];
    function key(p){return p.x.toFixed(6)+","+p.y.toFixed(6);}
    // Read the painted post's floor, including authored offsets, from the same
    // instance rig used for its ground shadow. This also works on native Spine.
    var track=source.getCurrent&&source.getCurrent(0),animation=track&&(track.animation||track.getAnimation&&track.getAnimation()),pose=animation&&(animation.name||animation.getName&&animation.getName())||"idle";
    Ground.contacts(json,skin,matrix,pose).forEach(function(p){var index=Number(p.slot.slice("rts_wall_part_".length));if(parts[index])positions[key(parts[index])]={x:p.x,y:p.y};});
    function fitted(p){return positions[key(p)]||local(p.x,p.y);}
    var left=plan.leftPoints.map(fitted).reverse(),right=plan.rightPoints.map(fitted),steps=[],groups=[];
    function length(a,b){return Math.hypot(b.x-a.x,b.y-a.y);}
    [left,right].forEach(function(points){for(var i=1;i<points.length;i++){var value=length(points[i-1],points[i]);if(value>0)steps.push(value);}});
    steps.sort(function(a,b){return a-b;});var pitch=steps.length?steps[Math.floor(steps.length/2)]:length(local(0,0),local(Assembly.step.x,Assembly.step.y));
    function group(points,kind,side,center){
        var span=0,x=0,y=0;
        for(var i=1;i<points.length;i++){var size=length(points[i-1],points[i]);span+=size;x+=(points[i-1].x+points[i].x)*size/2;y+=(points[i-1].y+points[i].y)*size/2;}
        center=center||span>0&&{x:x/span,y:y/span}||points[0];if(!center)return;
        // A pile covers its small connection group, never the whole wall's
        // upright bounding box. Exceptionally wide gate openings stay compact.
        var footprint=Math.max(pitch,kind==="gate"?Math.min(span,pitch*5):span);
        groups.push({kind:kind,side:side,connections:kind==="gate"?(left.length>1?1:0)+(right.length>1?1:0):points.length-1,
            box:{minX:center.x-footprint/2,maxX:center.x+footprint/2,minY:center.y,maxY:center.y,scale:.5}});
    }
    function connections(points,start,side){for(var i=start;i<points.length-1;i+=3)group(points.slice(i,Math.min(points.length,i+4)),"wall",side);}
    if(plan.gate&&left[0]&&right[0]){
        group([left[1]||left[0],left[0],right[0],right[1]||right[0]],"gate","center",{x:(left[0].x+right[0].x)/2,y:(left[0].y+right[0].y)/2});
        connections(left,1,"left");connections(right,1,"right");
    }else connections(left.slice().reverse().concat(right.slice(1)),0,"run");
    return groups.length?groups:null;
}
function layout(owner, record, box, visible) {
    if (!(box.maxX > box.minX) || !isFinite(box.minY)) {record.visible=false;record.node.active=false;return;}
    var width = (box.maxX-box.minX)*(box.scale===undefined?.7:box.scale);
    if(record.node.width!==width||record.node.height!==width*ASPECT)record.node.setContentSize(width,width*ASPECT);
    var x=(box.minX+box.maxX)/2;if(record.node.x!==x||record.node.y!==box.minY)record.node.setPosition(x,box.minY);
    record.visible = !!visible;record.node.active = record.visible && !!prepare(owner).frame;
}
function layoutBuildings(owner,state,visible){(state.buildings||[state.building]).forEach(function(record){if(record)layout(owner,record,record.box||state.box,visible);});}
function hideNative(owner) {
    var state = owner._sharedBuildingDebris;
    if (!state || !(state.buildings||[state.building]).some(function(record){return record&&record.node.active;})) return;
    [owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther || []).forEach(function (source) {
        if(!valid(source)||source.node&&!valid(source.node))return;
        var slot=source&&(source._skeleton&&source._skeleton.findSlot("fx")||source.findSlot&&source.findSlot("fx"));if(slot)slot.color.a=0;
    });
    var art=owner._buildingAppearance;if(art&&valid(art.deathRubbleFx))art.deathRubbleFx.active=false;
}
function capture(owner) {
    var state=prepare(owner);(state.buildings||[state.building]).slice().forEach(function(record){if(record)discard(owner,record);});
    if(!state.beforeDraw&&cc.director&&cc.director.on&&cc.Director){
        state.beforeDraw=function(){
            // Castle defeat may stop combat updates while its Spine death clip
            // still runs. Use the clip's actual clock whenever it is available.
            var art=owner._buildingAppearance,source=art&&art.deathRubbleSpine||owner.ndAniMain;
            var track=source&&source.getCurrent&&source.getCurrent(0);
            if(owner.isDestroyed&&state.building&&track&&track.animation&&track.animation.name==="destroy")layoutBuildings(owner,state,state.building.visible||track.trackTime>=state.reveal);
            hideNative(owner);
        };
        cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);
    }
    var json=owner.ndAniMain&&owner.ndAniMain.skeletonData&&owner.ndAniMain.skeletonData.skeletonJson;
    var keys=json&&json.animations&&json.animations.destroy&&json.animations.destroy.slots&&json.animations.destroy.slots.fx;
    var reveal=keys&&keys.attachment&&keys.attachment.find(function(key){return key.name;});
    state.reveal=reveal&&typeof reveal.time==='number'?reveal.time:.2667;
    state.groups=wallGroups(owner);state.box=state.groups?state.groups[0].box:bodyBounds(owner);state.elapsed=0;
    state.buildings=(state.groups||[{box:state.box}]).map(function(group){var record=create(owner);record.box=group.box;record.group=group;return record;});state.building=state.buildings[0];
}
function update(owner, dt) {
    var state=owner._sharedBuildingDebris;
    if(!state||!state.building)return;
    if(!owner.isDestroyed){layoutBuildings(owner,state,false);return;}
    var speed=owner.ndAniMain&&owner.ndAniMain.timeScale;
    state.elapsed+=Math.max(0,Number(dt)||0)*(typeof speed==="number"&&isFinite(speed)?Math.max(0,speed):1);
    layoutBuildings(owner,state,state.elapsed>=state.reveal);hideNative(owner);
}
function field(owner, source, value, visible) {
    if(!visible){if(value.debris){value.debris.visible=false;value.debris.node.active=false;}return;}
    if(!value.debris)value.debris=create(owner);
    var box=emptyBox();points(source,value.attachment,value.slot,owner,box);layout(owner,value.debris,box,true);
}
function clear(owner) {
    var state=owner._sharedBuildingDebris;if(!state)return;
    state.records.slice().forEach(function(record){discard(owner,record);});state.building=null;state.buildings=[];state.groups=null;
    if(state.beforeDraw&&cc.director&&cc.director.off){cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);state.beforeDraw=null;}
}
function destroy(owner) { var state=owner._sharedBuildingDebris;if(!state)return;clear(owner);state.generation++;if(state.beforeDraw&&cc.director&&cc.director.off)cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);owner._sharedBuildingDebris=null; }
exports.resource=RESOURCE;exports.prepare=prepare;exports.capture=capture;exports.update=update;exports.field=field;exports.discard=discard;exports.clear=clear;exports.destroy=destroy;exports.hideNative=hideNative;
