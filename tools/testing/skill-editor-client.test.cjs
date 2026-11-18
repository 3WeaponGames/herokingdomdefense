'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Client = require('../../packages/hkd-skills/client'), Settings = require('../../assets/_script/HeroSkillSettings');
const copy = value => JSON.parse(JSON.stringify(value)), flush = () => new Promise(resolve => setImmediate(resolve));
function store(catalogs, initialData = {}) {
  let version = 1, data = copy(initialData), saved = copy(initialData), undo = [], redo = []; const calls = [];
  function snapshot() { return { version, revision: 'disk-revision', data: copy(data), dirty: JSON.stringify(data) !== JSON.stringify(saved), canUndo: !!undo.length, canRedo: !!redo.length,
    styles: Settings.styles, fields: Object.fromEntries(Settings.styles.map(style => [style.id, Settings.fields(style.id)])),
    effective: Object.fromEntries(Settings.styles.map(style => [style.id, Settings.effective(style.id, { HeroSkills: data })])),
    catalogs: { audio: [{ id: 'aaaa0000-0000-0000-0000-000000000001', name: 'Test cue', file: 'assets/KinghtFallAudio/test.wav' }], vfx: [],...catalogs } }; }
  const api = { settings: Settings, async ipc(name, request) {
    calls.push({ name, request: copy(request) });
    if (name === 'describe') return { runtimePath: '', layers: [{ json: { animations: { idle: {}, attack: {}, move: {} } } }] };
    if (name !== 'load') { assert.equal(request.version, version); assert.equal(request.revision, 'disk-revision'); }
    if (name === 'change') { undo.push(copy(data)); redo = []; data[request.style] ||= {}; Settings.set(data[request.style], request.path, request.value); version++; }
    if (name === 'alignProjectile') { undo.push(copy(data));redo=[];data.skirmisher ||= {};for(const [path,value]of Object.entries({projectileFromBow:true,projectileOffsetX:0,projectileOffsetY:0,'visual.originX':0,'visual.originY':0,'visual.offsetX':0,'visual.offsetY':0}))Settings.set(data.skirmisher,path,value);version++; }
    if (name === 'save') { saved = copy(data); version++; return { ...snapshot(), result: { saved: true } }; }
    if (name === 'undo') { redo.push(copy(data)); data = undo.pop(); version++; }
    if (name === 'redo') { undo.push(copy(data)); data = redo.pop(); version++; }
    if (name === 'discard') { data = copy(saved); version++; }
    if (name === 'reset') { const keys = request.path.split('.'), key = keys.pop(); let target = data[request.style]; for (const part of keys) target = target && target[part]; if (target) delete target[key]; version++; }
    return snapshot();
  } };
  return { api, calls, snapshot };
}

test('skill drafts browse read-only and a clean save performs no publication IPC', async () => {
  const backend = store(), session = Client.createSession(backend.api); await session.load();
  for (const style of Settings.styles) assert.equal(session.effective(style.id).cooldown, Settings.defaults(style.id).cooldown);
  await session.action('save'); assert.deepEqual(backend.calls.map(call => call.name), ['load']); assert.deepEqual(backend.snapshot().data, {}); session.destroy();
});
test('queued edits serialize against each accepted version and save only after they finish', async () => {
  const backend = store(), session = Client.createSession(backend.api); await session.load();
  session.change('mystic', 'visual.originX', 12); session.change('mystic', 'visual.originX', 18); session.change('mystic', 'audio.cast.volume', .4);
  assert.equal(session.effective('mystic').visual.originX, 18); await session.action('save');
  assert.deepEqual(backend.calls.filter(call => call.name === 'change').map(call => call.request.version), [1, 2, 3]);
  assert.equal(backend.calls.at(-1).name, 'save'); assert.equal(session.state().snapshot.dirty, false); assert.equal(session.effective('mystic').audio.cast.volume, .4); session.destroy();
});
test('a rejected field remains visible without advancing the revision or allowing save', async () => {
  const backend = store(), base = backend.api.ipc; backend.api.ipc = (name, request) => name === 'change' && request.value === 999 ? Promise.reject(Error('Rejected field')) : base(name, request);
  const session = Client.createSession(backend.api); await session.load(); await session.change('fighter', 'cooldown', 999);
  assert.equal(session.effective('fighter').cooldown, 999); assert.equal(session.state().snapshot.version, 1); assert.equal(session.state().rejected, 1);
  await session.action('save'); assert.equal(backend.calls.some(call => call.name === 'save'), false);
  await session.change('fighter', 'cooldown', 20); assert.equal(session.state().rejected, 0); assert.equal(session.state().error, ''); await session.action('save'); assert.equal(backend.calls.at(-1).name, 'save'); session.destroy();
});
test('closing a skills window ignores late responses and never sends queued edits afterward', async () => {
  const backend = store(), base = backend.api.ipc; let release;
  backend.api.ipc = (name, request) => name === 'change' ? new Promise(resolve => { release = () => resolve(base(name, request)); }) : base(name, request);
  let updates = 0; const session = Client.createSession(backend.api, () => updates++); await session.load();
  const first = session.change('fighter', 'cooldown', 13), second = session.change('fighter', 'visual.originY', 20); await flush();
  session.destroy(); const atClose = updates; release(); await first; await second;
  assert.equal(updates, atClose); assert.equal(backend.calls.filter(call => call.name === 'change').length, 1);
});
test('undo, redo and default reset stay in drafts until an explicit save', async () => {
  const backend = store(), session = Client.createSession(backend.api); await session.load(); await session.change('skirmisher', 'windup', .7);
  await session.action('undo'); assert.equal(session.effective('skirmisher').windup, Settings.defaults('skirmisher').windup); await session.action('redo'); assert.equal(session.effective('skirmisher').windup, .7);
  await session.reset('skirmisher', 'windup'); assert.equal(session.effective('skirmisher').windup, Settings.defaults('skirmisher').windup); assert.equal(backend.calls.some(call => call.name === 'save'), false); session.destroy();
});

