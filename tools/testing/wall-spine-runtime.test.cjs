'use strict';
// Real Creator Spine parsing and CPU posing only. No scene, GPU, audio,
// gameplay components, player state, editor session or project writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const root = path.resolve(__dirname, '../..');
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const runtime = path.join(engine, 'extensions/spine/lib/spine.js');
const options = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for Spine 3.8 integration' : false};
const Kit = require('../../assets/_script/WallKit'), Facing = require('../../assets/_script/GateFacing'), Door = require('../../assets/_script/WallDoor');
const L = require('../../packages/game-data-editor/worlds/legacy'), Preview = require('../../packages/game-data-editor/worlds/building-preview'), Maps = require('../../packages/game-data-editor/lib/map-assets');
const clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-4) => assert(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const nativeAnchors = {post: [[61, 77], [60.5, 91], [60.5, 93]], right: [[61, 77], [60.5, 91], [60.5, 93]],
  top: [[68, 77], [64.5, 91], [66.5, 93]], corner: [[68, 77], [64.5, 91], [67.5, 93]]};
function load(spine, descriptor) {
  const folder = path.dirname(path.resolve(root, descriptor.source)), pages = new Map();
  const atlas = new spine.TextureAtlas(descriptor.atlas, name => {
    const bytes = fs.readFileSync(path.join(folder, name));
    const image = {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    pages.set(name, image);
    return {setFilters() {}, setWraps() {}, getImage: () => image};
  });
  for (const region of atlas.regions) {
    const image = pages.get(region.page.name); assert(image, 'Every atlas page must resolve to its actual PNG');
    assert(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0);
    assert(region.x + (region.rotate ? region.height : region.width) <= image.width);
    assert(region.y + (region.rotate ? region.width : region.height) <= image.height);
  }
  const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(descriptor.json);
  return {data, regions: atlas.regions.length};
}
function pose(spine, data, skin, animation, time) {
  const skeleton = new spine.Skeleton(data);
  skeleton.setSkinByName(skin); skeleton.setSlotsToSetupPose();
  const state = new spine.AnimationState(new spine.AnimationStateData(data));
  state.setAnimation(0, animation, false); state.update(time); state.apply(skeleton); skeleton.updateWorldTransform();
  for (const bone of skeleton.bones) for (const key of ['a', 'b', 'c', 'd', 'worldX', 'worldY']) assert(Number.isFinite(bone[key]), 'Animated bones must remain finite');
  return skeleton;
}
function vertices(spine, slot) {
  const attachment = slot.getAttachment();
  if (!attachment) return [];
  const result = [];
  if (attachment instanceof spine.RegionAttachment) attachment.computeWorldVertices(slot.bone, result, 0, 2);
  else if (attachment instanceof spine.MeshAttachment) attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, result, 0, 2);
  else return [];
  assert(result.length > 0 && result.every(Number.isFinite), 'Every active drawable must produce finite actual world vertices');
  assert([...attachment.uvs].every(Number.isFinite), 'Every active drawable must retain finite UVs');
  assert(attachment.region && attachment.region.page, 'Every drawable must resolve a real atlas region');
  assert([slot.color.r, slot.color.g, slot.color.b, slot.color.a].every(Number.isFinite));
  return result;
}
function material(attachment, points, u, v) {
  let result, best = Infinity;
  for (let i = 0; i < attachment.triangles.length; i += 3) {
    const ids = attachment.triangles.slice(i, i + 3), uv = attachment.regionUVs;
    const p = ids.map(index => ({u: uv[index * 2], v: uv[index * 2 + 1]}));
    const cross = (a, b) => a.u * b.v - a.v * b.u;
    const a = {u: p[1].u - p[0].u, v: p[1].v - p[0].v}, b = {u: p[2].u - p[0].u, v: p[2].v - p[0].v}, q = {u: u - p[0].u, v: v - p[0].v};
    const determinant = cross(a, b); if (Math.abs(determinant) < 1e-12) continue;
    const wb = cross(q, b) / determinant, wc = cross(a, q) / determinant, wa = 1 - wb - wc;
    const penalty = -Math.min(wa, 0) - Math.min(wb, 0) - Math.min(wc, 0);
    if (penalty < best) {
      best = penalty;
      result = {x: wa * points[ids[0] * 2] + wb * points[ids[1] * 2] + wc * points[ids[2] * 2],
        y: wa * points[ids[0] * 2 + 1] + wb * points[ids[1] * 2 + 1] + wc * points[ids[2] * 2 + 1]};
    }
  }
  assert(result); return result;
}
function leaves(spine, skeleton, matrix) {
  const result = new Map();
  for (const slot of skeleton.drawOrder) {
    const attachment = slot.getAttachment();
    if (!attachment || !/^(men1_[23]|men3_[23]|men2_mu_[12])$/.test(attachment.name)) continue;
    const point = material(attachment, vertices(spine, slot), .5, .5);
    result.set(attachment.name, {x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]});
  }
  return result;
}
function records(neutral = false) {
  const source = L.inspect(root, 'Map01'), config = L.read(root, L.configFile('A'));
  const stage = L.adaptStage(root, 'A', 1, {...config.LevelCfg[0], prefab: 'Map01'}), building = stage.buildings.find(value => value.kind === 6);
  assert(building, 'Map01 supplies an actual paired wall template');
  const sourceBefore = JSON.stringify(source.data), stageBefore = JSON.stringify(stage), index = {documents: {A: config}};
  const service = {root, index: () => index, previewConfig: () => config, source: () => source.data};
  const all = [];
  for (const face of ['SW', 'SE', 'NW', 'NE']) {
    const detached = clone(stage);
    detached.buildings = [{...clone(building), wallFacing: face, wallRun: {nativeVersion: 2, left: 4, right: 4, gate: true, start: 'post', end: 'post',
      routes: {left: [{u: 0, v: 0}, {u: -2, v: 0}, {u: -2, v: 2}], right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}]}}}];
    const before = JSON.stringify(detached), result = Preview.describe(service, detached);
    assert.deepEqual(result.errors, []);
    assert.equal(JSON.stringify(detached), before, 'Preparing actual preview descriptors cannot edit the stage');
    const pair = result.buildings[building.id].levels[1].skeletons.filter(part => part.json.wallKit || part.json.wallGate);
    assert.equal(pair.length, 2, 'Keep CQ2 effects while CQ1 supplies the matched door');
    // Calibration fixtures exclude saved authoring offsets; production preview
    // parsing above and wall-adjustments.test.cjs cover the saved placements.
    if (neutral) for (const part of pair) if (part.json.wallKit) {
      let json = Kit.install(Kit.source(part.json), part.json.wallKit.layout, part.json.wallKit, {mirrorX: Facing.mirrorX(face), adjustmentsData: {version: 1, poses: {}}});
      if (Facing.reverse(face)) json = Facing.mirrorJson(json);
      part.json = json;
    }
    all.push({face, pair});
  }
  assert.equal(JSON.stringify(source.data), sourceBefore, 'The actual prefab remains unchanged');
  assert.equal(JSON.stringify(stage), stageBefore);
  return all;
}

