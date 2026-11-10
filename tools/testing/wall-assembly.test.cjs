'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Assembly = require('../../assets/_script/WallAssembly');
const wall = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../assets/KinghtFallIconMap/com/Ani/cq/cq1/cq1.json'), 'utf8'));
const sizes = wall.wallKit.sizes;
const anchors = {
  post: [[61, 77], [60.5, 91], [60.5, 93]],
  right: [[61, 77], [60.5, 91], [60.5, 93]],
  top: [[68, 77], [64.5, 91], [66.5, 93]],
  corner: [[68, 77], [64.5, 91], [67.5, 93]]
};
const copy = value => JSON.parse(JSON.stringify(value));
const native = overrides => ({nativeVersion: 2, left: 3, right: 4, gate: true, start: 'post', end: 'post', ...overrides});
const legacy = overrides => ({left: 3, right: 4, gate: true, start: 'post', end: 'post', spacing: 1, ...overrides});
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-8, `${message || ''} ${actual} != ${expected}`);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function checkChain(points, begin, end, count) {
  assert.equal(points.length, count + 1);
  assert.deepEqual(points[0], begin);
  close(points.at(-1).x, end.x);
  close(points.at(-1).y, end.y);
  for (let i = 1; i < points.length; i++) {
    close(points[i].x - points[i - 1].x, 45, 'native horizontal repeat');
    close(points[i].y - points[i - 1].y, -30, 'native vertical repeat');
  }
}

test('native runs keep the measured 45 by 30 world grid for every join and zero-length wing', () => {
  assert.deepEqual(Assembly.axis, {x: 45, y: 30, slope: 2 / 3});
  assert.deepEqual(Assembly.step, {x: 45, y: 30});
  for (const gate of [false, true]) for (let left = 0; left <= 4; left++) for (let right = 0; right <= 4; right++) {
    for (const start of ['post', 'shared']) for (const end of ['post', 'corner']) {
      const run = native({left, right, gate, start, end, nativeOrigin: {x: 11.25, y: -8.5}, nativeGateSpan: 147.5});
      const allowed = (gate || left + right > 0) && (!gate || left > 0 || start === 'post') && (!gate || right > 0 || end === 'post');
      assert.equal(Assembly.valid(run), allowed, JSON.stringify(run));
      if (!allowed) {
        assert.throws(() => Assembly.layout(run), /Invalid wall run/);
        continue;
      }
      const before = copy(run);
      const plan = Assembly.layout(freeze(run));
      assert.equal(plan.legacy, false);
      assert.equal(plan.leftCount, left);
      assert.equal(plan.rightCount, right);
      close((plan.left.x + plan.right.x) / 2, 11.25);
      close((plan.left.y + plan.right.y) / 2, -8.5);
      close(plan.right.x - plan.left.x, gate ? 147.5 : 0);
      close(plan.left.y - plan.right.y, gate ? 147.5 * 2 / 3 : 0);
      checkChain(plan.leftPoints, plan.leftEnd, plan.left, left);
      checkChain(plan.rightPoints, plan.right, plan.rightEnd, right);
      const pieces = Assembly.pieces(plan);
      assert.equal(pieces.length, left + right + (gate ? 2 : 1) - (start === 'shared' ? 1 : 0));
      const pointKeys = pieces.map(piece => piece.x + ',' + piece.y);
      assert.equal(new Set(pointKeys).size, pieces.length, 'The solid middle join must have one post');
      assert.equal(pieces.filter(piece => piece.gateway).length, gate ? 2 : 0);
      assert.equal(pieces.filter(piece => piece.part === 'corner').length, end === 'corner' ? 1 : 0);
      if (end === 'corner') assert.deepEqual({x: pieces.at(-1).x, y: pieces.at(-1).y}, plan.rightEnd);
      if (start === 'shared') assert(!pieces.some(piece => piece.x === plan.leftEnd.x && piece.y === plan.leftEnd.y));
      assert.deepEqual(run, before, 'Planning cannot write into stage data');
    }
  }
});