class Element {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.attributes = {}; this.listeners = {}; this.style = {}; this._value = ''; this._text = ''; this.className = ''; this.classList = { toggle: (name, on) => { const values = new Set(this.className.split(/\s+/).filter(Boolean)); on ? values.add(name) : values.delete(name); this.className = [...values].join(' '); }, add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false) }; }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  set textContent(value) { this._text = String(value); this.children = []; } get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set value(value) { this._value = String(value); } get value() { return this._value; }
  setAttribute(name, value) { this.attributes[name] = String(value); } getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; } removeEventListener(name) { delete this.listeners[name]; }
  get options() { return this.children; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  click() { if (!this.disabled && this.onclick) return this.onclick(); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  querySelectorAll(selector) { const values = []; const match = node => selector.split(',').some(part => { const attr = /^\[([^=]+)="([^"]*)"\]$/.exec(part); return attr ? node.getAttribute(attr[1]) === attr[2] : part.startsWith('.') ? node.className.split(' ').includes(part.slice(1)) : node.tagName.toLowerCase() === part; }); const walk = node => node.children.forEach(child => { if (match(child)) values.push(child); walk(child); }); walk(this); return values; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
async function fixture(custom = {}) {
  const backend = store(custom.catalogs,custom.data), document = { defaultView: {}, activeElement: null }; document.createElement = tag => new Element(tag, document);
  const host = new Element('div', document), calls = { preview: [], scenarios: [], audio: [], seeks:[],plays:[],destroyed: false }; let options;
  const api = { ...backend.api, ipc: (name, request) => name === 'describe' && custom.describe ? custom.describe(request) : backend.api.ipc(name, request), audioURL: item => item.file, createAudio: () => { const media = { pause() {}, removeAttribute() {}, load() {}, play() { calls.audio.push(this.src); return Promise.resolve(); } }; return media; }, createPreview(_host, value) { options = value; return { set: async request => calls.preview.push(copy(request)), setScenario: value => calls.scenarios.push(copy(value)), play(value) {calls.plays.push(value);if(custom.statusOnPlay!==undefined)options.onStatus({time:custom.statusOnPlay,duration:4,playing:false});}, seek(value) {calls.seeks.push(value);options.onStatus({time:value,duration:4,playing:false});}, step() {}, fit() {}, cast() {}, setAudioEnabled() {}, selectHandle() {}, destroy() { calls.destroyed = true; } }; } };
  const client = Client.mount(host, api); await flush(); await flush();
  const button = title => host.querySelectorAll('button').find(node => node.textContent === title), field = label => host.querySelector('[aria-label="' + label + '"]');
  return { host, client, backend, calls, button, field, options: () => options, async settle() { await client.flush(); await flush(); await flush(); }, close() { client.destroy(); } };
}
test('description editing previews real stat changes, inserts placeholders and resets invalid copy without publication',async()=>{
 const f=await fixture({data:{skirmisher:{activeDamage:1.1}}});
 const description=f.field('Description'),template=description.value,preview=()=>f.field('Description preview');assert.equal(description.tagName,'TEXTAREA');assert.match(preview().textContent,/110%/);
 f.field('Active damage multiplier').value=.9;f.field('Active damage multiplier').oninput();assert.match(preview().textContent,/90%/);assert.equal(description.value,template);await f.settle();assert.equal(f.backend.calls.some(call=>call.name==='save'),false);
 description.value='Damage {activeDamage:percent}.';description.oninput();await f.settle();assert.equal(preview().textContent,'Damage 90%.');
 const insert=f.field('Insert description stat');insert.value='{cooldown}';insert.onchange();await f.settle();assert.equal(description.value,'Damage {activeDamage:percent}.{cooldown}');assert.equal(preview().textContent,'Damage 90%.12');
 description.value='Bad {missing}';description.oninput();assert(description.className.includes('invalid'));assert.match(preview().textContent,/Unknown skill stat/);assert.equal(f.button('Save skills').disabled,true);
 description.parentElement.querySelector('button').click();await f.settle();assert.equal(description.value,template);assert.match(preview().textContent,/90%/);assert.equal(description.className.includes('invalid'),false);
 await f.client.selectEntry('fighter','passive');await f.settle();assert.match(f.field('Description preview').textContent,/stacks/);assert(f.field('Description').value.includes('{maxStacks}'));assert.equal(f.backend.calls.some(call=>call.name==='save'),false);f.close();
});

test('actual skills client lists six styles and browsing and scenario controls never stage game data', async () => {
  const f = await fixture(); assert.equal(f.host.querySelectorAll('.style-card').length, 6); assert.equal(f.calls.preview.at(-1).style, 'skirmisher');
  await f.client.selectStyle('mystic'); await f.settle(); f.field('Hero HP %').value = 25; f.field('Hero HP %').oninput();
  assert.equal(f.calls.scenarios.at(-1).hp, 25); assert.equal(f.backend.calls.filter(call => ['change', 'save'].includes(call.name)).length, 0); assert.equal(f.calls.audio.length, 0); f.close(); assert.equal(f.calls.destroyed, true);
});
test('field changes update the live preview immediately but publish only on Save skills', async () => {
  const f = await fixture(), input = f.field('Cooldown'); input.value = 18; input.oninput(); await flush();
  assert.equal(f.calls.preview.at(-1).settings.cooldown, 18); assert.equal(f.backend.calls.some(call => call.name === 'save'), false);
  await f.settle(); assert.equal(f.backend.snapshot().dirty, true); await f.client.save(); assert.equal(f.backend.calls.at(-1).name, 'save'); assert.equal(f.backend.snapshot().dirty, false); f.close();
});
test('preview attack rate changes tick cadence inputs without staging or saving any skill field', async () => {
  const f = await fixture(); await f.client.selectStyle('mystic'); await f.settle(); const input = f.field('Attacks / second');
  assert.equal(input.value, '1.5'); input.value = '3.25'; input.oninput(); assert.deepEqual(f.calls.scenarios.at(-1), { attackRate: 3.25 });
  await f.settle(); assert.equal(f.backend.calls.some(call => call.name === 'change' || call.name === 'save'), false); assert.equal(f.backend.snapshot().dirty, false); f.close();
});
test('position handles expose only useful anchors for the selected style and reset an unavailable selection', async () => {
  const f = await fixture(), options = () => f.field('Handle').options.map(option => option.value);
  assert(!options().includes('passive'));
  await f.client.selectStyle('mystic'); await f.settle(); assert(options().includes('cast'));assert(!options().includes('effect'));for(const name of ['origin','target','mark','beam'])assert(!options().includes(name),name+' belongs to the passive');
  await f.client.selectEntry('mystic','passive');await f.settle();assert(options().includes('origin'));assert(options().includes('target'));assert(!options().includes('effect'));f.field('Handle').value='target';f.field('Handle').onchange();
  await f.client.selectStyle('fighter'); await f.settle(); assert(options().includes('effect'));assert(!options().includes('passive'));assert.equal(f.field('Handle').value,'effect');
  await f.client.selectEntry('fighter','passive');await f.settle();assert(options().includes('passive'));assert(!options().includes('effect'));
  await f.client.selectStyle('guardian'); await f.settle();assert(options().includes('effect'));assert(!options().includes('presence'));
  assert.equal(f.backend.calls.some(call => call.name === 'change' || call.name === 'save'), false); f.close();
});

test('single-volley controls expose the actual hit arc without obsolete projectile-collider fields',async()=>{
 const f=await fixture();f.button('Position & VFX').click();await f.settle();assert(f.field('Hit arc angle'));for(const id of ['skill-visual-offsetX','skill-visual-offsetY','skill-visual-rotation'])assert(f.host.querySelectorAll('input').some(node=>node.id===id),id);assert.equal(f.field('Projectile radius'),null);assert.equal(f.field('Projectile'),null);assert.equal(f.button('Align projectile to bow'),undefined);assert.equal(f.backend.snapshot().dirty,false);f.field('Hit arc angle').value='24';f.field('Hit arc angle').onchange();await f.settle();assert.equal(f.backend.snapshot().effective.skirmisher.visual.arcDegrees,24);assert.equal(f.backend.calls.some(c=>c.name==='save'),false);f.close();
});

test('native Skirmisher exposes the complete volley effect and its contact controls without unrelated projectile artwork',async()=>{
 const id='bbbb0000-0000-0000-0000-000000000021',f=await fixture({catalogs:{vfx:[{id,name:'Three volley effect'}]}});
 f.button('Position & VFX').click();await f.settle();assert.equal(f.field('Projectile'),null);assert.equal(f.field('VFX asset'),null);const picker=f.field('Cast effect VFX asset');assert(picker);assert(picker.options.some(option=>option.value===id));
 picker.value=id;picker.onchange();await f.settle();assert(f.backend.calls.some(call=>call.name==='describe'&&call.request.castResource===id));assert.equal(f.calls.preview.at(-1).settings.visual.castResource,id);assert(f.field('Hit arc angle'));assert.equal(f.field('Projectile radius'),null);assert.equal(f.backend.calls.some(call=>call.name==='save'),false);assert.equal(f.calls.audio.length,0);f.close();
});

test('R restarts the current preview without editing drafts and stays available for typing in fields',async()=>{
 const f=await fixture(),root=f.host.children[0],key=root.listeners.keydown;let stopped=0;
 key({key:'r',target:root,preventDefault(){stopped++;},stopPropagation(){}});assert.equal(f.calls.seeks.at(-1),0);assert.equal(f.calls.plays.at(-1),true);assert.equal(stopped,1);
 const count=f.calls.seeks.length;for(const event of [{target:f.field('Cooldown')},{target:root,ctrlKey:true},{target:root,altKey:true},{target:root,repeat:true}])key({key:'r',preventDefault(){throw Error('Typing or modified keys must remain untouched');},stopPropagation(){},...event});assert.equal(f.calls.seeks.length,count);
 f.button('Restart (R)').click();await flush();assert.equal(f.calls.seeks.length,count+1);key({key:'R',target:f.field('Horse moving'),preventDefault(){},stopPropagation(){}});assert.equal(f.calls.seeks.length,count+2,'R also works after clicking Horse moving');assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false);f.close();
});
test('invalid numeric fields block Ctrl+S and remain visible until corrected or discarded', async () => {
  const f = await fixture(), input = f.field('Cooldown'); input.value = -5; input.oninput();
  await f.client.save(); assert.equal(f.backend.calls.some(call => call.name === 'save'), false); assert.match(f.host.textContent, /Correct the highlighted/);
  f.button('Position & VFX').click(); await flush(); f.button('Skill settings').click(); await flush(); assert.equal(f.field('Cooldown').value, '-5');
  f.field('Cooldown').value = 14; f.field('Cooldown').onchange(); await f.settle(); await f.client.save(); assert.equal(f.backend.calls.at(-1).name, 'save'); f.close();
});
test('SFX selection and ordinary preview stay silent, while explicit Test sound resolves the imported UUID', async () => {
  const f = await fixture(); f.button('SFX').click(); await flush(); const clip = f.field('Cast sound');
  clip.value = 'aaaa0000-0000-0000-0000-000000000001'; clip.onchange(); await f.settle(); assert.equal(f.calls.audio.length, 0);
  f.options().onSound('cast', { clip: clip.value, volume: 1 }); assert.equal(f.calls.audio.length, 0);
  f.button('Test sound').click(); await flush(); assert.deepEqual(f.calls.audio, ['assets/KinghtFallAudio/test.wav']); f.close();
});
test('changing VFX reloads the selected asset immediately and a late old description cannot overwrite it', async () => {
  const descriptions = [], pending = new Map();
  const f = await fixture({ describe(request) { descriptions.push(copy(request)); if (!request.castResource||!request.castResource.startsWith('bbbb0000')) return Promise.resolve({ layers: [{ json: { animations: { attack: {} } } }], effects: [] }); return new Promise(resolve => pending.set(request.castResource, () => resolve({ layers: [{ json: { animations: { attack: {} } } }], effects: [{ id: request.castResource }] }))); } });
  await f.client.selectStyle('fighter');await f.settle();f.button('Position & VFX').click(); await flush(); const field = f.field('Cast effect VFX asset'), first = 'bbbb0000-0000-0000-0000-000000000001', second = 'bbbb0000-0000-0000-0000-000000000002';
  field.value = first; field.oninput(); await flush(); field.value = second; field.oninput(); await flush();
  assert.equal(descriptions.some(value => value.castResource === first), true); assert.equal(descriptions.some(value => value.castResource === second), true);
  pending.get(second)(); await flush(); await flush(); assert.equal(f.calls.preview.at(-1).description.effects[0].id, second);
  pending.get(first)(); await flush(); await flush(); assert.equal(f.calls.preview.at(-1).description.effects[0].id, second); f.close();
});
test('rider animation dropdown excludes horse-only clips and requires every rider equipment layer to support the choice', async () => {
  const f = await fixture({ describe(request) { return Promise.resolve({ layers: [
    { name: 'wqyl_lead_ma', json: { _heroMakerMount: {}, animations: { idle: {}, move: {}, horse_only: {} } } },
    { name: 'body', json: { _heroMaker: { role: 0 }, animations: { idle: {}, ['attack_' + request.style]: {events:[{name:'attack',time:.1667}]}, body_only: {events:[{name:'attack',time:.1667}]} } } },
    { name: 'equipment', json: { _heroMaker: { role: 4 }, animations: { idle: {}, ['attack_' + request.style]: {} } } }
  ] }); } });
  f.button('Position & VFX').click(); await flush();
  assert.deepEqual(f.field('Rider animation').options.map(option => option.value), ['', 'attack_skirmisher']);
  await f.client.selectEntry('mystic','passive'); await f.settle(); assert.deepEqual(f.field('Rider animation').options.map(option => option.value), ['', 'attack_mystic']);
  assert.equal(f.backend.calls.some(call => call.name === 'change'), false); f.close();
});
test('ending a beam cancels delayed channel audio before it can start', async () => {
  const played = [], audio = Client.createAudioPlayer({ audioURL: value => value, createAudio: () => ({ pause() {}, removeAttribute() {}, load() {}, play() { played.push('played'); return Promise.resolve(); } }) });
  audio.cue('channel', { clip: 'channel.wav', delay: .02 }); audio.cue('stopChannel');
  await new Promise(resolve => setTimeout(resolve, 45)); assert.deepEqual(played, []); audio.destroy();
});
test('stopping an audio test ignores a late rejected playback promise after cleanup', async () => {
  let rejectPlay; const errors = [], audio = Client.createAudioPlayer({ audioURL: value => value, createAudio: () => ({ pause() {}, removeAttribute() {}, load() {}, play() { return new Promise((_resolve, reject) => { rejectPlay = reject; }); } }) }, message => errors.push(message));
  audio.cue('cast', { clip: 'cast.wav' }); audio.stop(); rejectPlay(Error('Aborted by pause')); await flush(); assert.deepEqual(errors, []); audio.destroy();
});
test('resetting or seeking a preview cancels delayed cast and impact sounds as well as its channel',async()=>{
  const played=[],audio=Client.createAudioPlayer({audioURL:value=>value,createAudio:()=>({pause(){},removeAttribute(){},load(){},play(){played.push('played');return Promise.resolve();}})});
  audio.cue('cast',{clip:'cast.wav',delay:.02});audio.cue('impact',{clip:'impact.wav',delay:.02});audio.cue('stop');await new Promise(resolve=>setTimeout(resolve,45));assert.deepEqual(played,[]);audio.destroy();
});
test('preview sound delays follow preview speed while explicit sound tests retain seconds',async()=>{
  const f=await fixture();const label=f.host.querySelectorAll('label').find(node=>node.textContent==='Sound in preview'),check=label.children[0];check.checked=true;check.onchange();f.field('Speed').value='.5';f.field('Speed').onchange();
  const old=global.setTimeout,delays=[];global.setTimeout=(_fn,ms)=>{delays.push(ms);return {};};
  try{f.options().onSound('cast',{clip:'test',volume:1,delay:1});assert.deepEqual(delays,[2000]);}finally{global.setTimeout=old;f.close();}
});
test('reloading the latest draft refreshes the hero rig instead of retaining an old appearance description',async()=>{
  let generation=0;const f=await fixture({describe:()=>Promise.resolve({generation:++generation,layers:[{json:{animations:{attack:{}}}}]})});assert.equal(f.calls.preview.at(-1).description.generation,1);
  f.button('Reload latest draft').click();await flush();await flush();await f.settle();assert.equal(f.calls.preview.at(-1).description.generation,2);assert.equal(f.backend.calls.some(call=>call.name==='save'),false);f.close();
});

test('Reset and Discard recover an invalid-only local edit without publishing it',async()=>{
 const f=await fixture();f.field('Cooldown').value=-5;f.field('Cooldown').oninput();assert.equal(f.button('Discard changes').disabled,false);
 f.field('Cooldown').parentElement.querySelector('button').click();await f.settle();assert.equal(f.field('Cooldown').value,'12');assert.equal(f.backend.calls.some(call=>call.name==='save'),false);
 f.field('Cooldown').value='';f.field('Cooldown').oninput();assert.equal(f.button('Discard changes').disabled,false);f.button('Discard changes').click();await f.settle();assert.equal(f.field('Cooldown').value,'12');assert.equal(f.button('Discard changes').disabled,true);f.close();
});

test('impact audition has the same three-voice budget as in-game skill sounds',()=>{
 const media=[],audio=Client.createAudioPlayer({createAudio(){const item={paused:false,pause(){this.paused=true;},removeAttribute(){},load(){},play(){return Promise.resolve();}};media.push(item);return item;}});
 for(let i=0;i<20;i++)audio.cue('impact',{clip:'silent-test-adapter',volume:1});assert.equal(media.filter(item=>!item.paused).length,3);audio.destroy();assert(media.every(item=>item.paused));
});

test('Cast changes a Basic preview back to Active without staging or saving settings',async()=>{
 const f=await fixture();f.field('Preview').value='basic';f.field('Preview').onchange();await f.settle();f.button('Cast skill').click();await f.settle();assert.equal(f.field('Preview').value,'active');assert.equal(f.backend.calls.some(call=>call.name==='change'||call.name==='save'),false);f.close();
});

test('delayed skill auditions share the runtime pending budget and cleanup returns that capacity',()=>{
 const oldSet=global.setTimeout,oldClear=global.clearTimeout,timers=new Set();let scheduled=0;global.setTimeout=()=>{const token={};timers.add(token);scheduled++;return token;};global.clearTimeout=token=>timers.delete(token);
 try{const audio=Client.createAudioPlayer({createAudio(){throw Error('No delayed cue should have started');}});for(let i=0;i<2000;i++)audio.cue('impact',{clip:'silent-adapter',delay:30});assert.equal(scheduled,512);assert.equal(timers.size,512);audio.stop();assert.equal(timers.size,0);audio.cue('impact',{clip:'silent-adapter',delay:30});assert.equal(timers.size,1);audio.destroy();assert.equal(timers.size,0);}finally{global.setTimeout=oldSet;global.clearTimeout=oldClear;}
});

test('Guardian inherited effect color uses the same blue swatch as its in-game shield',async()=>{
 const f=await fixture();await f.client.selectStyle('guardian');f.button('Position & VFX').click();await f.settle();assert.equal(f.field('Effect color')._colorPicker.value,'#70c8ff');assert.equal(f.backend.calls.some(call=>call.name==='change'||call.name==='save'),false);f.close();
});

function pointer(node,phase,x=0,extra={}){const event={pointerId:1,button:0,isPrimary:true,clientX:x,shiftKey:false,altKey:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};const handler=node.listeners[phase];if(handler)handler(event);return event;}
function caption(f,input){return f.host.querySelectorAll('label').find(label=>label.htmlFor===input.id)||input.parentElement.children[0];}

test('timeline snapshots the requested position before synchronous pause status can restore the old thumb value',async()=>{
 const f=await fixture({statusOnPlay:.25}),timeline=f.field('Skill preview position');f.options().onStatus({time:.25,duration:4,playing:true});timeline.value='2.125';timeline.oninput();assert.equal(f.calls.seeks.at(-1),2.125);assert.equal(timeline.value,'2.125');assert.equal(f.calls.plays.at(-1),false);
 timeline.getBoundingClientRect=()=>({left:100,width:216});const down=pointer(timeline,'pointerdown',208);assert.equal(down.prevented,true,'The timeline owns only its left pointer gesture');assert.equal(f.calls.seeks.at(-1),2);f.options().onStatus({time:.9,duration:4,playing:true});assert.equal(timeline.value,'2','Status callbacks cannot move the thumb under a held pointer');pointer(timeline,'pointermove',258);assert.equal(f.calls.seeks.at(-1),3);pointer(timeline,'pointerup',258);assert.equal(timeline.value,'3');assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false);f.close();
});

test('numeric labels scrub a live preview but a long drag produces just one shared-draft edit and undo step',async()=>{
 const f=await fixture(),input=f.field('Cooldown'),label=caption(f,input);assert.match(label.title,/Shift/);assert.equal(input.listeners.pointerdown,undefined,'Typing and spinner controls retain native input behavior');pointer(label,'pointerdown',0);pointer(label,'pointermove',20);assert.equal(input.value,'12.2');assert.equal(f.calls.preview.at(-1).settings.cooldown,12.2);await new Promise(r=>setTimeout(r,210));assert.equal(f.backend.calls.filter(c=>c.name==='change').length,0,'A pause during dragging does not publish a partial edit');pointer(label,'pointermove',40);pointer(label,'pointerup',40);await f.settle();assert.equal(f.backend.calls.filter(c=>c.name==='change').length,1);assert.equal(f.backend.snapshot().effective.skirmisher.cooldown,12.4);assert.equal(f.backend.snapshot().canUndo,true);f.button('Undo').click();await f.settle();assert.equal(f.field('Cooldown').value,'12');assert.equal(f.backend.calls.some(c=>c.name==='save'),false);f.close();
});

test('numeric scenario labels respect fine/coarse modifiers, bounds and steps without creating game-data edits',async()=>{
 const f=await fixture(),input=f.field('Hero HP %'),label=input.parentElement.children[0];pointer(label,'pointerdown');pointer(label,'pointermove',-10);assert.equal(input.value,'90');pointer(label,'pointermove',-20,{shiftKey:true});assert.equal(input.value,'89');pointer(label,'pointermove',-21,{altKey:true});assert.equal(input.value,'79');pointer(label,'pointermove',1000,{altKey:true});assert.equal(input.value,'100');pointer(label,'pointermove',990);assert.equal(input.value,'90','Reversing from a bound responds immediately');pointer(label,'pointerup',990);assert.equal(f.calls.scenarios.at(-1).hp,90);await f.settle();assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false);
 await f.client.selectEntry('fighter','passive');await f.settle();const strikes=f.field('Max Stacks'),count=caption(f,strikes);pointer(count,'pointerdown');pointer(count,'pointermove',8,{shiftKey:true});assert.equal(Number.isInteger(Number(strikes.value)),true);pointer(count,'pointermove',1000,{altKey:true});assert.equal(strikes.value,'100');pointer(count,'pointerup');await f.settle();assert.equal(f.backend.calls.filter(c=>c.name==='change').length,1);f.close();
});

test('Escape, pointer cancellation, return-to-start and closing cancel a scrub without publishing or leaving gesture listeners',async()=>{
 for(const mode of ['escape','cancel','return','close']){const f=await fixture(),input=f.field('Cooldown'),label=caption(f,input);pointer(label,'pointerdown');pointer(label,'pointermove',50);assert.equal(input.value,'12.5');if(mode==='escape')pointer(label,'keydown',50,{key:'Escape'});if(mode==='cancel')pointer(label,'pointercancel',50);if(mode==='return'){pointer(label,'pointermove',0);pointer(label,'pointerup',0);}if(mode==='close')f.close();else{await f.settle();assert.equal(f.field('Cooldown').value,'12');f.close();}await new Promise(r=>setTimeout(r,180));assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false,mode);assert.equal(label.listeners.pointermove,undefined);}
});

