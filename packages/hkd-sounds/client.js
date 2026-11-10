'use strict';
const Model = require('./model'), { Player } = require('./player');
const LABELS = { once: 'Once', loop: 'Loop', next: 'Autoplay next' };
const title = value => value ? value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—';
const seconds = value => value === null ? '—' : value < 10 ? value.toFixed(2) + ' s' : Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
const clock = value => Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
function mount(host, api) {
  const document = host.ownerDocument, window = document.defaultView;
  let snapshot = null, shown = null, closed = false, pending = Promise.resolve(), pendingCount = 0, lastDetail = '', lastError = '';
  const filters = { search: '', origin: 'all', category: 'all', mark: 'all', kind: 'all', biome: 'all', sort: 'name-asc', grouped: true }, rowRefs = new Map();
  function el(tag, cls, text, parent) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; if (parent) parent.appendChild(node); return node; }
  function button(parent, text, action, cls) { const node = el('button', cls, text, parent); node.type = 'button'; node.onclick = action; return node; }
  function dot(parent, color, label) { const node = el('span', 'sound-dot ' + color, undefined, parent); node.setAttribute('role', 'img'); node.setAttribute('aria-label', label || title(color) + ' review mark'); node.title = label || title(color); return node; }
  function select(parent, label, options, value, change) {
    const wrap = el('label', 'sound-field', undefined, parent); el('span', '', label, wrap); const node = el('select', '', undefined, wrap);
    node.setAttribute('aria-label', label);
    options.forEach(pair => { const option = el('option', '', pair[1], node); option.value = pair[0]; });
    node.value = value; node.onchange = () => change(node.value); return node;
  }
  const root = el('div', 'sound-tool', undefined, host); root.tabIndex = 0; root.setAttribute('aria-label', 'Sound Editor');
  const header = el('header', 'sound-header', undefined, root), heading = el('div', '', undefined, header);
  el('h1', '', 'Sound Editor', heading); const summary = el('p', 'sound-muted', 'Loading the library…', heading);
  const headerActions = el('div', 'sound-header-actions', undefined, header);
  const save = button(headerActions, 'Save Checklist', () => run('save'), 'sound-primary');
  const discard = button(headerActions, 'Discard changes', () => { if (!api.confirm || api.confirm('Discard unsaved sound checklist marks?')) run('discard'); });
  button(headerActions, 'Refresh library', () => run('load'));
  const notice = el('div', 'sound-notice', 'Opening the library does not start playback.', root); notice.setAttribute('role', 'status');
  const workspace = el('main', 'sound-workspace', undefined, root), sidebar = el('nav', 'sound-sidebar', undefined, workspace);
  sidebar.setAttribute('aria-label', 'Sound categories and checklist');
  const reviews = el('div', 'sound-review-nav', undefined, sidebar), categories = el('div', 'sound-category-nav', undefined, sidebar);
  const content = el('section', 'sound-content', undefined, workspace), toolbar = el('div', 'sound-toolbar', undefined, content);
  const searchWrap = el('label', 'sound-search', undefined, toolbar); el('span', 'sound-muted', 'Search sounds', searchWrap);
  const search = el('input', '', undefined, searchWrap); search.type = 'search'; search.placeholder = 'Name, unit, tier, biome, file…'; search.setAttribute('aria-label', 'Search sounds');
  const origin = select(toolbar, 'Source', [['all', 'All sounds'], ['original', 'Original sounds'], ['new', 'New sounds']], filters.origin, value => filter('origin', value));
  const kind = select(toolbar, 'Type', [['all', 'All types'], ['effect', 'Sound effects'], ['voice', 'Unit voices'], ['ambience', 'Ambience'], ['music', 'Music']], filters.kind, value => filter('kind', value));
  const sort = select(toolbar, 'Sort', [['name-asc', 'Name · A–Z'], ['name-desc', 'Name · Z–A'], ['duration-asc', 'Duration · shortest'], ['duration-desc', 'Duration · longest'], ['origin', 'Original → New'], ['mark', 'Dot · green → red'], ['mark-reverse', 'Dot · red → green']], filters.sort, value => filter('sort', value));
  const subbar = el('div', 'sound-subbar', undefined, content), biomeHost = el('div', '', undefined, subbar);
  let biome;
  const groupLabel = el('label', 'sound-group-label', undefined, subbar), group = el('input', '', undefined, groupLabel); group.type = 'checkbox'; group.checked = true;
  el('span', '', 'Group by category', groupLabel); group.onchange = () => filter('grouped', group.checked);
  button(subbar, 'Clear filters', reset); const visibleCount = el('span', 'sound-visible-count sound-muted', '', subbar);
  const listing = el('div', 'sound-list', undefined, content), table = el('table', '', undefined, listing), thead = el('thead', '', undefined, table), headRow = el('tr', '', undefined, thead);
  ['', 'Sound', 'Source', 'Length', 'Type'].forEach(text => el('th', '', text, headRow));
  const tbody = el('tbody', '', undefined, table), empty = el('p', 'sound-empty', 'Loading sounds…', listing);
  const detail = el('aside', 'sound-detail', undefined, workspace); detail.setAttribute('aria-label', 'Selected sound details');
  const footer = el('footer', 'sound-player', undefined, root), now = el('div', 'sound-now', undefined, footer);
  const nowName = el('strong', '', 'Select a sound', now), nowStatus = el('span', 'sound-muted', 'Nothing is playing', now);
  const transport = el('div', 'sound-transport', undefined, footer);
  const previous = button(transport, 'Previous (Shift+Q)', () => navigate(-1));
  const play = button(transport, 'Play (Space)', () => player.toggle(), 'sound-primary');
  button(transport, 'Stop', () => player.stop());
  const next = button(transport, 'Next (Shift+E)', () => navigate(1));
  const mode = button(transport, 'Mode: Once (Shift+W)', () => player.cycleMode()); mode.title = 'Cycle Once → Loop → Autoplay next';
  const timeline = el('div', 'sound-timeline', undefined, footer), elapsed = el('span', 'sound-time', '0:00 / 0:00', timeline);
  const seek = el('input', 'sound-seek', undefined, timeline); seek.type = 'range'; seek.min = 0; seek.max = 1; seek.step = .01; seek.value = 0; seek.setAttribute('aria-label', 'Seek sound');
  seek.oninput = () => player.seek(Number(seek.value));
  const volumeLabel = el('label', 'sound-volume', undefined, timeline); el('span', '', 'Preview volume', volumeLabel);
  const volume = el('input', '', undefined, volumeLabel); volume.type = 'range'; volume.min = 0; volume.max = 100; volume.value = 65; volume.setAttribute('aria-label', 'Preview volume');
  const volumeValue = el('span', '', '65%', volumeLabel); volume.oninput = () => player.setVolume(Number(volume.value) / 100);
  const reviewBar = el('div', 'sound-review-controls', undefined, footer); el('span', 'sound-muted', 'Mark selected sound', reviewBar);
  const markButtons = {};
  [['green', 'A'], ['yellow', 'S'], ['red', 'D']].forEach(pair => {
    const node = button(reviewBar, '', () => mark(pair[0]), 'sound-mark-button'); dot(node, pair[0]); el('span', '', title(pair[0]) + ' (Shift+' + pair[1] + ')', node); markButtons[pair[0]] = node;
  });
  const clearMark = button(reviewBar, 'Clear dot', () => mark(null));
  const playerError = el('span', 'sound-error', '', reviewBar); playerError.setAttribute('role', 'alert');
  const player = new Player({ createAudio: api.createAudio || (() => document.createElement('audio')), url: api.url, onChange: renderPlayer });
  function status() {
    save.disabled = !snapshot || !snapshot.dirty || pendingCount > 0; discard.disabled = save.disabled;
    notice.className = 'sound-notice' + (lastError ? ' sound-error' : snapshot && snapshot.dirty ? ' sound-unsaved' : '');
    notice.textContent = lastError || (pendingCount ? 'Updating checklist…' : snapshot && snapshot.dirty ? 'Unsaved checklist changes · Save Checklist to keep your dots for later.' : snapshot && snapshot.result && snapshot.result.saved ? 'Checklist saved.' : 'Choose a sound and press Play. Checklist marks are saved separately.');
  }
  function run(name, request) {
    pendingCount++; lastError = ''; status();
    pending = pending.then(() => {
      if (closed) return null;
      const value = typeof request === 'function' ? request() : request || {};
      if (name !== 'load' && name !== 'reveal') value.version = snapshot.version;
      return api.ipc(name, value);
    }).then(value => {
      if (closed || !value) return;
      if (value.items) { snapshot = value; render(); }
    }).catch(error => { if (!closed) { lastError = error.message; } }).then(() => { pendingCount--; if (!closed) status(); });
    return pending;
  }
  function mark(color) { if (player.item()) return run('mark', () => ({ id: player.id, color })); }
  function navigate(delta) { player.step(delta); const row = rowRefs.get(player.id); if (row) row.row.scrollIntoView({ block: 'nearest' }); }
  function filter(key, value) { filters[key] = value; if (key === 'sort' && value.startsWith('mark')) { filters.grouped = false; group.checked = false; } applyFilters(); }
  function reset() {
    Object.assign(filters, { search: '', origin: 'all', category: 'all', mark: 'all', kind: 'all', biome: 'all', sort: 'name-asc', grouped: true });
    search.value = ''; origin.value = kind.value = biome.value = 'all'; sort.value = 'name-asc'; group.checked = true; applyFilters(); root.focus();
  }
  search.oninput = () => filter('search', search.value);
  function navigation(parent, label, key, value, count, color) {
    const node = button(parent, '', () => { filter(key, value); root.focus(); }, filters[key] === value ? 'active' : '');
    if (color) dot(node, color); el('span', '', label, node); el('small', '', String(count || 0), node);
    node.setAttribute('aria-pressed', String(filters[key] === value)); node.dataset[key] = value;
    if (color) node.setAttribute('aria-label', label + ' · ' + (count || 0) + ' sounds');
  }
  function renderNavigation() {
    categories.textContent = ''; reviews.textContent = ''; el('h2', '', 'Categories', categories);
    navigation(categories, 'All categories', 'category', 'all', Object.values(shown.counts).reduce((a, b) => a + b, 0));
    snapshot.categories.forEach(category => navigation(categories, category.name, 'category', category.id, shown.counts[category.id]));
    el('h2', '', 'Review checklist', reviews);
    navigation(reviews, 'All marks', 'mark', 'all', shown.reviewCounts.all);
    Model.COLORS.forEach(color => navigation(reviews, title(color) + ' dot', 'mark', color, shown.reviewCounts[color], color));
    navigation(reviews, 'Unmarked', 'mark', 'unmarked', shown.reviewCounts.unmarked);
  }
  function renderList() {
    tbody.textContent = ''; rowRefs.clear(); empty.hidden = shown.items.length > 0; table.hidden = !shown.items.length;
    empty.textContent = 'No sounds match these filters. Clear filters to see the full library.';
    shown.groups.forEach(category => {
      if (filters.grouped) { const tr = el('tr', 'sound-group-heading', undefined, tbody), th = el('th', '', category.name + '  ·  ' + category.items.length, tr); th.colSpan = 5; }
      category.items.forEach(item => {
        const row = el('tr', 'sound-row', undefined, tbody); row.tabIndex = 0; row.dataset.soundId = item.id; row.setAttribute('aria-selected', 'false');
        const control = el('td', '', undefined, row), preview = button(control, '▶', event => { event.stopPropagation(); if (player.id === item.id) player.toggle(); else player.select(item.id, true); }, 'sound-row-play');
        preview.setAttribute('aria-label', 'Play ' + item.name);
        const label = el('td', 'sound-label', undefined, row), line = el('div', 'sound-clip-name', undefined, label); el('strong', '', item.name, line);
        const color = Model.markOf(snapshot.marks, item.id); if (color) dot(line, color);
        el('small', 'sound-muted', item.key + (item.loop ? ' · Loop source' : ''), label);
        el('span', 'sound-origin ' + item.origin, title(item.origin), el('td', '', undefined, row));
        el('td', 'sound-duration', seconds(item.duration), row); el('td', 'sound-type', title(item.kind), row);
        row.onclick = () => player.select(item.id, false); row.ondblclick = () => player.select(item.id, true);
        row.onkeydown = event => { if (event.key === 'Enter' && event.target === row) { event.preventDefault(); player.select(item.id, true); } };
        rowRefs.set(item.id, { row, preview });
      });
    });
    visibleCount.textContent = shown.items.length + ' / ' + snapshot.items.length + ' sounds';
  }
  function renderDetail(state) {
    const item = state.item, color = item && Model.markOf(snapshot.marks, item.id), key = (item && item.id || '') + ':' + color;
    if (key === lastDetail) return; lastDetail = key; detail.textContent = '';
    el('h2', '', 'Sound details', detail);
    if (!item) { el('p', 'sound-muted', 'Select a sound to see its category and review mark.', detail); return; }
    const label = el('div', 'sound-detail-title', undefined, detail); el('h3', '', item.name, label); if (color) dot(label, color);
    const category = snapshot.categories.find(value => value.id === item.category);
    const values = [['Category', category && category.name || item.category], ['Source', title(item.origin) + (item.replacesOriginal ? ' · replaces an original clip' : '')],
      ['Collection', item.collection], ['Duration', seconds(item.duration)], ['Format', item.format + ' · ' + (item.bytes / 1024).toFixed(1) + ' KiB'],
      ['Review', color ? title(color) + ' dot' : 'Unmarked']];
    if (item.biome) values.push(['Biome', title(item.biome)]);
    if (item.unit) values.push(['Unit', title(item.unit)], ['Tier', item.tier ? String(item.tier) : 'Death vocal']);
    const dl = el('dl', '', undefined, detail); values.forEach(pair => { el('dt', '', pair[0], dl); el('dd', '', pair[1], dl); });
    el('small', 'sound-path sound-muted', item.file, detail);
    button(detail, 'Reveal in Assets', () => run('reveal', { id: item.id }));
    el('p', 'sound-muted sound-help', 'Click a row to select it. Press Play or double-click to listen. Previous and Next audition sounds in the displayed order.', detail);
    el('p', 'sound-muted sound-help', 'Shift+W cycles Once, Loop, and Autoplay next. Autoplay stops at the end of the filtered list.', detail);
    el('p', 'sound-muted sound-help', 'Press a color again to remove its dot. Save Checklist keeps your marks for your next session.', detail);
  }
  function renderPlayer(state) {
    if (closed) return;
    const playing = ['playing', 'loading'].includes(state.status), color = state.item && snapshot && Model.markOf(snapshot.marks, state.item.id);
    play.textContent = playing ? 'Pause (Space)' : 'Play (Space)'; play.disabled = !state.item;
    previous.disabled = state.index <= 0; next.disabled = state.index < 0 || state.index >= state.count - 1;
    mode.textContent = 'Mode: ' + LABELS[state.mode] + ' (Shift+W)'; mode.dataset.mode = state.mode;
    nowName.textContent = state.item ? state.item.name : 'Select a sound';
    nowStatus.textContent = state.status === 'loading' ? 'Loading…' : state.status === 'playing' ? 'Playing · ' + (state.index + 1) + ' of ' + state.count : state.status === 'paused' ? 'Paused' : state.status === 'ended' ? 'Finished' : 'Nothing is playing';
    elapsed.textContent = clock(state.time) + ' / ' + clock(state.duration); seek.max = state.duration || 1; seek.value = state.time; seek.disabled = !player.media || !state.duration;
    volume.value = Math.round(state.volume * 100); volumeValue.textContent = volume.value + '%'; playerError.textContent = state.error;
    Object.keys(markButtons).forEach(value => { markButtons[value].disabled = !state.item; markButtons[value].classList.toggle('active', color === value); markButtons[value].setAttribute('aria-pressed', String(color === value)); });
    clearMark.disabled = !color;
    rowRefs.forEach((value, id) => {
      const selected = id === (state.item && state.item.id); value.row.classList.toggle('selected', selected); value.row.classList.toggle('playing', selected && playing); value.row.setAttribute('aria-selected', String(selected));
      value.preview.textContent = selected && playing ? 'Ⅱ' : '▶'; value.preview.setAttribute('aria-label', (selected && playing ? 'Pause ' : 'Play ') + snapshot.items.find(item => item.id === id).name);
    });
    if (snapshot) renderDetail(state);
  }
  function applyFilters() {
    if (!snapshot) return;
    const focus = document.activeElement, ownedFocus = root.contains(focus);
    shown = Model.view(snapshot, filters); renderNavigation(); renderList(); player.setItems(shown.items);
    if (ownedFocus && !focus.isConnected) root.focus();
  }
  function render() {
    summary.textContent = snapshot.items.length + ' clips · ' + snapshot.items.filter(item => item.origin === 'original').length + ' Original · ' + snapshot.items.filter(item => item.origin === 'new').length + ' New';
    origin.title = snapshot.originDescription;
    if (!biome) biome = select(biomeHost, 'Biome', [['all', 'All biomes']].concat(snapshot.biomes.map(value => [value, title(value)])), filters.biome, value => filter('biome', value));
    lastDetail = ''; applyFilters(); status();
  }
  function keydown(event) {
    const action = Model.shortcut(event); if (!action) return;
    event.preventDefault(); event.stopPropagation();
    if (action === 'play') player.toggle(); else if (action === 'previous') navigate(-1); else if (action === 'next') navigate(1);
    else if (action === 'mode') player.cycleMode(); else mark(action);
  }
  const blur = () => player.pause(), visibility = () => { if (document.hidden) player.pause(); };
  root.addEventListener('keydown', keydown); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  const ready = run('load').then(() => { if (!closed && (document.activeElement === document.body || document.activeElement === host)) root.focus(); });
  return { ready, player, filters, root, get pending() { return pending; }, get snapshot() { return snapshot; },
    changed(value) { pending.then(() => { if (!closed && snapshot && value.version > snapshot.version) run('load'); }); },
    destroy() { closed = true; player.destroy(); root.removeEventListener('keydown', keydown); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); root.remove(); }
  };
}
module.exports = { mount };