test('all tier and facing attachments retain whole native PNG proportions and measured anchors', () => {
  const pieces = [
    ...Assembly.pieces(Assembly.layout(native({end: 'corner'}))),
    ...Assembly.pieces(Assembly.layout(native({left: 0, right: 4, gate: false, routes: {right: [{u: 0, v: 0}, {u: 0, v: 2}, {u: 2, v: 2}]}})))
  ];
  for (const mirrorX of [false, true]) for (let tier = 1; tier <= 3; tier++) for (const piece of pieces) {
    const before = copy(piece);
    const attachment = Assembly.attachment(freeze(piece), tier, sizes, {mirrorX});
    const kind = mirrorX ? ({top: 'right', right: 'top'}[piece.part] || piece.part) : piece.part;
    const name = `rts_wall_${kind}_${tier}`;
    const [width, height] = sizes[name], [anchorX, anchorY] = anchors[kind][tier - 1];
    const sign = mirrorX ? -1 : 1;
    assert.equal(attachment.path, name);
    assert.equal(attachment.scaleX, sign);
    close(attachment.width / width, 1.5);
    close(attachment.height / height, 1.5);
    close(attachment.x + sign * (anchorX - width / 2) * 1.5, piece.x * 2, 'PNG ground anchor X');
    close(attachment.y + (height / 2 - anchorY) * 1.5, piece.y * 2, 'PNG ground anchor Y');
    for (const key of ['vertices', 'uvs', 'triangles', 'rotation', 'scaleY']) assert.equal(attachment[key], undefined, 'Native modules must stay rigid image regions');
    assert(!attachment.type || attachment.type === 'region');
    assert.deepEqual(piece, before);
  }
  assert.throws(() => Assembly.attachment({part: 'top', x: 0, y: 0}, 1, {}), /Missing native wall module/);
});

test('canonical migration preserves unknown fields, authored gate center and lengths without mutating legacy input', () => {
  const run = legacy({left: 2, right: 1, handles: {left: [-240, -165, -60], right: [70, 130]}, sockets: {left: 3, right: -4, depth: 1}, FutureField: {enabled: false, nested: [1, {id: 'untouched'}]}});
  const before = copy(run), plan = Assembly.layout(freeze(run));
  assert.equal(plan.legacy, true);
  assert.equal(plan.leftCount, 4);
  assert.equal(plan.rightCount, 2);
  close(plan.nativeOrigin.x, 5);
  close(plan.nativeOrigin.y, 23.5 + Math.tan(Math.PI / 6) * -49 - Math.tan(Math.PI / 6) * 5);
  assert.equal(plan.nativeGateSpan, 130);
  const migrated = Assembly.canonical(run);
  assert.equal(Assembly.valid(migrated), true);
  assert.equal(migrated.nativeVersion, 2);
  assert.equal(migrated.spacing, 1);
  assert.equal(migrated.left, 4);
  assert.equal(migrated.right, 2);
  assert.equal(migrated.handles, undefined);
  assert.equal(migrated.sockets, undefined);
  assert.deepEqual(migrated.FutureField, before.FutureField);
  assert.notStrictEqual(migrated.FutureField, run.FutureField);
  assert.deepEqual(Assembly.canonical(freeze(migrated)), migrated, 'Saving a native run twice is stable');
  assert.deepEqual(run, before);
  for (const spacing of [1, 2, 4]) {
    const source = legacy({left: 3, right: 5, spacing});
    const result = Assembly.layout(source);
    assert.equal(result.leftCount, Math.ceil(3 * 60 * spacing / 45));
    assert.equal(result.rightCount, Math.ceil(5 * 60 * spacing / 45));
  }
});

test('native module counts supersede stale freeform handles, sockets and spacing after migration', () => {
  const run = native({nativeOrigin: {x: 5, y: -7}, nativeGateSpan: 125, spacing: 0, handles: {left: [-200], right: [300]}, sockets: null, FutureField: {keep: 'yes'}});
  const before = copy(run);
  assert.equal(Assembly.valid(run), true, 'Stale legacy controls cannot invalidate native counts');
  const plan = Assembly.layout(freeze(run));
  assert.equal(plan.leftCount, 3);
  assert.equal(plan.rightCount, 4);
  assert.equal(plan.sockets, undefined, 'Inactive socket controls cannot shift a native gate');
  const canonical = Assembly.canonical(run);
  assert.equal(canonical.handles, undefined);
  assert.equal(canonical.sockets, undefined);
  assert.equal(canonical.spacing, 1);
  assert.deepEqual(Assembly.layout(canonical), plan, 'Saving and reopening cannot reposition the gate');
  assert.deepEqual(canonical.FutureField, run.FutureField);
  assert.deepEqual(run, before);
});