test('all skill and scenario field labels expose tooltips and invalid text never starts scrubbing',async()=>{
 const f=await fixture();for(const style of Settings.styles){await f.client.selectStyle(style.id);await f.settle();for(const tab of ['Skill settings','Position & VFX','SFX']){f.button(tab).click();await f.settle();for(const label of f.host.querySelectorAll('label'))assert(label.title&&label.title.length>8,style.id+'/'+tab+'/'+label.textContent);}}
 await f.client.selectStyle('skirmisher');f.button('Skill settings').click();await f.settle();const input=f.field('Cooldown'),label=caption(f,input);input.value='';input.oninput();pointer(label,'pointerdown');pointer(label,'pointermove',100);pointer(label,'pointerup');assert.equal(input.value,'');assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false);f.close();
});


test('numeric scrubber owns one pointer, cancels on window blur and releases every captured listener on cleanup',()=>{
 const view={listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},removeEventListener(name){delete this.listeners[name];}},doc={defaultView:view},label=new Element('label',doc),input=new Element('input',doc);input.value='2';let held=null,previews=[],commits=[],cancelled=0;label.setPointerCapture=id=>{held=id;};label.hasPointerCapture=id=>held===id;label.releasePointerCapture=()=>{held=null;};
 const scrub=require('../../packages/hkd-skills/numeric-scrub').attach(label,input,{min:0,max:5,step:.25,preview:n=>previews.push(n),commit:n=>commits.push(n),cancel(){cancelled++;}});
 pointer(label,'pointerdown',0,{button:1});pointer(view,'pointermove',20);assert.deepEqual(previews,[]);pointer(label,'pointerdown');pointer(view,'pointermove',20,{pointerId:2});assert.equal(input.value,'2');pointer(view,'pointermove',4);assert.equal(input.value,'3');pointer(view,'pointerup',4,{pointerId:2});assert.equal(held,1);pointer(view,'blur',4,{type:'blur'});assert.equal(input.value,'2');assert.equal(held,null);assert.equal(cancelled,1);assert.deepEqual(commits,[]);
 pointer(label,'pointerdown');pointer(view,'pointermove',8);pointer(view,'pointerup',8);assert.deepEqual(commits,[4]);assert.equal(held,null);scrub.destroy();scrub.destroy();assert.deepEqual(Object.keys(view.listeners),[]);assert.deepEqual(Object.keys(label.listeners),[]);
});


