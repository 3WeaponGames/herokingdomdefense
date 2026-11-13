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
    if (attachment.worldVerticesLength) attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
    else attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
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
function layout(owner, record, box, visible) {
    if (!(box.maxX > box.minX) || !isFinite(box.minY)) {record.visible=false;record.node.active=false;return;}
    var width = (box.maxX-box.minX)*.7;
    if(record.node.width!==width||record.node.height!==width*ASPECT)record.node.setContentSize(width,width*ASPECT);
    var x=(box.minX+box.maxX)/2;if(record.node.x!==x||record.node.y!==box.minY)record.node.setPosition(x,box.minY);
    record.visible = !!visible;record.node.active = record.visible && !!prepare(owner).frame;
}
function hideNative(owner) {
    var state = owner._sharedBuildingDebris;
    if (!state || !state.building || !state.building.node.active) return;
    [owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther || []).forEach(function (source) {
        var slot=source&&source._skeleton&&source._skeleton.findSlot("fx");if(slot)slot.color.a=0;
    });
    var art=owner._buildingAppearance;if(art&&valid(art.deathRubbleFx))art.deathRubbleFx.active=false;
}
function capture(owner) {
    var state=prepare(owner);if(state.building)discard(owner,state.building);
    if(!state.beforeDraw&&cc.director&&cc.director.on&&cc.Director){
        state.beforeDraw=function(){
            // Castle defeat may stop combat updates while its Spine death clip
            // still runs. Use the clip's actual clock whenever it is available.
            var art=owner._buildingAppearance,source=art&&art.deathRubbleSpine||owner.ndAniMain;
            var track=source&&source.getCurrent&&source.getCurrent(0);
            if(owner.isDestroyed&&state.building&&track&&track.animation&&track.animation.name==="destroy")layout(owner,state.building,state.box,state.building.visible||track.trackTime>=state.reveal);
            hideNative(owner);
        };
        cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);
    }
    var json=owner.ndAniMain&&owner.ndAniMain.skeletonData&&owner.ndAniMain.skeletonData.skeletonJson;
    var keys=json&&json.animations&&json.animations.destroy&&json.animations.destroy.slots&&json.animations.destroy.slots.fx;
    var reveal=keys&&keys.attachment&&keys.attachment.find(function(key){return key.name;});
    state.reveal=reveal&&typeof reveal.time==='number'?reveal.time:.2667;
    state.box=bodyBounds(owner);state.elapsed=0;state.building=create(owner);
}
function update(owner, dt) {
    var state=owner._sharedBuildingDebris;
    if(!state||!state.building)return;
    if(!owner.isDestroyed){state.building.visible=false;state.building.node.active=false;return;}
    var speed=owner.ndAniMain&&owner.ndAniMain.timeScale;
    state.elapsed+=Math.max(0,Number(dt)||0)*(typeof speed==="number"&&isFinite(speed)?Math.max(0,speed):1);
    layout(owner,state.building,state.box,state.elapsed>=state.reveal);hideNative(owner);
}
function field(owner, source, value, visible) {
    if(!visible){if(value.debris){value.debris.visible=false;value.debris.node.active=false;}return;}
    if(!value.debris)value.debris=create(owner);
    var box=emptyBox();points(source,value.attachment,value.slot,owner,box);layout(owner,value.debris,box,true);
}
function clear(owner) {
    var state=owner._sharedBuildingDebris;if(!state)return;
    state.records.slice().forEach(function(record){discard(owner,record);});state.building=null;
    if(state.beforeDraw&&cc.director&&cc.director.off){cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);state.beforeDraw=null;}
}
function destroy(owner) { var state=owner._sharedBuildingDebris;if(!state)return;clear(owner);state.generation++;if(state.beforeDraw&&cc.director&&cc.director.off)cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.beforeDraw);owner._sharedBuildingDebris=null; }
exports.resource=RESOURCE;exports.prepare=prepare;exports.capture=capture;exports.update=update;exports.field=field;exports.discard=discard;exports.clear=clear;exports.destroy=destroy;exports.hideNative=hideNative;
