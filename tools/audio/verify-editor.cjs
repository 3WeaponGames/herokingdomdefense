'use strict';
// Exercise the shipped sound panel with real media decoding and an isolated checklist.
// The browser and every preview element are muted before any source is assigned.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), packageRoot = path.join(root, 'packages/hkd-sounds');
const { SoundService } = require(path.join(packageRoot, 'service')), Catalog = require(path.join(packageRoot, 'catalog'));
const out = path.resolve(process.env.HKD_ARTIFACT_DIR || path.join(os.homedir(), 'Documents/Codex Artifacts/HeroKingdomDefense/sound-editor-verification'));
async function verify() {
  assert(out !== root && !out.startsWith(root + path.sep), 'Keep verification artifacts outside the project'); fs.mkdirSync(out, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(out, 'fixture-')), assets = Catalog.index(root);
  for (const item of assets.items) {
    const target = path.join(fixture, item.file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, item.file), target);
    if (fs.existsSync(path.join(root, item.file + '.meta'))) fs.copyFileSync(path.join(root, item.file + '.meta'), target + '.meta');
  }
  const service = new SoundService(fixture), calls = [], errors = [], checks = [], modules = ['model', 'player', 'client'];
  const scripts = modules.map(name => '(function(module,exports,require){' + fs.readFileSync(path.join(packageRoot, name + '.js'), 'utf8') + '\n})(mods[' + JSON.stringify(name) + ']={exports:{}},mods[' + JSON.stringify(name) + '].exports,function(name){return mods[name.replace("./","")].exports;});').join('\n');
  const bootstrap = 'window.mods={};' + scripts + '\nwindow.audioCreated=0;window.startClient=function(){window.client=mods.client.exports.mount(document.getElementById("root"),{ipc:async function(name,request){const r=await fetch("/api/"+name,{method:"POST",body:JSON.stringify(request||{})});const value=await r.json();if(value.error)throw Error(value.error);return value;},url:function(item){return "/audio/"+encodeURIComponent(item.id);},createAudio:function(){window.audioCreated++;var a=document.createElement("audio");a.muted=true;return a;},confirm:function(){return true;}});return client.ready;};startClient();';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Sound Editor verification</title><style>html,body,#root{height:100%;margin:0;overflow:hidden}' + fs.readFileSync(path.join(packageRoot, 'style.css'), 'utf8') + '</style></head><body><div id="root"></div><script>' + bootstrap + '</script></body></html>';
  const server = http.createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://127.0.0.1').pathname;
      if (route === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
      if (route.startsWith('/api/')) {
        const name = route.slice(5); if (!['load', 'mark', 'save', 'discard', 'reveal'].includes(name)) throw Error('Unknown sound-editor request');
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 65536) throw Error('Request too large'); }
        calls.push(name); const request = JSON.parse(body || '{}'), result = name === 'reveal' ? { selected: true } : service[name](request);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
      }
      if (route.startsWith('/audio/')) {
        const item = service.asset({ id: decodeURIComponent(route.slice(7)) }), file = path.join(fixture, item.file), size = fs.statSync(file).size;
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''), start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) { res.writeHead(416).end(); return; }
        res.setHeader('Content-Type', item.format === 'MP3' ? 'audio/mpeg' : item.format === 'WAV' ? 'audio/wav' : 'audio/' + item.format.toLowerCase());
        res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Content-Length', end - start + 1);
        if (range) { res.statusCode = 206; res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size); }
        fs.createReadStream(file, { start, end }).pipe(res); return;
      }
      res.writeHead(404).end();
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio'] });
    page = await browser.newPage({ viewport: { width: 1380, height: 900 } }); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => window.client && client.snapshot);
    const settle = () => page.evaluate(() => client.pending), key = async value => { await page.locator('.sound-tool').focus(); await page.keyboard.press(value); await settle(); };
    assert.equal(await page.locator('.sound-row').count(), assets.items.length); assert.equal(await page.evaluate(() => audioCreated), 0); assert.deepEqual(calls, ['load']);
    checks.push('All current clips load with no audio playback or checklist writes');
    const decoded = await page.evaluate(async () => {
      let index = 0, count = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (index < client.snapshot.items.length) {
          const item = client.snapshot.items[index++];
          await new Promise((resolve, reject) => {
            const audio = document.createElement('audio'); audio.muted = true; audio.preload = 'metadata';
            const timer = setTimeout(() => finish(Error('Metadata timeout: ' + item.file)), 10000);
            function finish(error) { clearTimeout(timer); audio.onloadedmetadata = audio.onerror = null; audio.removeAttribute('src'); audio.load(); error ? reject(error) : resolve(); }
            audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? null : Error('Invalid audio duration: ' + item.file));
            audio.onerror = () => finish(Error('Cannot decode ' + item.file)); audio.src = '/audio/' + encodeURIComponent(item.id); audio.load();
          }); count++;
        }
      })); return count;
    });
    assert.equal(decoded, assets.items.length); checks.push('Every clip loads valid audio metadata through the panel audio URL, with muted elements and no playback');
    const source = page.getByLabel('Source', { exact: true });
    await source.selectOption('original'); assert.equal(await page.locator('.sound-row').count(), assets.items.filter(item => item.origin === 'original').length);
    await source.selectOption('new'); assert.equal(await page.locator('.sound-row').count(), assets.items.filter(item => item.origin === 'new').length);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await page.getByLabel('Biome', { exact: true }).selectOption('ice'); assert.equal(await page.locator('.sound-row').count(), 2);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await page.locator('[data-category="horses"]').click(); assert.equal(await page.locator('.sound-row').count(), 8);
    checks.push('Original/New, biome and category filters show their correct clips');
    await page.locator('.sound-row').first().click(); assert.equal(await page.evaluate(() => audioCreated), 0);
    await page.getByRole('button', { name: 'Play (Space)', exact: true }).click(); await page.waitForFunction(() => client.player.status === 'playing');
    assert.equal(await page.evaluate(() => client.player.media.muted), true); assert(await page.getByRole('button', { name: 'Pause (Space)', exact: true }).isVisible());
    await key('Space'); assert.equal(await page.evaluate(() => client.player.status), 'paused'); await key('Space'); await page.waitForFunction(() => client.player.status === 'playing');
    const initial = await page.evaluate(() => client.player.id); await key('Shift+E'); await page.waitForFunction(id => client.player.id !== id && client.player.status === 'playing', initial);
    await key('Shift+Q'); assert.equal(await page.evaluate(() => client.player.id), initial);
    await page.getByRole('button', { name: 'Next (Shift+E)', exact: true }).click(); await page.waitForFunction(() => client.player.status === 'playing');
    const clickedNext = await page.evaluate(() => client.player.id); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => client.player.status), 'paused'); assert.equal(await page.evaluate(() => client.player.id), clickedNext);
    await page.getByRole('button', { name: 'Previous (Shift+Q)', exact: true }).click(); await page.waitForFunction(id => client.player.id === id && client.player.status === 'playing', initial);
    await key('Shift+W'); assert.equal(await page.evaluate(() => client.player.mode), 'loop'); assert.equal(await page.evaluate(() => client.player.media.loop), true);
    await page.getByRole('button', { name: 'Mode: Loop (Shift+W)', exact: true }).click(); assert.equal(await page.evaluate(() => client.player.mode), 'next');
    await page.evaluate(() => { client.player.media.currentTime = client.player.media.duration - .05; });
    await page.waitForFunction(id => client.player.id !== id && client.player.status === 'playing', initial);
    await key('Shift+W'); await page.getByRole('button', { name: 'Stop', exact: true }).click();
    checks.push('Real muted audio decodes, Play/Pause and previous/next hotkeys work, and loop/autoplay modes advance correctly');
    const marked = [];
    for (const [keyName, color] of [['A', 'green'], ['S', 'yellow'], ['D', 'red']]) {
      const id = await page.evaluate(() => client.player.id); marked.push({ id, color }); await key('Shift+' + keyName);
      assert.equal(await page.evaluate(id => client.snapshot.marks[id], id), color);
      assert(await page.locator('.sound-row.selected .sound-clip-name .sound-dot.' + color).isVisible());
      const reviewButton = page.locator('.sound-mark-button').filter({ hasText: color[0].toUpperCase() + color.slice(1) + ' (Shift+' + keyName + ')' });
      await reviewButton.click(); await settle(); assert.equal(await page.evaluate(id => client.snapshot.marks[id] || null, id), null);
      await reviewButton.click(); await settle(); assert.equal(await page.evaluate(id => client.snapshot.marks[id], id), color);
      if (color !== 'red') { await key('Shift+E'); await page.getByRole('button', { name: 'Stop', exact: true }).click(); }
    }
    assert(!fs.existsSync(service.file)); assert(service.dirty());
    for (const color of ['green', 'yellow', 'red']) { await page.locator('[data-mark="' + color + '"]').click(); assert.equal(await page.locator('.sound-row').count(), 1); }
    await page.locator('[data-mark="all"]').click();
    await page.getByRole('button', { name: 'Save Checklist', exact: true }).click(); await settle(); assert(!service.dirty()); assert(fs.existsSync(service.file));
    await page.evaluate(async () => { client.destroy(); await startClient(); });
    for (const item of marked) assert.equal(await page.evaluate(id => client.snapshot.marks[id], item.id), item.color);
    assert.equal(await page.evaluate(() => client.player.media), null);
    await page.getByLabel('Sort', { exact: true }).selectOption('mark'); assert.equal(await page.getByLabel('Group by category', { exact: true }).isChecked(), false);
    const firstColors = await page.locator('.sound-row .sound-clip-name .sound-dot').evaluateAll(nodes => nodes.slice(0, 3).map(node => ['green', 'yellow', 'red'].find(color => node.classList.contains(color))));
    assert.deepEqual(firstColors, ['green', 'yellow', 'red']);
    checks.push('Green/yellow/red shortcuts show dots after names, filter by color, sort globally, and survive Save and reopening');
    await page.evaluate(id => client.player.select(id, true), marked[0].id); await page.waitForFunction(() => client.player.status === 'playing');
    const beforeTyping = await page.evaluate(() => client.player.id);
    await page.getByRole('searchbox', { name: 'Search sounds', exact: true }).fill('forest'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => client.player.id), beforeTyping); await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal(await page.evaluate(() => client.player.status), 'paused');
    await page.evaluate(id => client.player.select(id, false), marked[0].id);
    await page.screenshot({ path: path.join(out, 'sound-editor-desktop.png') });
    await page.setViewportSize({ width: 850, height: 600 });
    const bounds = await page.evaluate(() => { const root = document.querySelector('.sound-tool'), footer = document.querySelector('.sound-player'); return { scroll: root.scrollWidth, width: root.clientWidth, footer: footer.getBoundingClientRect().bottom, height: innerHeight }; });
    assert(bounds.scroll <= bounds.width + 1); assert(bounds.footer <= bounds.height + 1);
    await page.screenshot({ path: path.join(out, 'sound-editor-compact.png') });
    checks.push('Search typing does not trigger shortcuts; losing focus pauses; desktop and minimum panel layouts keep all playback buttons visible');
    await page.evaluate(() => client.destroy()); assert.equal(await page.locator('.sound-tool').count(), 0);
    assert.deepEqual(errors, []); await page.close();
    const report = { checks, errors, clips: assets.items.length, original: assets.items.filter(item => item.origin === 'original').length, new: assets.items.filter(item => item.origin === 'new').length, savedTestMarks: marked, allPlaybackMuted: true, checklistWritesRestrictedToExternalFixture: true };
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page && !page.isClosed()) { fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.message, pageErrors: errors, checks, body: await page.locator('body').innerText() }, null, 2)); await page.screenshot({ path: path.join(out, 'sound-editor-failure.png') }); }
    throw error;
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => { server.close(resolve); if (server.closeAllConnections) server.closeAllConnections(); });
    assert.equal(path.dirname(fixture), out); assert(path.basename(fixture).startsWith('fixture-')); fs.rmSync(fixture, { recursive: true, force: true });
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