test('on-hit VFX uses its own asset animations and participates in preview description cache identity',async()=>{
 const main='bbbb0000-0000-0000-0000-000000000010',hit='bbbb0000-0000-0000-0000-000000000011',next='bbbb0000-0000-0000-0000-000000000012',requests=[];
 const f=await fixture({catalogs:{vfx:[{id:main,name:'Main effect',animations:['main-loop']},{id:hit,name:'Impact effect',animations:['hit-burst']},{id:next,name:'Other impact',animations:['hit-other']}]},describe(request){requests.push(copy(request));return Promise.resolve({layers:[{json:{animations:{attack:{}}}}],effects:[{id:request.castResource||'default-main'},{id:request.impactResource||'no-impact'}]});}});
 await f.client.selectStyle('fighter');await f.settle();f.button('Position & VFX').click();await f.settle();f.field('Cast effect VFX asset').value=main;f.field('Cast effect VFX asset').onchange();await f.settle();f.field('On-hit VFX asset').value=hit;f.field('On-hit VFX asset').onchange();await f.settle();assert.deepEqual(f.field('Cast effect VFX animation').options.map(n=>n.value),['','main-loop']);assert.deepEqual(f.field('On-hit VFX animation').options.map(n=>n.value),['','hit-burst']);assert(requests.some(r=>r.castResource===main&&r.impactResource===hit));assert.equal(f.calls.preview.at(-1).description.effects[1].id,hit);
 f.field('On-hit VFX asset').value=next;f.field('On-hit VFX asset').onchange();await f.settle();assert.deepEqual(f.field('On-hit VFX animation').options.map(n=>n.value),['','hit-other']);assert.equal(requests.at(-1).impactResource,next);assert.equal(f.calls.preview.at(-1).description.effects[1].id,next);assert.equal(f.backend.calls.some(c=>c.name==='save'),false);f.close();
});


