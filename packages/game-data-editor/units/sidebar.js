'use strict';

const Gallery = require('../worlds/unit-model-gallery');
const Classes = require('../lib/enemy-classes');

const DEFAULT_WIDTH = 456;
const MIN_WIDTH = 208;
const TARGET_BADGES = { hero: 'Target Hero', castle: 'Target Castle' };

function mount({ workspace, sidebar, detail, list, describe, select }) {
  const document = workspace.ownerDocument;
  const view = document.defaultView;
  const make = (tag, className) => {
    const element = document.createElement(tag);
    element.className = className;
    return element;
  };
  const divider = make('div', 'gt-unit-divider');
  divider.tabIndex = 0;
  divider.title = 'Drag or use the arrow keys to resize. Double-click to reset.';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Resize unit roster');
  divider.setAttribute('aria-controls', sidebar.id);
  divider.setAttribute('aria-orientation', 'vertical');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Unit models');
  workspace.classList.add('gt-unit-workspace');
  workspace.insertBefore(divider, detail);

  let preferred = DEFAULT_WIDTH, actual = DEFAULT_WIDTH, max = DEFAULT_WIDTH, drag = null;
  function size() {
    const width = workspace.clientWidth;
    if (!width) return;
    workspace.classList.toggle('gt-unit-narrow', width < 1050);
    const style = getComputedStyle(workspace);
    const reserved = parseFloat(style.getPropertyValue('--gt-unit-detail-min')) +
      parseFloat(style.getPropertyValue('--gt-unit-preview-width')) + divider.offsetWidth;
    max = Math.max(MIN_WIDTH, Math.floor(width - reserved));
    actual = Math.min(max, Math.max(MIN_WIDTH, preferred));
    workspace.style.setProperty('--gt-unit-sidebar-width', actual + 'px');
    divider.setAttribute('aria-valuemin', String(MIN_WIDTH));
    divider.setAttribute('aria-valuemax', String(max));
    divider.setAttribute('aria-valuenow', String(actual));
  }
  function resize(width) {
    preferred = Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
    size();
  }
  function release(cancel) {
    const previous = drag;
    if (!previous) return;
    drag = null;
    divider.classList.remove('dragging');
    if (cancel) {
      preferred = previous.preferred;
      size();
    }
    if (divider.hasPointerCapture(previous.id)) divider.releasePointerCapture(previous.id);
  }
  divider.onpointerdown = event => {
    if (event.button !== 0 || drag || max === MIN_WIDTH) return;
    event.preventDefault();
    event.stopPropagation();
    divider.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, width: actual, preferred };
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');
  };
  // Creator hosts the panel in a shadow root. Keep tracking the pointer if it
  // leaves the handle and the embedded browser delivers it to another pane.
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (event.pointerType === 'mouse' && !event.buttons) { release(false); return; }
    event.preventDefault();
    resize(drag.width + event.clientX - drag.x);
  }
  function end(event) {
    if (drag && event.pointerId === drag.id) release(event.type === 'pointercancel');
  }
  function blur() { release(false); }
  view.addEventListener('pointermove', move, true);
  view.addEventListener('pointerup', end, true);
  view.addEventListener('pointercancel', end, true);
  view.addEventListener('blur', blur);
  divider.ondblclick = () => { preferred = DEFAULT_WIDTH; size(); };
  divider.onkeydown = event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); release(true); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 20;
    resize(event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? max :
      actual + (event.key === 'ArrowRight' ? step : -step));
  };
  const cards = new Map();
  let gallery, version, dirty = false, empty, pendingReveal;
  const observer = new ResizeObserver(() => {
    size();
    revealCard();
  });
  observer.observe(workspace);
  observer.observe(list);
  size();

  function revealCard() {
    if (pendingReveal === undefined || !list.clientHeight) return;
    const record = cards.get(pendingReveal);
    pendingReveal = undefined;
    if (!record || record.card.getAttribute('aria-current') !== 'true') return;
    const bounds = record.card.getBoundingClientRect();
    const top = bounds.top - list.getBoundingClientRect().top - list.clientTop;
    list.scrollTop += top + (bounds.height - list.clientHeight) / 2;
  }
  function cardFor(key) {
    const card = make('button', 'gt-record gt-unit-card');
    card.type = 'button';
    card.dataset.unitKey = key;
    card.onclick = () => select(key);
    const art = make('span', 'gt-unit-card-art'), image = make('img', ''), status = make('small', 'gt-unit-card-status');
    image.alt = '';
    image.draggable = false;
    art.append(image, status);
    const label = make('strong', ''), subtitle = make('small', 'gt-unit-card-subtitle');
    const traits = make('span', 'gt-unit-card-traits');
    const role = make('span', 'gt-unit-card-trait');
    const movement = make('span', 'gt-unit-card-trait');
    const target = make('span', 'gt-unit-card-trait');
    const text = make('span', 'gt-unit-card-text'), badge = make('span', 'gt-unit-card-class');
    traits.append(role, movement, target);
    text.append(label, traits, subtitle);
    const check = make('span', 'gt-unit-card-check');
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    card.append(art, text, badge, check);
    return { card, image, status, label, subtitle, traits, role, movement, target, badge };
  }
  function render(rows, selected, revision) {
    const refresh = !gallery || version !== revision || dirty;
    if (refresh) {
      if (gallery) gallery.destroy();
      gallery = Gallery.create(list, describe, selected);
      version = revision;
      dirty = false;
    }
    const keys = new Set(rows.map(row => row.key));
    for (const [key, record] of cards) {
      if (keys.has(key)) continue;
      gallery.unwatch(record.card);
      record.card.remove();
      cards.delete(key);
    }
    if (empty) { empty.remove(); empty = null; }
    rows.forEach((row, index) => {
      const previous = cards.get(row.key);
      const record = previous || cardFor(row.key);
      cards.set(row.key, record);
      const { card, image, status, label, subtitle, traits, role, movement, target, badge } = record;
      const active = row.key === selected;
      card.classList.toggle('active', active);
      card.setAttribute('aria-current', String(active));
      label.textContent = row.label;
      subtitle.textContent = row.subtitle;
      subtitle.hidden = !row.subtitle;
      traits.hidden = !row.fightingTypeName;
      role.dataset.role = row.fightingType || '';
      role.textContent = row.fightingTypeName;
      movement.dataset.movement = row.flying ? 'flying' : 'ground';
      movement.textContent = row.flying ? 'Flying' : 'Ground';
      const priority = row.targeting?.mode === 'priority';
      const targetGroup = priority ? row.targeting.order[0] : row.targeting?.mode;
      const targetLabel = TARGET_BADGES[targetGroup];
      target.hidden = !targetLabel;
      target.dataset.target = targetLabel ? targetGroup : '';
      target.textContent = targetLabel || '';
      target.title = targetLabel ? (targetGroup === 'hero' ? 'Hero' : 'Castle') + (priority ? ' first' : ' only') : '';
      badge.hidden = !row.enemyClass;
      badge.dataset.enemyClass = row.enemyClass || '';
      badge.textContent = row.enemyClass ? Classes.label(row.enemyClass) : '';
      if (list.children[index] !== card) list.insertBefore(card, list.children[index] || null);
      if (refresh || !previous) {
        status.textContent = 'Loading model…';
        status.title = '';
        status.hidden = false;
        card.dataset.modelState = 'waiting';
        gallery.watch(card, image, status, row.key);
      }
    });
    if (!rows.length) {
      empty = make('div', 'gt-empty');
      empty.textContent = 'No units match your search.';
      list.appendChild(empty);
    }
  }
  return {
    render,
    reveal(key) {
      pendingReveal = key;
      revealCard();
      // A docked tab can become visible before the resize observer runs.
      if (pendingReveal !== undefined) view.requestAnimationFrame(revealCard);
    },
    invalidate() { dirty = true; },
    destroy() {
      pendingReveal = undefined;
      observer.disconnect();
      view.removeEventListener('pointermove', move, true);
      view.removeEventListener('pointerup', end, true);
      view.removeEventListener('pointercancel', end, true);
      view.removeEventListener('blur', blur);
      release(false);
      if (gallery) gallery.destroy();
      divider.remove();
    }
  };
}

module.exports = { mount };
