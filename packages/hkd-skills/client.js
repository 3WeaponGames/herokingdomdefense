'use strict';
const SkillSettings = require('../../assets/_script/HeroSkillSettings');

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const parts = path => Array.isArray(path) ? path : String(path).split('.');
function get(object, path) { return parts(path).reduce((value, key) => value && value[key], object); }
function put(object, path, value) {
  const keys = parts(path); let target = object;
  keys.slice(0, -1).forEach(key => { if (!target[key] || typeof target[key] !== 'object') target[key] = {}; target = target[key]; });
  target[keys[keys.length - 1]] = value;
}
function compatibleAnimations(description) {
  return [...new Set(SkillSettings.riderAnimations(description))].sort();
}

// All accepted edits live in the backend draft. In-flight and rejected edits
// remain visible locally; responses from a closed window are ignored.
function createSession(api, onChange) {
  let snapshot = null, closed = false, queue = Promise.resolve(), pending = [], failure = '', counter = 0;
  const rejected = new Map();
  const key = edit => edit.style + ':' + edit.path;
  const emit = () => { if (!closed && onChange) onChange(state()); };
  function state() { return { snapshot, pending: pending.length, error: failure, rejected: rejected.size, closed }; }
  function effective(style) {
    const value = clone(snapshot && snapshot.effective && snapshot.effective[style] || {});
    [...rejected.values(), ...pending].filter(edit => edit.style === style).forEach(edit => {
      const replacement = edit.reset && api.settings ? get(api.settings.defaults(style), edit.path) : edit.value;
      if (replacement !== undefined) put(value, edit.path, clone(replacement));
    });
    return value;
  }
  function edit(style, path, value, reset) {
    const item = { id: ++counter, style, path: parts(path).join('.'), value: clone(value), reset: !!reset };
    rejected.delete(key(item)); pending.push(item); failure = ''; emit();
    const work = queue.then(async () => {
      if (closed || !snapshot) return null;
      const response = await api.ipc(item.reset ? 'reset' : 'change', {
        version: snapshot.version, revision: snapshot.revision, style: item.style, path: item.path,
        ...(item.reset ? {} : { value: item.value })
      });
      if (!closed) { snapshot = response; rejected.delete(key(item)); if (!rejected.size) failure = ''; }
      return response;
    }).catch(error => {
      if (!closed) { failure = error.message || String(error); rejected.set(key(item), item); }
      return null;
    }).finally(() => { pending = pending.filter(value => value !== item); emit(); });
    queue = work; return work;
  }
  function action(name) {
    const work = queue.then(async () => {
      if (closed) return null;
      if (name === 'save' && rejected.size) throw Error(failure || 'Correct the rejected fields or reload the latest draft before saving.');
      if (name === 'save' && (!snapshot || !snapshot.dirty)) return snapshot;
      const response = await api.ipc(name, name === 'load' ? {} : { version: snapshot.version, revision: snapshot.revision });
      if (!closed) { snapshot = response; rejected.clear(); failure = ''; emit(); }
      return response;
    }).catch(error => { if (!closed) { failure = error.message || String(error); emit(); } return null; });
    queue = work; return work;
  }
  return { state, effective, change: (style, path, value) => edit(style, path, value, false), reset: (style, path) => edit(style, path, undefined, true),
    action, load: () => action('load'), flush: () => queue, destroy() { closed = true; pending = []; rejected.clear(); } };
}