test('timeline pointer capture clamps seeking, excludes other pointers and cleans up without draft edits',async()=>{
 const f=await fixture(),timeline=f.field('Skill preview position');let held=null;timeline.getBoundingClientRect=()=>({left:100,width:216});timeline.setPointerCapture=id=>{held=id;};timeline.hasPointerCapture=id=>held===id;timeline.releasePointerCapture=()=>{held=null;};
 const before=f.calls.seeks.length;pointer(timeline,'pointerdown',208,{button:1});assert.equal(f.calls.seeks.length,before);assert.equal(held,null);
 pointer(timeline,'pointerdown',208);assert.equal(held,1);assert.equal(f.calls.seeks.at(-1),2);pointer(timeline,'pointermove',308,{pointerId:2});assert.equal(f.calls.seeks.at(-1),2);pointer(timeline,'pointerup',308,{pointerId:2});assert.equal(held,1);
 pointer(timeline,'pointermove',1000);assert.equal(f.calls.seeks.at(-1),4);pointer(timeline,'pointermove',-1000);assert.equal(f.calls.seeks.at(-1),0);const stable=f.calls.seeks.length;pointer(timeline,'pointermove',-1000);assert.equal(f.calls.seeks.length,stable,'Unchanged pointer values do not rerun the simulation');pointer(timeline,'pointercancel',-1000);assert.equal(held,null);
 pointer(timeline,'pointerdown',208);assert.equal(held,1);f.close();assert.equal(held,null);assert.equal(timeline.listeners.pointerdown,undefined);assert.equal(timeline.listeners.pointermove,undefined);assert.equal(timeline.listeners.pointerup,undefined);assert.equal(timeline.listeners.pointercancel,undefined);assert.equal(timeline.listeners.lostpointercapture,undefined);assert.equal(f.backend.calls.some(c=>c.name==='change'||c.name==='save'),false);
});


