'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepare } = require('./prepare-creator-spine.cjs');

test('untrusted or failed Creator downloads cannot replace an existing runtime', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hkd-creator-dependency-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const runtime = path.join(directory, 'extensions/spine/lib/spine.js');
  await fs.mkdir(path.dirname(runtime), { recursive: true });
  await fs.writeFile(runtime, 'preserved-runtime');
  await assert.rejects(prepare(directory, async () => new Response('wrong runtime')), /integrity check failed/);
  assert.equal(await fs.readFile(runtime, 'utf8'), 'preserved-runtime');
  await assert.rejects(prepare(directory, async () => new Response('', { status: 503 })), /HTTP 503/);
  assert.equal(await fs.readFile(runtime, 'utf8'), 'preserved-runtime');
});

test('Creator test dependencies cannot be downloaded into the project', async () => {
  let called = false;
  const download = async () => { called = true; };
  await assert.rejects(prepare(path.resolve(__dirname, '../..'), download), /outside the project/);
  await assert.rejects(prepare(path.join(__dirname, 'dependency'), download), /outside the project/);
  await assert.rejects(prepare('', download), /external directory/);
  assert.equal(called, false);
});