test('Creator Spine 3.8 parses actual paired wall previews and samples every production animation without invalid slots or vertices', options, t => {
  const spine = require(runtime), all = records();
  let poses = 0, rendered = 0, atlasRegions = 0, nativeAnchorsChecked = 0;
  for (const {face, pair} of all) for (const descriptor of pair) {
    const jsonBefore = JSON.stringify(descriptor.json);
    const {data, regions} = load(spine, descriptor); atlasRegions += regions;
    const plan = descriptor.json.wallKit?.layout, pieces = plan && Kit.posts(plan);
    for (let tier = 1; tier <= 3; tier++) for (const animation of data.animations) {
      const times = [...new Set([0, animation.duration, ...[.05, .15, .3, .5, .7, .9].map(fraction => animation.duration * fraction), .1001, .2334].filter(time => time <= animation.duration + 1e-7))];
      for (const time of times) {
        const skeleton = pose(spine, data, 'cq-rts-' + tier, animation.name, time); poses++;
        for (const slot of skeleton.drawOrder) {
          const points = vertices(spine, slot), attachment = slot.getAttachment();
          if (points.length) rendered++;
          if (/^(idle|open|shut|Fade_in_open)/.test(animation.name) && /^(rts_wall_part_|rts_wall_shadow_|rts_wall_leaf_)/.test(slot.data.name)) {
            const bounds = descriptor.json.skeleton;
            for (let i = 0; i < points.length; i += 2) {
              assert(points[i] >= bounds.x - 1e-4 && points[i] <= bounds.x + bounds.width + 1e-4, 'Actual posed gate/wall X must remain inside its culling bounds');
              assert(points[i + 1] >= bounds.y - 1e-4 && points[i + 1] <= bounds.y + bounds.height + 1e-4, 'Actual posed gate/wall Y must remain inside its culling bounds');
            }
          }
          if (!points.length || !/^rts_wall_(?:part|shadow)_/.test(slot.data.name)) continue;
          assert(attachment instanceof spine.RegionAttachment, 'Native modules must remain actual region attachments');
          const match = /^rts_wall_(post|top|right|corner)_([123])(?:_(?:body|shadow))?$/.exec(attachment.path); assert(match);
          const [ax, ay] = nativeAnchors[match[1]][tier - 1], width = attachment.region.originalWidth, height = attachment.region.originalHeight;
          assert.equal(attachment.region.width, width); assert.equal(attachment.region.height, height);
          assert.equal(attachment.region.offsetX, 0); assert.equal(attachment.region.offsetY, 0);
          const point = {x: points[2] + (points[4] - points[2]) * ax / width + (points[0] - points[2]) * ay / height,
            y: points[3] + (points[5] - points[3]) * ax / width + (points[1] - points[3]) * ay / height};
          const piece = pieces[Number(slot.data.name.replace(/^rts_wall_(?:part|shadow)_/, ''))];
          const expected = skeleton.findBone('rts_wall_frame').localToWorld(new spine.Vector2(piece.x * 2, piece.y * 2));
          close(point.x, expected.x); close(point.y, expected.y); nativeAnchorsChecked++;
          if (animation.name === 'idle_night') close(slot.color.r, 167 / 255);
        }
        if (animation.name === 'destroy' && time > .49) assert(!skeleton.drawOrder.some(slot => {
          const attachment = slot.getAttachment();
          return attachment && /^(rts_wall_part_|rts_wall_shadow_|rts_wall_leaf_)/.test(slot.data.name) && slot.color.a * attachment.color.a * skeleton.color.a > 1e-6;
        }), 'Destroyed walls and matched gates must disappear');
      }
    }
    assert.equal(JSON.stringify(descriptor.json), jsonBefore, 'Actual runtime parsing and posing cannot mutate the preview source');
  }
  assert(poses > 1000 && rendered > 5000 && nativeAnchorsChecked > 5000);
  t.diagnostic(JSON.stringify({runtime: 'Creator 2.4.13 Spine 3.8', faces: 4, tiers: 3, pairedSkeletons: 8, poses, sampledAttachments: rendered, atlasRegions, nativeAnchorsChecked, gameLoaded: false, audioStarted: false, projectWrites: 0}));
});