test('malformed and oversized runs fail before allocating modules while native limits stay supported', () => {
  const invalid = [null, [], 'wall', {}, native({nativeVersion: 1}), native({nativeVersion: '2'}),
    native({left: -1}), native({left: 0.5}), native({left: NaN}), native({left: Infinity}), native({left: 257}), native({right: 257}), native({gate: 1}),
    native({start: 'corner'}), native({end: 'shared'}), native({gate: false, left: 0, right: 0}),
    native({nativeOrigin: null}), native({nativeOrigin: {x: 0}}), native({nativeOrigin: {x: '0', y: 0}}), native({nativeOrigin: {x: 10001, y: 0}}), native({nativeOrigin: {x: 0, y: Infinity}}),
    native({nativeGateSpan: 79.99}), native({nativeGateSpan: 20000.01}), native({nativeGateSpan: NaN}), native({nativeGateSpan: '120'}),
    legacy({left: 33}), legacy({left: 32, right: 17}), legacy({spacing: 0}), legacy({spacing: 5}),
    legacy({handles: null}), legacy({handles: {left: [0], right: [100]}}), legacy({left: 1, right: 0, handles: {left: [0, 23], right: [103]}}),
    legacy({left: 0, right: 0, handles: {left: [0], right: [79.99]}}), legacy({left: 0, right: 1, gate: false, handles: {left: [0], right: [1, 46]}}),
    legacy({sockets: {left: 21, right: 0, depth: 0}}), legacy({sockets: {left: 0, right: '0', depth: 0}})];
  for (const run of invalid) {
    assert.equal(Assembly.valid(run), false, JSON.stringify(run));
    if (run !== null) assert.throws(() => Assembly.layout(run), /Invalid wall run/);
  }
  const largest = native({left: 256, right: 256, nativeOrigin: {x: 10000, y: -10000}, nativeGateSpan: 20000});
  assert.equal(Assembly.valid(largest), true);
  const plan = Assembly.layout(largest);
  assert.equal(Assembly.pieces(plan).length, 514);
  assert.equal(Assembly.valid(legacy({left: 32, right: 16, spacing: 4})), true);
  const tooLongHandles = legacy({left: 1, right: 0, handles: {left: [-10000, 2000], right: [2100]}});
  assert.equal(Assembly.valid(tooLongHandles), true, 'The legacy schema is valid before module conversion');
  assert.throws(() => Assembly.layout(tooLongHandles), /native module budget/);
  assert.throws(() => Assembly.layout(null, [{x: -100000, y: 0}]), /native module budget/);
});

test('default and legacy endpoint fitting ignores malformed points and never changes source endpoint data', () => {
  const endpoints = freeze([{x: -160, y: 72}, {x: 170, y: -90}, null, {x: '999', y: 0}, {x: 1, y: Infinity}]);
  const before = endpoints.slice();
  const plan = Assembly.layout(undefined, endpoints);
  assert.equal(plan.legacy, true);
  assert.equal(plan.leftCount, 3);
  assert.equal(plan.rightCount, 3);
  assert.equal(plan.gate, true);
  assert.deepEqual(endpoints, before);
  const canonical = Assembly.canonical(null, endpoints);
  assert.equal(canonical.nativeVersion, 2);
  assert.equal(Assembly.valid(canonical), true);
  assert.deepEqual(Assembly.layout(canonical).leftPoints, plan.leftPoints);
  assert.deepEqual(Assembly.layout(canonical).rightPoints, plan.rightPoints);
});

function pointFor(origin, u, v) {return {x: origin.x + 45 * (u + v), y: origin.y + 30 * (-u + v)};}
function pieceAt(pieces, point) {return pieces.find(piece => Math.abs(piece.x - point.x) < 1e-8 && Math.abs(piece.y - point.y) < 1e-8);}
function graphPart(plan, point) {
  let upperLeft = false, upperRight = false;
  for (const points of [plan.leftPoints, plan.rightPoints]) for (let i = 1; i < points.length; i++) {
    for (const [a, b] of [[points[i - 1], points[i]], [points[i], points[i - 1]]]) {
      if (Math.abs(a.x - point.x) < 1e-8 && Math.abs(a.y - point.y) < 1e-8 && b.y > a.y) {
        if (b.x < a.x) upperLeft = true; else upperRight = true;
      }
    }
  }
  return upperLeft ? upperRight ? 'corner' : 'top' : upperRight ? 'right' : 'post';
}

