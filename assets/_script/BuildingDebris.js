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
        state.records.forEach(function (record) {
            if (!valid(record.node) || !frame) return;
            record.sprite.spriteFrame = frame;
            if (record !== state.building) record.node.active = record.visible && !owner.isDestroyed;
        });
        hideNative(owner);
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
            if (!a || !a.computeWorldVertices || slot.color.a <= 0 || /(?:^fx2?$|smoke|effect|star|light|guang|night|shadow|qizi|flag)/i.test(slot.data.name)) return;
            points(source,a,slot,owner,box);
        });
    });
    return box;
}
function wallBounds(owner) {
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
    var left=plan.leftPoints.map(fitted).reverse(),right=plan.rightPoints.map(fitted),steps=[];
    function length(a,b){return Math.hypot(b.x-a.x,b.y-a.y);}
    [left,right].forEach(function(points){for(var i=1;i<points.length;i++){var value=length(points[i-1],points[i]);if(value>0)steps.push(value);}});
    steps.sort(function(a,b){return a-b;});var pitch=steps.length?steps[Math.floor(steps.length/2)]:length(local(0,0),local(Assembly.step.x,Assembly.step.y));
    var center, footprint;
    if(plan.gate&&left[0]&&right[0]){
        center={x:(left[0].x+right[0].x)/2,y:(left[0].y+right[0].y)/2};
        var span=length(left[1]||left[0],left[0])+length(left[0],right[0])+length(right[0],right[1]||right[0]);
        footprint=Math.max(pitch,Math.min(span,pitch*5));
    }else{
        // Use the halfway point along the actual run, including bends.
        var run=left.slice().reverse().concat(left.length?right.slice(1):right);
        if(!run.length)return null;
        var distances=run.slice(1).map(function(p,i){return length(run[i],p);});
        var half=distances.reduce(function(sum,value){return sum+value;},0)/2;
        center=run[0];
        for(var i=0;i<distances.length&&half>0;i++){
            if(half<=distances[i]){
                var a=run[i],b=run[i+1],t=half/distances[i];
                center={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
                break;
            }
            half-=distances[i];
        }
        footprint=pitch*Math.max(1,Math.min(3,distances.length));
    }
    return {minX:center.x-footprint/2,maxX:center.x+footprint/2,minY:center.y,maxY:center.y,scale:.5};
}
function layout(record, box, visible) {
    if (!(box.maxX > box.minX) || !isFinite(box.minY)) {record.visible=false;return;}
    var width = (box.maxX-box.minX)*(box.scale===undefined?.7:box.scale);
    if(record.node.width!==width||record.node.height!==width*ASPECT)record.node.setContentSize(width,width*ASPECT);
    var x=(box.minX+box.maxX)/2;if(record.node.x!==x||record.node.y!==box.minY)record.node.setPosition(x,box.minY);
    record.visible = !!visible;
}
function nativeRubbleBone(entry, muted) {
    if (!entry.bone || entry.muted === muted) return;
    var bone = entry.rig.findBone(entry.bone);
    if (!bone || !bone.setActive || !bone.isActive) return;
    if (muted) entry.wasActive = bone.isActive();
    bone.setActive(muted ? false : entry.wasActive);
    entry.muted = muted;
}
function suppressNativeRubble(state, source, rig, hidePrimary) {
    var json = source.skeletonData && source.skeletonData.skeletonJson;
    if (!source._nativeSkeleton || !rig || !rig.findBone || !json || !json.slots) return;
    var entries = state.nativeRubble || (state.nativeRubble = new Map()), entry = entries.get(source);
    if (!entry || entry.rig !== rig || entry.json !== json) {
        entry = {rig: rig, json: json, muted: false};
        entries.set(source, entry);
        var primary = json.slots.find(function (slot) { return slot.name === "fx"; });
        var secondary = json.slots.findIndex(function (slot) { return slot.name === "fx2"; });
        // Native Spine applies the destruction timelines during rendering.
        // Only disable a leaf bone dedicated to the legacy rubble.
        if (primary && !(json.bones || []).some(function (bone) { return bone.parent === primary.bone; }) &&
                !json.slots.some(function (slot) { return slot.bone === primary.bone && slot.name !== "fx" && slot.name !== "fx2"; }))
            entry.bone = primary.bone;
        var animations = json.animations || {}, keys = animations.destroy && animations.destroy.slots && animations.destroy.slots.fx2;
        // The secondary attachment is shared by instances of this rig, so
        // suppress it only when the slot is reserved for the destruction clip.
        if (secondary >= 0 && keys && keys.attachment && rig.getAttachment && !json.slots[secondary].attachment &&
                !Object.keys(animations).some(function (name) {
                    return name !== "destroy" && animations[name].slots && animations[name].slots.fx2;
                })) {
            keys.attachment.forEach(function (key) {
                var attachment = key.name && rig.getAttachment(secondary, key.name);
                var color = attachment && (attachment.color || attachment.getColor && attachment.getColor());
                if (color) color.a = 0;
            });
        }
    }
    nativeRubbleBone(entry, hidePrimary);
}
function restoreNativeRubble(state) {
    if (!state.nativeRubble) return;
    state.nativeRubble.forEach(function (entry, source) {
        if (entry.muted && valid(source) && (!source.node || valid(source.node)) && source._skeleton === entry.rig)
            nativeRubbleBone(entry, false);
    });
    state.nativeRubble.clear();
}
function hideNative(owner) {
    var state = owner._sharedBuildingDebris;
    var record = state && state.building;
    if (!record || !valid(record.node)) return;
    var art = owner._buildingAppearance, ruins = art && art.destroyedNode;
    var custom = valid(ruins) && ruins.active && ruins.activeInHierarchy !== false;
    record.node.active = !!(owner.isDestroyed && record.visible && state.frame && !custom);
    if (!owner.isDestroyed) return;
    var replacement = custom || record.node.active;
    var nativeEffects = art && art.deathRubbleFx;
    var fallback = valid(nativeEffects) && nativeEffects.active ? art.deathRubbleSpine : owner.ndAniMain;
    [owner.ndAniMain, owner.ndAniDown, art && art.deathRubbleSpine].concat(owner.ndAniOther || []).forEach(function (source) {
        if (!valid(source) || source.node && !valid(source.node)) return;
        var rig = source._skeleton, hidePrimary = replacement || source !== fallback;
        function hideSlot(name) {
            var slot = rig && rig.findSlot && rig.findSlot(name) || source.findSlot && source.findSlot(name);
            if (slot && slot.color) slot.color.a = 0;
        }
        hideSlot("fx2");
        if (hidePrimary) hideSlot("fx");
        suppressNativeRubble(state, source, rig, hidePrimary);
    });
    if (replacement && valid(nativeEffects)) nativeEffects.active = false;
}
function capture(owner) {
    var state=prepare(owner);
    restoreNativeRubble(state);
    state.records.slice().forEach(function(record){discard(owner,record);});
    if(!state.beforeDraw&&cc.director&&cc.director.on&&cc.Director){
        state.beforeDraw=function(){
            // Castle defeat may stop combat updates while its Spine death clip
            // still runs. Use the clip's actual clock whenever it is available.
            var art=owner._buildingAppearance,source=art&&art.deathRubbleSpine||owner.ndAniMain;
            var track=valid(source)&&source.getCurrent&&source.getCurrent(0);
            var animation=track&&(track.animation||track.getAnimation&&track.getAnimation());
            if(owner.isDestroyed&&state.building&&valid(state.building.node)&&animation&&(animation.name||animation.getName&&animation.getName())==="destroy"){
                var time=typeof track.trackTime==="number"?track.trackTime:track.getTrackTime&&track.getTrackTime();
                layout(state.building,state.box,state.building.visible||time>=state.reveal);
            }
            hideNative(owner);
        };
        cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);
    }
    var json=owner.ndAniMain&&owner.ndAniMain.skeletonData&&owner.ndAniMain.skeletonData.skeletonJson;
    var keys=json&&json.animations&&json.animations.destroy&&json.animations.destroy.slots&&json.animations.destroy.slots.fx;
    var reveal=keys&&keys.attachment&&keys.attachment.find(function(key){return key.name;});
    state.reveal=reveal&&typeof reveal.time==='number'?reveal.time:.2667;
    state.box=wallBounds(owner)||bodyBounds(owner);state.elapsed=0;
    state.building=create(owner);
}
function update(owner, dt) {
    var state=owner._sharedBuildingDebris;
    if(!state||!state.building||!valid(state.building.node))return;
    if(!owner.isDestroyed){state.building.visible=false;hideNative(owner);restoreNativeRubble(state);return;}
    var speed=owner.ndAniMain&&owner.ndAniMain.timeScale;
    state.elapsed+=Math.max(0,Number(dt)||0)*(typeof speed==="number"&&isFinite(speed)?Math.max(0,speed):1);
    layout(state.building,state.box,state.building.visible||state.elapsed>=state.reveal);hideNative(owner);
}
function field(owner, source, value, visible) {
    if(owner.isDestroyed){discard(owner,value.debris);value.debris=null;return;}
    if(!visible){if(value.debris&&valid(value.debris.node)){value.debris.visible=false;value.debris.node.active=false;}return;}
    if(!value.debris||!valid(value.debris.node))value.debris=create(owner);
    var box=emptyBox();points(source,value.attachment,value.slot,owner,box);layout(value.debris,box,true);
    value.debris.node.active=value.debris.visible&&!!owner._sharedBuildingDebris.frame;
}
function clear(owner) {
    var state=owner._sharedBuildingDebris;if(!state)return;
    restoreNativeRubble(state);
    state.records.slice().forEach(function(record){discard(owner,record);});state.building=null;
    if(state.beforeDraw&&cc.director&&cc.director.off){cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);state.beforeDraw=null;}
}
function destroy(owner) { var state=owner._sharedBuildingDebris;if(!state)return;clear(owner);state.generation++;if(state.beforeDraw&&cc.director&&cc.director.off)cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);owner._sharedBuildingDebris=null; }
exports.resource=RESOURCE;exports.prepare=prepare;exports.capture=capture;exports.update=update;exports.field=field;exports.discard=discard;exports.clear=clear;exports.destroy=destroy;exports.hideNative=hideNative;