function sourcePixel(points,image,pixel){const u=pixel.x/image.width,v=pixel.y/image.height;return {x:points[2]+(points[4]-points[2])*u+(points[0]-points[2])*v,y:points[3]+(points[5]-points[3])*u+(points[1]-points[3])*v};}
function doorParts(spine,skeleton,spec,state){
 const pair=skeleton.findSlot(Door.slot);assert.equal(pair.getAttachment(),null,'An open gate cannot display its closed pair behind the separate leaves');const result={};
 for(const part of spec.states[state].parts){const slot=skeleton.findSlot(Door.partSlots[part.id]),attachment=slot.getAttachment();assert(attachment instanceof (part.mirrorX?spine.MeshAttachment:spine.RegionAttachment));assert.equal(attachment.path,part.path);assert.equal(attachment.region.width,part.width);assert.equal(attachment.region.height,part.height);assert.equal(attachment.region.offsetX,0);assert.equal(attachment.region.offsetY,0);assert(!attachment.region.rotate);result[part.id]={slot,attachment,points:vertices(spine,slot)};}
 return result;
}

test('real production Spine honors calibrated closed targets plus declared rigid visual insets in every tier, direction and compass face',options,()=>{
 const spine=require(runtime);
 for(const {face,pair}of records(true)){
  const descriptor=pair.find(part=>part.json.wallDoor),companion=pair.find(part=>part.json.wallGate);assert(descriptor&&companion);assert.equal(descriptor.json.wallDoor.closedOnly,false);assert.equal(descriptor.json.wallDoor.reverse,Facing.reverse(face));const {data}=load(spine,descriptor),side=load(spine,companion).data;
  for(let tier=1;tier<=3;tier++){
   const name='cq-rts-'+tier,spec=descriptor.json.wallDoor.tiers[tier-1],closed=pose(spine,data,name,'idle',0),closedSlot=closed.findSlot(Door.slot);assert(closedSlot.getAttachment() instanceof spine.RegionAttachment);assert.equal(closedSlot.getAttachment().path,spec.states.closed.path);const closedPoints=vertices(spine,closedSlot);
   for(const slot of Object.values(Door.partSlots))assert.equal(closed.findSlot(slot).getAttachment(),null);for(const model of [closed,pose(spine,side,name,'idle',0)])assert(!model.drawOrder.some(part=>part.getAttachment()&&/^men/.test(part.data.name)),'No old gate leaf or old pillar remains visible');
   for(const opening of ['outward','inward']){
    const clip=Facing.animation(descriptor.json,'open',opening),night=Facing.animation(descriptor.json,'open_night',opening),shut=Facing.animation(descriptor.json,'shut',opening),fade=Facing.animation(descriptor.json,'Fade_in',opening,true),stateName=(opening==='inward')!==Facing.reverse(face)?'inward':'outward';assert.equal(clip,'open_'+opening);let reference;
    for(const time of [0,.0001,.05,.15,.3333,1]){const opened=doorParts(spine,pose(spine,data,name,clip,time),spec,stateName);for(const part of spec.states[stateName].parts){const points=opened[part.id].points,actual=sourcePixel(points,part,{x:part.anchorX,y:part.anchorY}),target=sourcePixel(closedPoints,spec.states.closed,{x:part.targetX,y:part.targetY}),offset=part.poseOffset||{x:0,y:0},frame=opened[part.id].slot.bone;target.x+=2*(frame.a*offset.x+frame.b*offset.y);target.y+=2*(frame.c*offset.x+frame.d*offset.y);close(actual.x,target.x);close(actual.y,target.y);if(reference)assert.deepEqual(points,reference[part.id].points,'A calibrated leaf plus its explicit visual offset stays rigid without interpolation, stretching or drift');}reference=opened;}
    const nightParts=doorParts(spine,pose(spine,data,name,night,0),spec,stateName);for(const id of ['near','far']){assert.deepEqual(nightParts[id].points,reference[id].points);close(nightParts[id].slot.color.r,167/255);}
    for(const suffix of ['', '_night'])for(const time of [0,.0001,.15,.3333,1]){const skeleton=pose(spine,data,name,shut+suffix,time),slot=skeleton.findSlot(Door.slot);assert.equal(slot.getAttachment().path,spec.states.closed.path);assert.deepEqual(vertices(spine,slot),closedPoints);for(const partSlot of Object.values(Door.partSlots))assert.equal(skeleton.findSlot(partSlot).getAttachment(),null);}
    const skeleton=new spine.Skeleton(data);skeleton.setSkinByName(name);skeleton.setSlotsToSetupPose();const animation=new spine.AnimationState(new spine.AnimationStateData(data));animation.setAnimation(0,clip,false);animation.update(.2);animation.apply(skeleton);animation.setAnimation(0,fade,false);animation.addAnimation(0,night,false,0);for(const delta of [0,.1,.2,.3]){animation.update(delta);animation.apply(skeleton);skeleton.updateWorldTransform();doorParts(spine,skeleton,spec,stateName);}animation.setAnimation(0,shut,false);animation.apply(skeleton);skeleton.updateWorldTransform();assert.equal(skeleton.findSlot(Door.slot).getAttachment().path,spec.states.closed.path);for(const slot of Object.values(Door.partSlots))assert.equal(skeleton.findSlot(slot).getAttachment(),null);
   }
  }
 }
});