test('the editor has one active entry per hero and only the five VFX-bearing passives',async()=>{
 const f=await fixture();assert.equal(f.host.querySelectorAll('.style-card').length,6);assert.equal(f.host.querySelectorAll('.passive-card').length,5);assert(!f.host.querySelectorAll('.passive-card').some(node=>node.getAttribute('data-style')==='skirmisher'));
 await f.client.selectEntry('fighter','passive');await f.settle();assert.equal(f.calls.preview.at(-1).entry,'passive');assert(f.field('Max Stacks'));assert.equal(f.field('Cooldown'),null);assert.equal(f.field('Knockback'),null);assert.equal(f.button('Cast skill').hidden,true);
 await f.client.selectStyle('fighter');await f.settle();assert(f.field('Cooldown'));assert(f.field('Knockback'));assert.equal(f.field('Max Stacks'),null);assert.equal(f.button('Cast skill').hidden,false);assert(!f.backend.calls.some(call=>call.name==='change'||call.name==='save'));f.close();
});

test('each independent Guardian effect owns its controls while the protected-ally aura stays in its passive entry',async()=>{
 const Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),visual={};for(const [slot,id]of [['buff','guardian-runic-shield'],['defense','guardian-defense'],['physicalShield','guardian-physical-shield-start']])Settings.applyClip(visual,slot+'Resource',Catalog.clips.find(clip=>clip.id===id));
 const f=await fixture({data:{guardian:{visual}}});await f.client.selectStyle('guardian');await f.settle();f.button('Position & VFX').click();await f.settle();
 const fields=()=>f.host.querySelectorAll('input,select').map(node=>node.id);for(const prefix of ['defense','physicalShield','buff','taunt'])assert(fields().includes('skill-visual-'+prefix+'Scale'),prefix);assert(!fields().includes('skill-visual-presenceScale'));assert(!fields().includes('skill-visual-beamWidth'));
 await f.client.selectEntry('guardian','passive');await f.settle();assert(fields().includes('skill-visual-presenceScale'));assert(!fields().includes('skill-visual-defenseScale'));assert(!fields().includes('skill-visual-tauntScale'));assert(!f.backend.calls.some(call=>call.name==='change'||call.name==='save'));f.close();
});