function createAudioPlayer(api, report) {
  const active = new Set(), delays = new Set(), channelDelays = new Set(); let channel = null, closed = false;
  function stopOne(media) { if (!media) return; active.delete(media); if (channel === media) channel = null; media.onended = media.onerror = null; media.pause(); media.removeAttribute('src'); media.load(); }
  function stopChannel() { channelDelays.forEach(timer => { clearTimeout(timer); delays.delete(timer); }); channelDelays.clear(); stopOne(channel); }
  function stop() { delays.forEach(timer => clearTimeout(timer)); delays.clear(); channelDelays.clear(); active.forEach(stopOne); channel = null; }
  function cue(kind, value) {
    if (kind === 'stop') { stop(); return; }
    if (kind === 'stopChannel') { stopChannel(); return; }
    if (closed || !value || !value.clip) return;
    if (kind === 'channel') stopChannel();
    const start = () => {
      if (closed) return;
      if (kind === 'channel') stopOne(channel);
      // Match the in-game presentation budget instead of accumulating an
      // Audio element for every impact in a long or rapid-thrust preview.
      const limit = kind === 'impact' ? 3 : 1, voices = [...active].filter(media => media._skillCue === kind);
      while (voices.length >= limit) stopOne(voices.shift());
      const media = api.createAudio ? api.createAudio() : document.createElement('audio');
      media._skillCue = kind;
      media.preload = 'none'; media.volume = Math.max(0, Math.min(1, Number(value.volume === undefined ? 1 : value.volume)));
      media.playbackRate = Math.max(.25, Math.min(4, Number(value.pitch || 1))); media.loop = kind === 'channel';
      media.src = api.audioURL ? api.audioURL(value.clip) : value.clip;
      active.add(media); if (kind === 'channel') channel = media;
      media.onended = () => stopOne(media); media.onerror = () => { if (!active.has(media)) return; stopOne(media); if (report) report('This sound could not be played.', true); };
      let result; try { result = media.play(); } catch (error) { result = Promise.reject(error); }
      Promise.resolve(result).catch(error => { if (!active.has(media)) return; stopOne(media); if (report) report(error.message || 'Press Test sound to allow playback.', true); });
    };
    const delay = Math.max(0, Number(value.delay) || 0);
    if (delay) { if(delays.size>=512)return;const timer = setTimeout(() => { delays.delete(timer); channelDelays.delete(timer); start(); }, delay * 1000); delays.add(timer); if (kind === 'channel') channelDelays.add(timer); } else start();
  }
  return { cue, stop, destroy() { stop(); closed = true; } };
}