function closedOnlyDescriptor(descriptor,face){const metadata=clone(descriptor.json.wallKit);metadata.doors.closedOnly=true;for(const tier of metadata.doors.tiers)tier.states={closed:tier.states.closed};let json=Kit.install(Kit.source(descriptor.json),metadata.layout,metadata,{mirrorX:Facing.mirrorX(face),adjustmentsData:{version:1,poses:{}}});if(Facing.reverse(face))json=Facing.mirrorJson(json);return {...descriptor,json};}

test('detached closed-only Spine still opens a clear passage and restores its registered image in all tiers and faces', options, () => {
 const spine=require(runtime);
 for(const {face,pair}of records()){
  const descriptor=closedOnlyDescriptor(pair.find(part=>part.json.wallDoor),face),companion=pair.find(part=>part.json.wallGate);assert(descriptor&&companion);assert.equal(descriptor.json.wallDoor.closedOnly,true);assert.equal(descriptor.json.wallDoor.reverse,Facing.reverse(face));
  const {data}=load(spine,descriptor),side=load(spine,companion).data;
  for(let tier=1;tier<=3;tier++){
   const name='cq-rts-'+tier,expected=descriptor.json.wallDoor.tiers[tier-1].states.closed.path,closed=pose(spine,data,name,'idle',0),slot=closed.findSlot(Door.slot);assert(slot.getAttachment() instanceof spine.RegionAttachment);assert.equal(slot.getAttachment().path,expected);const closedPoints=vertices(spine,slot);
   for(const model of [closed,pose(spine,side,name,'idle',0)])assert(!model.drawOrder.some(part=>part.getAttachment()&&/^men/.test(part.data.name)),'No old gate leaf or old pillar remains visible');
   for(const opening of ['outward','inward']){
    const open=Facing.animation(descriptor.json,'open',opening),openNight=Facing.animation(descriptor.json,'open_night',opening),shut=Facing.animation(descriptor.json,'shut',opening),fade=Facing.animation(descriptor.json,'Fade_in',opening,true);assert.equal(open,'open');assert.equal(shut,'shut');
    for(const time of [0,.0001,.05,.15,.3333,1]){
     for(const clip of [open,openNight])assert.equal(pose(spine,data,name,clip,time).findSlot(Door.slot).getAttachment(),null,'Opening clears the closed bitmap at time zero');
     for(const clip of [shut,shut+'_night']){const p=pose(spine,data,name,clip,time).findSlot(Door.slot);assert.equal(p.getAttachment().path,expected);assert.deepEqual(vertices(spine,p),closedPoints,'Closing preserves the registered 2D angle and scale');if(clip.endsWith('_night'))close(p.color.r,167/255);}
    }
    const skeleton=new spine.Skeleton(data);skeleton.setSkinByName(name);skeleton.setSlotsToSetupPose();const state=new spine.AnimationState(new spine.AnimationStateData(data));state.setAnimation(0,open,false);state.update(.2);state.apply(skeleton);assert.equal(skeleton.findSlot(Door.slot).getAttachment(),null);state.setAnimation(0,fade,false);state.addAnimation(0,openNight,false,0);
    for(const delta of [0,.1,.2,.3]){state.update(delta);state.apply(skeleton);skeleton.updateWorldTransform();assert.equal(skeleton.findSlot(Door.slot).getAttachment(),null,'Night fading cannot reset an open doorway to its setup image');}
    state.setAnimation(0,shut,false);state.apply(skeleton);skeleton.updateWorldTransform();assert.equal(skeleton.findSlot(Door.slot).getAttachment().path,expected);
   }
  }
 }
});