test('native routes support all four axes with exact whole-piece steps and rear-to-front order', () => {
  for (const side of ['left', 'right']) for (const end of [{u: 3, v: 0}, {u: -3, v: 0}, {u: 0, v: 3}, {u: 0, v: -3}]) {
    const run = native({left: side === 'left' ? 3 : 0, right: side === 'right' ? 3 : 0, gate: false,
      routes: {[side]: [{u: 0, v: 0}, end]}, FutureField: {keep: [1, 2]}});
    const before = copy(run), plan = Assembly.layout(freeze(run));
    const points = plan[side + 'Points'], origin = plan[side], outward = side === 'left' ? points.slice().reverse() : points;
    assert.equal(points.length, 4);
    for (let i = 0; i <= 3; i++) assert.deepEqual(outward[i], pointFor(origin, end.u * i / 3, end.v * i / 3));
    assert.deepEqual(plan[side + 'End'], outward.at(-1));
    assert.deepEqual(plan[side + 'Segments'], [{a: origin, b: outward.at(-1)}]);
    const pieces = Assembly.pieces(plan);
    assert.equal(pieces.length, 4);
    for (const piece of pieces) assert.equal(piece.part, graphPart(plan, piece), 'Select the native sprite from its connected rear neighbors');
    for (let i = 1; i < pieces.length; i++) assert(pieces[i].y <= pieces[i - 1].y, 'Rear ground points render before foreground points');
    const canonical = Assembly.canonical(run);
    assert.deepEqual(canonical.routes, run.routes);
    assert.deepEqual(Assembly.layout(canonical), plan);
    assert.deepEqual(Assembly.canonical(canonical), canonical);
    assert.deepEqual(run, before);
  }
});

test('front and back bends choose original CORNER and POST modules without flipped or painted artwork', () => {
  for (const u of [-2, 2]) for (const v of [-2, 2]) {
    const run = native({left: 0, right: 4, gate: false, routes: {right: [{u: 0, v: 0}, {u, v: 0}, {u, v}]}});
    const plan = Assembly.layout(run), pieces = Assembly.pieces(plan), bend = pieceAt(pieces, pointFor(plan.right, u, 0));
    assert.equal(pieces.length, 5);
    assert.equal(plan.rightSegments.length, 2);
    assert.equal(bend.part, u > 0 ? v > 0 ? 'corner' : 'top' : v > 0 ? 'right' : 'post');
    for (const piece of pieces) {
      assert.equal(piece.part, graphPart(plan, piece));
      for (let tier = 1; tier <= 3; tier++) for (const mirrorX of [false, true]) {
        const attachment = Assembly.attachment(piece, tier, sizes, {mirrorX});
        const expected = mirrorX ? ({top: 'right', right: 'top'}[piece.part] || piece.part) : piece.part;
        assert.equal(attachment.path, `rts_wall_${expected}_${tier}`);
        assert.equal(attachment.scaleX * (mirrorX ? -1 : 1), 1, 'Counter the owner frame flip so original source pixels remain unmirrored');
        assert.equal(attachment.vertices, undefined);
        assert.equal(attachment.rotation, undefined);
      }
    }
  }
});

