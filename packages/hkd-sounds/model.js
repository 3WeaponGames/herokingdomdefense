'use strict';
const COLORS = ['green', 'yellow', 'red'];
const text = value => String(value || '').toLowerCase();
function markOf(marks, id) { return COLORS.includes(marks[id]) ? marks[id] : null; }
function filtered(snapshot, filters, ignoreCategory, ignoreMark) {
  filters = filters || {}; const terms = text(filters.search).trim().split(/\s+/).filter(Boolean), marks = snapshot.marks || {};
  return snapshot.items.filter(item => {
    const mark = markOf(marks, item.id);
    const search = text([item.name, item.key, item.file, item.category, item.kind, item.biome, item.unit, item.collection, item.origin,
      item.tier ? 'tier ' + item.tier + ' level ' + item.tier : '', mark].join(' '));
    return terms.every(term => search.includes(term)) && (!filters.origin || filters.origin === 'all' || item.origin === filters.origin) &&
      (!filters.kind || filters.kind === 'all' || item.kind === filters.kind) &&
      (!filters.biome || filters.biome === 'all' || item.biome === filters.biome) &&
      (ignoreCategory || !filters.category || filters.category === 'all' || item.category === filters.category) &&
      (ignoreMark || !filters.mark || filters.mark === 'all' || (filters.mark === 'unmarked' ? !mark : mark === filters.mark));
  });
}
function view(snapshot, filters) {
  const marks = snapshot.marks || {}, mode = filters.sort || 'name-asc', byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.file.localeCompare(b.file);
  let items = filtered(snapshot, filters).sort((a, b) => {
    if (mode.startsWith('duration')) {
      if (a.duration === null || b.duration === null) return a.duration === b.duration ? byName(a, b) : a.duration === null ? 1 : -1;
      return (a.duration - b.duration) * (mode === 'duration-desc' ? -1 : 1) || byName(a, b);
    }
    if (mode === 'origin') return Number(a.origin !== 'original') - Number(b.origin !== 'original') || byName(a, b);
    if (mode === 'mark' || mode === 'mark-reverse') {
      const rank = item => { const color = markOf(marks, item.id); return color ? (mode === 'mark-reverse' ? 2 - COLORS.indexOf(color) : COLORS.indexOf(color)) : 3; };
      return rank(a) - rank(b) || byName(a, b);
    }
    return byName(a, b) * (mode === 'name-desc' ? -1 : 1);
  });
  let groups;
  if (filters.grouped !== false) {
    groups = snapshot.categories.map(category => Object.assign({}, category, { items: items.filter(item => item.category === category.id) })).filter(group => group.items.length);
    items = [].concat.apply([], groups.map(group => group.items));
  } else groups = [{ id: 'all', name: 'All sounds', items }];
  const counts = {}, reviewCounts = { all: 0, unmarked: 0, green: 0, yellow: 0, red: 0 };
  filtered(snapshot, filters, true).forEach(item => { counts[item.category] = (counts[item.category] || 0) + 1; });
  filtered(snapshot, filters, false, true).forEach(item => { reviewCounts.all++; reviewCounts[markOf(marks, item.id) || 'unmarked']++; });
  return { items, groups, counts, reviewCounts };
}
function shortcut(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
  const target = event.composedPath ? event.composedPath()[0] : event.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(target.tagName) || target.closest && target.closest('[contenteditable="true"]'))) return null;
  const key = text(event.key);
  if (!event.shiftKey && (key === ' ' || key === 'spacebar')) return 'play';
  return event.shiftKey ? { q: 'previous', e: 'next', w: 'mode', a: 'green', s: 'yellow', d: 'red' }[key] || null : null;
}
module.exports = { view, filtered, shortcut, markOf, COLORS };