// Recover and refit the original gateway explicitly, independent of production style.
function originalPair(pair,face){
 const main=pair.find(part=>part.json.wallKit),metadata=clone(main.json.wallKit),plan=metadata.layout;metadata.gateStyle='original';delete metadata.doors;
 return pair.map(part=>{let json;if(part===main)json=Kit.install(Kit.source(part.json),plan,metadata,{mirrorX:Facing.mirrorX(face),adjustmentsData:{version:1,poses:{}}});else{json=Kit.fitOriginalGate(Kit.source(part.json),plan,{frameToLocal:Maps.multiply(Maps.inverse(part.matrix),main.matrix)});json.wallGate={...clone(part.json.wallGate),style:'original'};}if(Facing.reverse(face))json=Facing.mirrorJson(json);return {...part,json};});
}

test('real Spine slot switches open both original gateway halves outward and return them to the same closed pose in day and night', options, () => {
  const spine = require(runtime);
  for (const {face, pair} of records()) for (const descriptor of originalPair(pair,face)) {
    const {data} = load(spine, descriptor), normal = Facing.normal(face);
    for (let tier = 1; tier <= 3; tier++) {
      const name = 'cq-rts-' + tier, closed = leaves(spine, pose(spine, data, name, 'idle', 0), descriptor.matrix);
      assert.equal(closed.size, tier === 2 ? 2 : 1);
      const opened = leaves(spine, pose(spine, data, name, 'open', 1), descriptor.matrix);
      const shut = leaves(spine, pose(spine, data, name, 'shut', 1), descriptor.matrix);
      const openNight = leaves(spine, pose(spine, data, name, 'open_night', 1), descriptor.matrix);
      const shutNight = leaves(spine, pose(spine, data, name, 'shut_night', 1), descriptor.matrix);
      assert.equal(opened.size, closed.size); assert.equal(shut.size, closed.size);
      for (const [leaf, start] of closed) {
        const end = opened.get(leaf), rest = shut.get(leaf);
        assert((end.x - start.x) * normal.x + (end.y - start.y) * normal.y > 1, face + '/' + descriptor.name + '/' + name + '/' + leaf + ' must open outward');
        close(rest.x, start.x); close(rest.y, start.y);
        close(openNight.get(leaf).x, end.x); close(openNight.get(leaf).y, end.y);
        close(shutNight.get(leaf).x, rest.x); close(shutNight.get(leaf).y, rest.y);
      }
    }
  }
});