function mount(host, api) {
  const document = host.ownerDocument || global.document, window = document.defaultView || global.window;
  let disposed = false, selected = 'skirmisher', tab = 'tuning', description = null, previewRequest = 0, snapshot = null;
  let preview = null, loading = false, actionBusy = false, controlRefs = new Map(), descriptionStyle = '', sessionError = '', handleStyle = '';
  let localChanges = new Map(), debounce = null, lastSignature = '', soundEnabled = false, playback = { playing: true, time: 0, duration: 4 };
  const invalidInputs = new Map();
  const descriptionLoads = new Map();
  const scenario = { hp: 100, targetDistance: 100, attackRate: 1.5, moving: false, direction: 0, speed: 1, repeat: true, mode: 'active' };
  function el(tag, text, parent, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; if (parent) parent.appendChild(node); return node; }
  const root = el('section', undefined, host, 'skills-editor'); root.tabIndex = -1; root.setAttribute('aria-label', 'Hero Skills editor');
  const header = el('header', undefined, root), heading = el('div', undefined, header);
  el('h1', 'Skills', heading); el('p', 'Fit the effect. Test the skill. Save to apply.', heading, 'muted');
  const toolbar = el('div', undefined, header, 'toolbar');
  function button(parent, text, action, cls) {
    const b = el('button', text, parent, cls); b.type = 'button';
    b.onclick = () => { if (b.disabled || disposed) return; Promise.resolve().then(action).catch(error => message(error.message, true)); }; return b;
  }
  const undo = button(toolbar, 'Undo', () => perform('undo')), redo = button(toolbar, 'Redo', () => perform('redo'));
  const discard = button(toolbar, 'Discard changes', () => perform('discard')), save = button(toolbar, 'Save skills', () => perform('save'), 'primary');
  const reload = button(toolbar, 'Reload latest draft', () => perform('load'));
  save.title = 'Save skills (Ctrl+S)'; save.setAttribute('aria-keyshortcuts', 'Control+s');
  undo.title = 'Undo (Ctrl+Z)'; redo.title = 'Redo (Ctrl+Shift+Z)';
  reload.title = 'Fetch the latest shared draft. Replaces this window’s pending fields; does not save or discard another window’s work.';
  const workspace = el('div', undefined, root, 'workspace'), list = el('nav', undefined, workspace, 'skill-list');
  list.setAttribute('aria-label', 'Hero fighting styles'); el('h2', 'HERO SKILLS', list);
  const stylesHost = el('div', undefined, list), listNote = el('p', 'Every style includes its passive and active skill. Upgrades remain in Equipment.', list, 'help');
  const main = el('main', undefined, workspace), titleRow = el('div', undefined, main, 'preview-heading'), previewTitle = el('strong', 'Skill preview', titleRow);
  const muteBadge = el('span', 'SILENT · PREVIEW ONLY', titleRow, 'badge');
  const previewHost = el('div', undefined, main, 'preview-host'); previewHost.tabIndex = 0; previewHost.setAttribute('aria-label', 'Real-time skill preview');
  const transport = el('div', undefined, main, 'preview-controls'), row = el('div', undefined, transport, 'row wrap');
  const play = button(row, 'Pause', () => { playback.playing = !playback.playing; if (preview) preview.play(playback.playing); if (!playback.playing) audio.stop(); updatePlayback(); });
  button(row, '◀ Frame', () => { stopAudio(); if (preview) preview.step(-1 / 60); });
  button(row, 'Frame ▶', () => { stopAudio(); if (preview) preview.step(1 / 60); });
  const cast = button(row, 'Cast skill', () => { scenario.mode='active';mode.value='active';if(preview)preview.cast();return updatePreview(); }, 'primary');
  button(row, 'Fit preview', () => { if (preview) preview.fit(); });
  const mode = makeSelect(row, 'Preview', [['active', 'Active skill'], ['basic', 'Basic attack + passive']], 'active', value => { scenario.mode = value; stopAudio(); if (preview) preview.setScenario({ mode: value }); updatePreview(); });
  const speed = makeSelect(row, 'Speed', [['.25', '0.25×'], ['.5', '0.5×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']], '1', value => setScenario('speed', Number(value)));
  const handle = makeSelect(row, 'Handle', [['origin', 'Skill origin'], ['effect', 'Effect position']], 'origin', value => { if (preview && preview.selectHandle) preview.selectHandle(value); });
  const clock = el('span', '0.000 s', row, 'clock');
  const timeline = el('input', undefined, transport, 'timeline'); timeline.type = 'range'; timeline.min = 0; timeline.max = 4; timeline.step = .001; timeline.value = 0; timeline.setAttribute('aria-label', 'Skill preview position');
  timeline.oninput = () => { stopAudio(); playback.playing = false; if (preview) { preview.play(false); preview.seek(Number(timeline.value)); } updatePlayback(); };
  const scenarios = el('div', undefined, transport, 'scenario-grid');
  numberScenario(scenarios, 'Hero HP %', 'hp', 0, 100, 1);
  numberScenario(scenarios, 'Target distance', 'targetDistance', 0, 2000, 5);
  numberScenario(scenarios, 'Attacks / second', 'attackRate', .1, 10, .05);
  numberScenario(scenarios, 'Aim angle', 'direction', -180, 180, 1);
  check(scenarios, 'Horse moving', scenario.moving, value => setScenario('moving', value));
  check(scenarios, 'Repeat', scenario.repeat, value => setScenario('repeat', value));
  check(scenarios, 'Sound in preview', false, value => { soundEnabled = value; muteBadge.textContent = value ? 'AUDIO ENABLED · PREVIEW ONLY' : 'SILENT · PREVIEW ONLY'; if (preview && preview.setAudioEnabled) preview.setAudioEnabled(value); if (!value) audio.stop(); });
  const facts = el('div', 'Loading preview…', main, 'preview-facts'); facts.setAttribute('aria-live', 'polite');
  el('p', 'Active examples start with 75% Steady Aim or Momentum, and three Mystic charges. Basic attack + passive starts uncharged.', main, 'help');
  el('p', 'Drag an effect handle to fit its position. Middle drag pans; Ctrl+wheel zooms. Changes remain in a draft until Save.', main, 'help');
  const inspector = el('aside', undefined, workspace, 'inspector'), tabList = el('div', undefined, inspector, 'tabs'); tabList.setAttribute('role', 'tablist');
  const tabs = {};
  [['tuning', 'Skill settings'], ['visual', 'Position & VFX'], ['audio', 'SFX']].forEach(([id, label]) => { tabs[id] = button(tabList, label, () => { flushFields(); tab = id; renderInspector(); }); tabs[id].setAttribute('role', 'tab'); });
  const fieldsHost = el('div', undefined, inspector, 'fields');
  const footer = el('footer', undefined, root), status = el('span', 'Loading skills…', footer), dirtyState = el('span', '', footer);
  const audio = createAudioPlayer(Object.assign({}, api, { audioURL: clip => {
    const item = snapshot && snapshot.catalogs && snapshot.catalogs.audio && snapshot.catalogs.audio.find(item => catalogValue(item) === clip);
    return api.audioURL ? api.audioURL(item || clip) : item && item.file || clip;
  } }), message);
  const session = createSession(api, state => {
    if (disposed) return;
    snapshot = state.snapshot;
    if (snapshot && !snapshot.styles.some(style => style.id === selected)) selected = snapshot.styles[0].id;
    if (state.error) { sessionError = state.error; message(state.error + ' Your local fields are still open.', true); }
    else if (sessionError) { sessionError = ''; message('Draft updated. Changes remain unsaved until Save.'); }
    updateButtons(state); renderStyles();
    const signature = snapshot && [selected, tab, JSON.stringify(snapshot.fields && snapshot.fields[selected]), JSON.stringify(snapshot.catalogs), tab === 'visual' && get(snapshot.effective[selected], 'visual.resource')].join('|');
    if (signature !== lastSignature) { lastSignature = signature; renderInspector(); }
    else updateFields();
    updatePreview();
  });
  function message(value, error) { if (disposed) return; status.textContent = value || ''; status.classList.toggle('error', !!error); }
  function updatePlayback() { play.textContent = playback.playing ? 'Pause' : 'Play'; clock.textContent = Number(playback.time || 0).toFixed(3) + ' s'; timeline.max = Math.max(.001, playback.duration || 4); timeline.value = playback.time || 0; }
  function stopAudio() { audio.stop(); }
  function setScenario(key, value) { scenario[key] = value; if (preview) preview.setScenario({ [key]: value }); }
  function makeSelect(parent, label, choices, value, change) {
    const wrap = el('label', undefined, parent, 'compact-field'); el('span', label, wrap); const node = el('select', undefined, wrap); node.setAttribute('aria-label', label);
    choices.forEach(([id, text]) => { const option = el('option', text, node); option.value = id; }); node.value = value; node.onchange = () => change(node.value); return node;
  }
  function check(parent, label, value, change) { const wrap = el('label', undefined, parent, 'check-field'), input = el('input', undefined, wrap); input.type = 'checkbox'; input.checked = value; el('span', label, wrap); input.onchange = () => change(input.checked); return input; }
  function numberScenario(parent, label, key, min, max, step) { const wrap = el('label', undefined, parent, 'compact-field'); el('span', label, wrap); const input = el('input', undefined, wrap); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = scenario[key]; input.setAttribute('aria-label', label); input.oninput = () => { const n = Number(input.value); if (String(input.value).trim() !== '' && Number.isFinite(n)) setScenario(key, Math.max(min, Math.min(max, n))); }; return input; }
  function effective() { const result = session.effective(selected); localChanges.forEach(change => { if (change.style === selected) put(result, change.path, clone(change.value)); }); return result; }
  function queueField(path, value) {
    const change = { style: selected, path: parts(path).join('.'), value }; localChanges.set(change.style + ':' + change.path, change);
    updateButtons(session.state()); updatePreview(); clearTimeout(debounce); debounce = setTimeout(flushFields, 160);
  }
  function flushFields() { clearTimeout(debounce); debounce = null; const changes = [...localChanges.values()]; localChanges.clear(); changes.forEach(change => session.change(change.style, change.path, change.value)); return session.flush(); }
  async function perform(action) {
    if (actionBusy || disposed) return;
    if (action === 'save' && invalidInputs.size) { message('Correct the highlighted fields before saving.', true); return; }
    actionBusy = true; stopAudio();
    if (action !== 'save') invalidInputs.clear();
    if (action === 'load') { localChanges.clear(); clearTimeout(debounce); } else flushFields();
    if (action === 'load' || action === 'discard') { descriptionStyle = ''; previewRequest++; descriptionLoads.clear(); }
    updateButtons(session.state());
    try {
      const result = await session.action(action); if (!result || disposed) return;
      const didSave = result.result && result.result.saved;
      message(action === 'save' ? didSave ? 'Skills saved. New game sessions use these settings.' : 'No changes to save.' : action === 'load' ? 'Latest shared draft loaded. Nothing was saved.' : action === 'discard' ? 'Unsaved skill changes discarded.' : action === 'undo' ? 'Edit undone. Save to apply.' : 'Edit restored. Save to apply.');
      if (result.result && result.result.warning) message(result.result.warning, true);
    } finally { actionBusy = false; updateButtons(session.state()); }
  }
  function updateButtons(state) {
    const dirty = !!(snapshot && snapshot.dirty || localChanges.size || state.pending || state.rejected || invalidInputs.size);
    save.disabled = actionBusy || !dirty || !!state.rejected || !!invalidInputs.size; discard.disabled = actionBusy || !dirty;
    undo.disabled = actionBusy || !snapshot || !snapshot.canUndo && !state.pending && !localChanges.size;
    redo.disabled = actionBusy || !snapshot || !snapshot.canRedo || !!state.pending || !!localChanges.size;
    reload.disabled = actionBusy; cast.disabled = !snapshot || loading;
    dirtyState.textContent = state.pending ? 'Updating draft…' : dirty ? '● Unsaved draft' : 'All changes saved';
  }
  function renderStyles() {
    if (!snapshot) return;
    if (handleStyle !== selected) {
      const previous = handle.value, choices = [['effect', 'Effect position']];
      if (selected === 'mystic') choices.unshift(['target', 'Target endpoint']);
      if (selected === 'mystic' || selected === 'skirmisher') choices.unshift(['origin', 'Skill origin']);
      handle.textContent = ''; choices.forEach(([value, label]) => { const option = el('option', label, handle); option.value = value; });
      handle.value = choices.some(([value]) => value === previous) ? previous : choices[0][0]; handleStyle = selected;
      if (preview && preview.selectHandle) preview.selectHandle(handle.value);
    }
    stylesHost.textContent = '';
    snapshot.styles.forEach(style => {
      const b = button(stylesHost, '', async () => {
        if (style.id === selected) return; flushFields(); stopAudio(); selected = style.id; descriptionStyle = ''; previewRequest++; lastSignature = ''; renderStyles(); renderInspector(); await updatePreview();
      }, selected === style.id ? 'style-card selected' : 'style-card');
      b.setAttribute('aria-pressed', String(style.id === selected)); el('strong', style.name, b); el('span', style.weapon || '', b); el('small', 'Passive + active', b);
    });
  }
  function descriptors() { return snapshot && snapshot.fields && snapshot.fields[selected] && snapshot.fields[selected][tab] || []; }
  function fieldPath(field) { const key = field.path || field.key; return key.includes('.') || tab === 'tuning' ? key : tab + '.' + key; }
  function fieldValue(path) { return get(effective(), path); }
  function catalogValue(item) { return item.id || item.uuid || item.resource || item.file || item.value; }
  function renderInspector() {
    fieldsHost.textContent = ''; controlRefs.clear();
    Object.keys(tabs).forEach(id => { tabs[id].classList.toggle('active', id === tab); tabs[id].setAttribute('aria-selected', String(id === tab)); });
    if (!snapshot) return;
    el('h2', tab === 'tuning' ? 'SKILL SETTINGS' : tab === 'visual' ? 'POSITION & VFX' : 'SOUND EFFECTS', fieldsHost);
    if (tab === 'audio') el('p', 'Audio stays silent until you enable Sound in preview or press a Test button.', fieldsHost, 'help');
    const all = descriptors();
    all.forEach(field => {
      const path = fieldPath(field), value = fieldValue(path), type = field.type || (typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text');
      const wrap = el('div', undefined, fieldsHost, 'setting-field'), heading = el('div', undefined, wrap, 'field-title');
      const label = el('label', field.label || path, heading), reset = button(heading, 'Reset', async () => { const key=selected+':'+path;invalidInputs.delete(key);localChanges.delete(key);flushFields();await session.reset(selected,path); }, 'reset'); reset.title = 'Remove this override and use the built-in default';
      let input;
      const isAudio = /\.clip$/.test(path), isResource = /resource$/.test(path) || type === 'resource' || type === 'vfx';
      if (isAudio || isResource) {
        const search = el('input', undefined, wrap, 'asset-search'); search.type = 'search'; search.placeholder = isAudio ? 'Filter sounds…' : 'Filter effects…'; search.setAttribute('aria-label', (field.label || path) + ' filter');
        input = el('select', undefined, wrap); const catalog = snapshot.catalogs && snapshot.catalogs[isAudio ? 'audio' : 'vfx'] || [];
        const fill = () => { const current = input.value || String(fieldValue(path) || ''), query = search.value.toLowerCase(); input.textContent = ''; const none = el('option', isAudio ? 'No sound' : 'Built-in effect', input); none.value = ''; catalog.filter(item => !query || (item.name + ' ' + catalogValue(item)).toLowerCase().includes(query) || catalogValue(item) === current).slice(0, 500).forEach(item => { const option = el('option', item.name || catalogValue(item), input); option.value = catalogValue(item); }); if (current && !Array.from(input.options).some(option => option.value === current)) { const option = el('option', current + ' · current', input); option.value = current; } input.value = current; };
        fill(); search.oninput = fill;
        if (isAudio) button(wrap, 'Test sound', () => { audio.stop(); audio.cue('test', get(effective(), path.split('.').slice(0, -1))); });
      } else if (type === 'select' || type === 'animation' || type === 'effect-animation' || field.options) {
        input = el('select', undefined, wrap); let choices = field.options || [];
        if (type === 'animation' || /animation$/.test(path)) choices = [['', 'Automatic'], ...animations().map(name => [name, name])];
        if (type === 'effect-animation') { const resource = fieldValue('visual.resource'), item = (snapshot.catalogs && snapshot.catalogs.vfx || []).find(item => catalogValue(item) === resource); choices = [['', 'Default animation'], ...(item && item.animations || []).map(name => [name, name])]; }
        choices.forEach(choice => { const id = Array.isArray(choice) ? choice[0] : typeof choice === 'object' ? choice.value : choice, title = Array.isArray(choice) ? choice[1] : typeof choice === 'object' ? choice.label : choice; const option = el('option', title, input); option.value = id; });
        if(value&&!Array.from(input.options).some(option=>option.value===String(value))){const option=el('option',value+' · unavailable; choose another or Reset',input);option.value=value;}
      } else { input = el('input', undefined, wrap); input.type = type === 'boolean' ? 'checkbox' : type === 'number' ? 'number' : 'text'; }
      input.id = 'skill-' + path.replace(/[^a-z0-9]+/gi, '-'); label.htmlFor = input.id; input.setAttribute('aria-label', field.label || path);
      if (field.min !== undefined) input.min = field.min; if (field.max !== undefined) input.max = field.max; if (field.step !== undefined) input.step = field.step; else if (input.type === 'number') input.step = 'any';
      const commit = () => { const n = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value, key = selected + ':' + path; if (input.type === 'number' && (input.value.trim() === '' || !Number.isFinite(n) || field.min !== undefined && n < field.min || field.max !== undefined && n > field.max) || type === 'color' && n !== '' && !/^#[0-9a-f]{6}$/i.test(n)) { invalidInputs.set(key, input.value); input.classList.add('invalid'); updateButtons(session.state()); return; } invalidInputs.delete(key); input.classList.remove('invalid'); queueField(path, n); };
      input.oninput = commit; input.onchange = () => { commit(); flushFields(); };
      if (type === 'color') { input.placeholder = 'Style default or #RRGGBB'; const swatch = el('input', undefined, wrap); swatch.type = 'color'; swatch.setAttribute('aria-label', (field.label || path) + ' picker'); input._colorPicker = swatch; input._defaultColor = {mystic:'#d69fff',skirmisher:'#fdf1a4',fighter:'#fff5b0',vanguard:'#fff5b0',bruiser:'#ff5b65',guardian:'#70c8ff'}[selected]; swatch.value = value || input._defaultColor; swatch.oninput = () => { input.value = swatch.value; commit(); }; swatch.onchange = flushFields; }
      if (field.help || field.description || field.unit) el('p', field.help || field.description || 'Unit: ' + field.unit, wrap, 'help');
      controlRefs.set(path, input);
    });
    updateFields();
  }
  function animations() { return compatibleAnimations(description); }
  function updateFields() { if (!snapshot) return; controlRefs.forEach((input, path) => { if (document.activeElement === input) return; const key = selected + ':' + path, value = invalidInputs.has(key) ? invalidInputs.get(key) : fieldValue(path); input.classList.toggle('invalid', invalidInputs.has(key)); if (input.type === 'checkbox') input.checked = !!value; else input.value = value === undefined || value === null ? '' : value; if (input._colorPicker && !invalidInputs.has(key)) input._colorPicker.value = value || input._defaultColor; }); }
  async function updatePreview() {
    if (!snapshot || disposed) return;
    const style = snapshot.styles.find(style => style.id === selected); previewTitle.textContent = (style && style.name || selected) + ' · ' + (scenario.mode === 'basic' ? 'Basic attack + passive' : 'Active skill');
    if (!preview) {
      preview = api.createPreview(previewHost, { runtime: api.runtime, renderer: api.renderer, core: api.core,
        onChange(path, value) { queueField(path, value); updateFields(); },
        onStatus(value) { if (disposed) return; Object.assign(playback, value); updatePlayback(); facts.textContent = value.error || ['Charge ' + Math.round((value.charge || 0) * 100) + '%', 'Cooldown ' + Number(value.cooldown || 0).toFixed(1) + ' s', 'Hits ' + (value.hits || 0)].join(' · '); },
        onSound(kind, value) { if (kind === 'stop' || kind === 'stopChannel' || soundEnabled) audio.cue(kind, Object.assign({}, value, {delay:(Number(value.delay)||0)/Math.max(.01,scenario.speed)})); }
      }); preview.setScenario(scenario); if (preview.setAudioEnabled) preview.setAudioEnabled(soundEnabled); if (preview.selectHandle) preview.selectHandle(handle.value);
    }
    const resource = get(effective(), 'visual.resource') || '', key = selected + ':' + resource;
    if (descriptionStyle !== key) {
      const request = ++previewRequest, id = selected; loading = true; updateButtons(session.state());
      if (!descriptionLoads.has(key)) { const task = Promise.resolve(api.ipc('describe', { style: id, resource })); descriptionLoads.set(key, task); task.finally(() => { if (descriptionLoads.get(key) === task) descriptionLoads.delete(key); }).catch(() => {}); }
      try { const value = await descriptionLoads.get(key); if (disposed || request !== previewRequest || selected !== id) return; description = value; descriptionStyle = key; renderInspector(); }
      catch (error) { if (!disposed && request === previewRequest) message(error.message, true); return; }
      finally { if (!disposed && request === previewRequest) { loading = false; updateButtons(session.state()); } }
    }
    if (descriptionStyle === key) {
      try { await preview.set({ style: selected, settings: effective(), description }); }
      catch (error) { if (!disposed) message(error.message, true); }
    }
  }
  function keydown(event) {
    const command = event.ctrlKey || event.metaKey, key = String(event.key).toLowerCase();
    if (command && key === 's') { event.preventDefault(); event.stopPropagation(); perform('save'); return; }
    const editing = event.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable);
    if (command && !editing && (key === 'z' || key === 'y')) { event.preventDefault(); event.stopPropagation(); perform(key === 'y' || event.shiftKey ? 'redo' : 'undo'); }
    if (!editing && !command && event.code === 'Space' && previewHost.contains(event.target)) { event.preventDefault(); play.click(); }
  }
  root.addEventListener('keydown', keydown);
  session.load().then(value => { if (value && !disposed) message('Ready. Preview changes do not modify gameplay until Save.'); });
  return { session, selectStyle(id) { if (snapshot && snapshot.styles.some(style => style.id === id)) { flushFields(); selected = id; descriptionStyle = ''; renderStyles(); renderInspector(); return updatePreview(); } return Promise.resolve(false); },
    flush: flushFields, save: () => perform('save'),
    destroy() { if (disposed) return; disposed = true; clearTimeout(debounce); localChanges.clear(); previewRequest++; session.destroy(); audio.destroy(); if (preview) preview.destroy(); root.removeEventListener('keydown', keydown); root.remove(); } };
}

module.exports = { mount, createSession, createAudioPlayer, compatibleAnimations, get, put };