test('compact numeric defaults expose full precision while editing and an unchanged focus or change does not round saved tuning',async()=>{
 const f=await fixture(),input=f.field('Windup'),exact=Settings.defaults('skirmisher').windup;assert.equal(input.value,Client.formatNumber(exact,{}));input.onfocus();assert.equal(input.value,String(exact));input.onblur();assert.equal(input.value,Client.formatNumber(exact,{}));input.onchange();await f.settle();assert.equal(f.backend.snapshot().dirty,false);assert.equal(f.client.session.effective('skirmisher').windup,exact);assert.equal(Client.formatNumber(1.333333333333,{}),'1.333');assert.equal(Client.formatNumber(.123456789,{step:.000001}),'0.123457');f.close();
});


test('native skill inspectors omit controls their fixed presentation cannot apply while custom Spine animation remains editable',async()=>{
 const custom='bbbb0000-0000-0000-0000-000000000051',f=await fixture({catalogs:{vfx:[{id:custom,name:'Custom burst',kind:'spine',animations:['cast-custom','loop-custom']}]}});
 await f.client.selectStyle('mystic');await f.settle();f.button('Position & VFX').click();await f.settle();
 const ids=()=>f.host.querySelectorAll('input,select').map(node=>node.id);
 for(const key of ['offsetX','offsetY','rotation','scale','animation','castResourceAnimation'])assert(!ids().includes('skill-visual-'+key),key+' must not pretend to change the native burst');assert(ids().includes('skill-visual-castScale'));assert(ids().includes('skill-visual-castDelay'));assert(!f.field('Handle').options.some(option=>option.value==='effect'));
 const asset=f.field('Cast effect VFX asset');asset.value=custom;asset.onchange();await f.settle();const animation=f.field('Cast effect VFX animation');assert(animation);assert(animation.options.some(option=>option.value==='cast-custom'));assert(animation.options.some(option=>option.value==='loop-custom'));animation.value='cast-custom';animation.onchange();await f.settle();assert.equal(f.client.session.effective('mystic').visual.castResourceAnimation,'cast-custom');
 await f.client.selectEntry('vanguard','passive');await f.settle();assert(!ids().includes('skill-visual-passiveMinScale'));assert(ids().includes('skill-visual-passiveMinPlayback'));assert(ids().includes('skill-visual-passiveScale'));
 await f.client.selectStyle('guardian');await f.settle();assert(!ids().includes('skill-visual-physicalShieldResourceAnimation'));assert(!ids().includes('skill-visual-defenseResourceAnimation'));assert(ids().includes('skill-visual-physicalShieldDelay'));assert(!f.backend.calls.some(call=>call.name==='save'));f.close();
});