test('malformed, diagonal, repeated, self-crossing and closed routes cannot enter the saved native format', () => {
  const bad = [null, [], {right: null}, {right: []}, {right: [{u: 1, v: 0}]},
    {right: [{u: 0, v: 0}, {u: 1.5, v: 0}]}, {right: [{u: 0, v: 0}, {u: '4', v: 0}]},
    {right: [{u: 0, v: 0}, {u: 1, v: 1}]}, {right: [{u: 0, v: 0}, {u: 4, v: 0}, {u: 4, v: 0}]},
    {right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 0, v: 0}]},
    {right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}, {u: 0, v: 2}, {u: 0, v: 0}]},
    {right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}, {u: 1, v: 2}, {u: 1, v: -1}]},
    {right: [{u: 0, v: 0}, {u: 257, v: 0}]}, {right: [{u: 0, v: 0}, {u: 3, v: 0}]}];
  for (const routes of bad) {
    const run = native({left: 0, right: 4, gate: false, routes});
    assert.equal(Assembly.valid(run), false, JSON.stringify(routes));
    assert.throws(() => Assembly.layout(run), /Invalid wall run/);
  }
  for (const route of [[{u: 0, v: 0}], [{u: 0, v: 0}, {u: 0, v: 0}]]) {
    const run = native({left: 0, right: 0, gate: true, routes: {left: route, right: route}});
    assert.equal(Assembly.valid(run), true);
    assert.equal(Assembly.pieces(Assembly.layout(run)).length, 2);
  }
  const run = native({left: 0, right: 256, gate: false, routes: {right: [{u: 0, v: 0}, {u: 256, v: 0}]}});
  assert.equal(Assembly.valid(run), true);
  assert.equal(Assembly.pieces(Assembly.layout(run)).length, 257);
  for (const points of [
    [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}, {u: 0, v: 2}, {u: 0, v: 0}],
    [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}, {u: 1, v: 2}, {u: 1, v: -1}]
  ]) {
    const closed = native({left: 0, right: 8, gate: false, routes: {right: points}});
    assert.equal(Assembly.valid(closed), false, 'Self-intersections remain invalid even when section counts match');
  }
});

test('separate wings cannot retrace, cross each other or obstruct their gate opening', () => {
  const origin = {u: 0, v: 0};
  const overlap = native({left: 1, right: 1, gate: false, routes: {left: [origin, {u: -1, v: 0}], right: [origin, {u: -1, v: 0}]}});
  const closure = native({left: 4, right: 4, gate: false, routes: {
    left: [origin, {u: -2, v: 0}, {u: -2, v: 2}], right: [origin, {u: 0, v: 2}, {u: -2, v: 2}]
  }});
  const crossing = native({left: 5, right: 5, gate: false, routes: {
    left: [origin, {u: -2, v: 0}, {u: -2, v: 3}], right: [origin, {u: 0, v: 2}, {u: -3, v: 2}]
  }});
  const leftIntoGate = native({left: 1, right: 0, routes: {left: [origin, {u: 1, v: 0}]}});
  const rightIntoGate = native({left: 0, right: 1, routes: {right: [origin, {u: -1, v: 0}]}});
  const fractionalCrossing = native({left: 5, right: 3, nativeGateSpan: 100, routes: {
    left: [origin, {u: 0, v: 2}, {u: 3, v: 2}], right: [origin, {u: 0, v: 3}]
  }});
  for (const run of [overlap, closure, crossing, leftIntoGate, rightIntoGate, fractionalCrossing]) {
    assert.equal(Assembly.valid(run), false, JSON.stringify(run));
    assert.throws(() => Assembly.layout(run), /Invalid wall run/);
  }
  const separate = native({left: 4, right: 4, routes: {
    left: [origin, {u: -2, v: 0}, {u: -2, v: 2}], right: [origin, {u: 2, v: 0}, {u: 2, v: 2}]
  }});
  assert.equal(Assembly.valid(separate), true, 'Two valid bent wings remain independently buildable');
});

test('collinear route control points preserve one continuous collision segment', () => {
  const run = native({left: 0, right: 5, gate: false, routes: {right: [{u: 0, v: 0}, {u: 1, v: 0}, {u: 3, v: 0}, {u: 3, v: 2}]}});
  const plan = Assembly.layout(run);
  assert.equal(plan.rightSegments.length, 2, 'Authoring control points cannot create collider seams');
  assert.deepEqual(plan.rightSegments[0], {a: plan.right, b: pointFor(plan.right, 3, 0)});
  assert.deepEqual(plan.rightSegments[1], {a: pointFor(plan.right, 3, 0), b: pointFor(plan.right, 3, 2)});
});

test('legacy canonical conversion cannot retain incompatible inactive native route controls', () => {
  const run = legacy({routes: {left: [{u: 0, v: 0}, {u: -3, v: 0}]}, FutureField: {keep: 'yes'}});
  assert.equal(Assembly.valid(run), true);
  const canonical = Assembly.canonical(run);
  assert.equal(Assembly.valid(canonical), true, 'A valid legacy wall must produce a valid canonical native wall');
  assert.equal(canonical.routes, undefined);
  assert.deepEqual(canonical.FutureField, run.FutureField);
});
