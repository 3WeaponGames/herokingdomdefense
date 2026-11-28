'use strict';

const fs = require('fs');
const path = require('path');
const Classes = require('../lib/enemy-classes');
const {hitEffects} = require('../../../assets/_script/UnitAttackRules');

const style = fs.readFileSync(path.join(__dirname, 'card.css'), 'utf8');
const TARGET_BADGES = {hero: 'Target Hero', castle: 'Target Castle'};
const DELIVERY_LABELS = {melee: 'Melee', ranged: 'Range', support: 'Support'};
const PATTERN_LABELS = {single: 'Single', splash: 'Splash', volley: 'Volley', piercing: 'Piercing', chain: 'Chain'};

function attackText(attack) {
    if (!attack?.delivery) return '';
    const delivery = [DELIVERY_LABELS[attack.delivery], PATTERN_LABELS[attack.pattern]].filter(Boolean).join(' ');
    const effects = Object.keys(attack.onHit || {}).map(id => id === 'lifeSteal' ? 'Life Steal' : hitEffects[id].label);
    return [delivery, ...effects].join(', ');
}

function create(card, make) {
    card.classList.add('gt-unit-card');
    const art = make('span', 'gt-unit-card-art'), image = make('img'), status = make('small', 'gt-unit-card-status');
    image.alt = '';
    image.draggable = false;
    status.textContent = 'Loading model…';
    art.appendChild(image);
    art.appendChild(status);
    const label = make('strong'), subtitle = make('small', 'gt-unit-card-subtitle');
    const movement = make('span', 'gt-unit-card-trait');
    const role = make('small', 'gt-unit-card-line');
    const attack = make('small', 'gt-unit-card-line');
    const targets = make('span', 'gt-unit-card-targets');
    const wrecker = make('span', 'gt-unit-card-trait gt-unit-card-wrecker');
    const target = make('span', 'gt-unit-card-trait');
    const text = make('span', 'gt-unit-card-text');
    const skills = make('span', 'gt-unit-card-skills');
    const cp = make('span', 'gt-unit-card-cp');
    cp.title = 'Base combat power';
    wrecker.textContent = 'Wrecker';
    targets.appendChild(wrecker);
    targets.appendChild(target);
    for (const line of [label, movement, role, attack, targets, subtitle]) text.appendChild(line);
    const check = make('span', 'gt-unit-card-check');
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    for (const part of [art, text, skills, cp, check]) card.appendChild(part);
    return {card, image, status, label, subtitle, movement, role, attack, targets, wrecker, target, skills, cp};
}

function update(view, row) {
    const {card, label, subtitle, movement, role, attack, targets, wrecker, target, skills, cp} = view;
    label.textContent = row.label;
    subtitle.textContent = row.subtitle || '';
    subtitle.hidden = !subtitle.textContent;
    const isWrecker = row.fightingType === 'wrecker';
    role.textContent = isWrecker ? '' : row.fightingTypeName || '';
    role.hidden = !role.textContent;
    attack.textContent = attackText(row.attack);
    attack.hidden = !attack.textContent;
    movement.hidden = row.flying == null;
    movement.dataset.movement = row.flying ? 'flying' : 'ground';
    movement.textContent = row.flying ? 'Flying' : 'Ground';
    const priority = row.targeting?.mode === 'priority';
    const targetGroup = priority ? row.targeting.order[0] : row.targeting?.mode;
    const targetLabel = TARGET_BADGES[targetGroup];
    targets.hidden = !isWrecker && !targetLabel;
    wrecker.hidden = !isWrecker;
    target.hidden = !targetLabel;
    target.dataset.target = targetLabel ? targetGroup : '';
    target.textContent = targetLabel || '';
    target.title = targetLabel ? (targetGroup === 'hero' ? 'Hero' : 'Castle') + (priority ? ' first' : ' only') : '';
    card.dataset.enemyClass = row.enemyClass || '';
    card.title = row.enemyClass ? Classes.label(row.enemyClass) : '';
    skills.textContent = (row.skills || []).join(', ');
    skills.hidden = !skills.textContent;
    cp.hidden = !Number.isFinite(row.cp);
    cp.textContent = cp.hidden ? '' : Math.round(row.cp).toLocaleString() + ' CP';
}

module.exports = {create, update, style};