test('Guardian active exposes taunt and shield feedback without ordinary hammer-hit controls or a circular-area rotation',async()=>{
 const custom='bbbb0000-0000-0000-0000-000000000052',f=await fixture({catalogs:{vfx:[{id:custom,name:'Custom shield burst',kind:'spine',animations:['shield-burst']}]}});
 await f.client.selectStyle('guardian');await f.settle();f.button('Position & VFX').click();await f.settle();
 const ids=()=>f.host.querySelectorAll('input,select').map(node=>node.id).filter(Boolean);
 assert(!ids().some(id=>id.startsWith('skill-visual-impact')));assert(!ids().includes('skill-visual-rotation'));assert(ids().includes('skill-visual-tauntScale'));assert(!ids().includes('skill-visual-defenseDelay'));assert(!ids().includes('skill-visual-buffScale'));assert(ids().includes('skill-visual-physicalShieldDelay'));assert(ids().includes('skill-visual-physicalShieldScale'));
 f.button('SFX').click();await f.settle();assert(f.field('Cast sound'));assert.equal(f.field('Impact sound'),null);assert.equal(f.field('Impact volume'),null);assert.equal(f.field('Impact delay'),null);assert(!f.backend.calls.some(call=>call.name==='change'||call.name==='save'));
 f.button('Position & VFX').click();await f.settle();const asset=f.field('VFX asset');asset.value=custom;asset.onchange();await f.settle();assert(ids().includes('skill-visual-rotation'),'Custom area artwork still consumes its rotation');assert(!ids().some(id=>id.startsWith('skill-visual-impact')));assert.equal(f.client.session.effective('guardian').visual.resource,custom);assert(!f.backend.calls.some(call=>call.name==='save'));f.close();
});

test('Bruiser circular-area rotation is exposed only when custom artwork consumes it',async()=>{
 const custom='bbbb0000-0000-0000-0000-000000000053',f=await fixture({catalogs:{vfx:[{id:custom,name:'Custom cleave artwork',kind:'spine',animations:['cleave']}]}});
 await f.client.selectStyle('bruiser');await f.settle();f.button('Position & VFX').click();await f.settle();
 const ids=()=>f.host.querySelectorAll('input,select').map(node=>node.id);assert(!ids().includes('skill-visual-rotation'));assert(ids().includes('skill-visual-castRotation'));assert(ids().includes('skill-visual-impactScale'));assert(!f.backend.calls.some(call=>call.name==='change'||call.name==='save'));
 await f.client.session.change('bruiser','visual.resource',custom);await f.settle();assert(ids().includes('skill-visual-rotation'));assert(ids().includes('skill-visual-castRotation'));assert(!f.backend.calls.some(call=>call.name==='save'));f.close();
});
