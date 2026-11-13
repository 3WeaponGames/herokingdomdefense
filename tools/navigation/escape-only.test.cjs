'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
const box = (a, b, c, d) => [{ x: a, y: b }, { x: c, y: b }, { x: c, y: d }, { x: a, y: d }];

test('Desert cavalry upgrade recovery ignores a subpixel return to its still-blocked post', () => {
  // Actual stage 3 tier-2 cavalry footprint and the physics-nudged position
  // captured by the Browser regression. Both endpoints remain inside the solid.
  const polygon = [
    [1.9779907226562727, 533.8789794921875], [85.47799072265627, 489.37897949218745],
    [165.87799072265625, 471.5789794921875], [218.77799072265623, 488.4789794921876],
    [258.37799072265625, 510.0789794921875], [282.87799072265625, 529.2789794921875],
    [283.87799072265625, 564.3789794921875], [207.97799072265627, 669.2789794921875],
    [148.5779907226563, 705.7789794921875], [73.17799072265626, 657.6789794921874],
    [22.17799072265626, 607.6789794921874], [1.1779907226562614, 578.1789794921874]
  ].map(([x, y]) => ({ x, y }));
  const grid = new NavigationGrid([polygon], { minX: -975, maxX: 975, minY: -1559, maxY: 1559 }, 16);
  const start = { x: 189.56618361091154, y: 675.2107289448807 }, oldPost = { x: 189.178, y: 674.579 };
  assert(!grid.isWalkable(start, 20)); assert(!grid.isWalkable(oldPost, 20));
  const ordinary = grid.findPath(start, oldPost, 20);
  assert(ordinary.reached); assert.deepEqual(ordinary.goal, oldPost, 'ordinary movement inside an existing overlap remains supported');
  const escape = grid.findPath(start, oldPost, 20, false, true);
  assert(escape && escape.reached && escape.escape);
  assert(grid.isWalkable(escape.goal, 20), 'safety arrival requires full-body free ground');
  assert(Math.hypot(escape.goal.x - start.x, escape.goal.y - start.y) > 20);
  let previous = start;
  for (const point of escape.points) { assert(grid.canExitBlocked(previous, point, 20)); previous = point; }
  assert.deepEqual(grid.findPath(start, oldPost, 20).goal, oldPost, 'safety queries do not contaminate ordinary route caches');
});

test('escape-only search stops immediately when the body is already clear', () => {
  const grid = new NavigationGrid([box(-50, -50, 50, 50)], { minX: -300, minY: -300, maxX: 300, maxY: 300 }, 20);
  const start = { x: 150, y: 0 }, result = grid.findPath(start, { x: 0, y: 0 }, 12, false, true);
  assert.deepEqual(result.goal, start); assert.deepEqual(result.points, [start]); assert.equal(result.escape, null);
});

test('incremental escape-only recovery can turn inside existing solids without entering a different wall', () => {
  const inner = box(-220, -220, 220, 220);
  const outer = [{ x: -320, y: -320 }, { x: 320, y: -320 }, { x: 320, y: 320 }, { x: 240, y: 320 }, { x: 240, y: -240 }, { x: -240, y: -240 }, { x: -240, y: 320 }, { x: -320, y: 320 }];
  const grid = new NavigationGrid([inner, outer], { minX: -600, minY: -600, maxX: 600, maxY: 600 }, 20);
  const start = { x: 0, y: -190 }, job = grid.createSearch(start, start, 12, false, true);
  let slices = 0;
  while (!job.done && slices++ < 20000) { job.step(37); assert(job.lastWork <= 37); }
  assert(job.done && job.result && job.result.escape);
  assert(grid.isWalkable(job.result.goal, 12));
  let previous = start;
  for (const point of job.result.points) { assert(grid.canExitBlocked(previous, point, 12)); previous = point; }
});

test('fully sealed escape-only search terminates without a fabricated destination', () => {
  const grid = new NavigationGrid([box(-200, -200, 200, 200)], { minX: -100, minY: -100, maxX: 100, maxY: 100 }, 20);
  const start = { x: 0, y: 0 }, job = grid.createSearch(start, start, 12, false, true);
  let slices = 0;
  while (!job.done && slices++ < 10000) { job.step(17); assert(job.lastWork <= 17); }
  assert(job.done); assert.equal(job.result, null);
});
