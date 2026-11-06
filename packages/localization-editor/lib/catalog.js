'use strict';

// Shared by the panel, main process, and Node tests. No editor dependency.
const crypto = require('crypto');
const reserved = ['__proto__', 'prototype', 'constructor', 'context', 'key'];
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
function safeKey(key) {
    return typeof key === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key) && reserved.indexOf(key) < 0;
}
function structure(catalog) {
    if (!plain(catalog) || catalog.version !== 1) throw new Error('Expected a version 1 localization catalog.');
    if (!Array.isArray(catalog.languages) || !catalog.languages.length) throw new Error('The catalog needs at least one language.');
    const codes = [];
    catalog.languages.forEach(language => {
        if (!plain(language) || !safeKey(language.code) || !safeKey(language.nameKey)) throw new Error('Each language needs a valid code and nameKey.');
        if (codes.indexOf(language.code) >= 0) throw new Error('Duplicate language: ' + language.code);
        codes.push(language.code);
    });
    if (codes.indexOf(catalog.defaultLanguage) < 0) throw new Error('Default language must be one of the catalog languages.');
    if (!plain(catalog.entries)) throw new Error('entries must be an object.');
    Object.keys(catalog.entries).forEach(key => {
        const entry = catalog.entries[key];
        if (!safeKey(key) || !plain(entry)) throw new Error('Invalid translation entry: ' + key);
        codes.forEach(code => { if (own(entry, code) && typeof entry[code] !== 'string') throw new Error(key + ': ' + code + ' must be text.'); });
        if (own(entry, 'context') && typeof entry.context !== 'string') throw new Error(key + ': context must be text.');
    });
    if (catalog.images !== undefined && !plain(catalog.images)) throw new Error('images must be an object.');
    Object.keys(catalog.images || {}).forEach(uuid => {
        const image = catalog.images[uuid];
        if (!safeKey(uuid) || !plain(image) || !safeKey(image.key)) throw new Error('Invalid image binding: ' + uuid);
        if (image.mode && ['replace', 'overlay'].indexOf(image.mode) < 0) throw new Error(uuid + ': mode must be replace or overlay.');
        if (image.artwork !== undefined && !plain(image.artwork)) throw new Error(uuid + ': artwork must be an object.');
        if (image.rect) ['x', 'y', 'width', 'height'].forEach(field => {
            if (typeof image.rect[field] !== 'number' || !isFinite(image.rect[field])) throw new Error(uuid + ': rect.' + field + ' must be a finite number.');
        });
        ['fontSize', 'outlineWidth'].forEach(field => {
            if (image[field] !== undefined && (typeof image[field] !== 'number' || !isFinite(image[field]) || image[field] < 0)) throw new Error(uuid + ': ' + field + ' must be a non-negative number.');
        });
        ['color', 'outlineColor', 'background'].forEach(field => {
            if (image[field] && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(image[field])) throw new Error(uuid + ': ' + field + ' must use #RRGGBB or #RRGGBBAA.');
        });
        Object.keys(image.artwork || {}).forEach(code => {
            if (typeof image.artwork[code] !== 'string') throw new Error(uuid + ': artwork UUID must be text.');
        });
    });
    if (catalog.artTemplates !== undefined && !plain(catalog.artTemplates)) throw new Error('artTemplates must be an object.');
    Object.keys(catalog.artTemplates || {}).forEach(id => {
        const template = catalog.artTemplates[id];
        if (!safeKey(id) || !plain(template) || !Array.isArray(template.regions)) throw new Error('Invalid artwork template: ' + id);
        template.regions.forEach(region => {
            if (!plain(region) || !safeKey(region.key)) throw new Error(id + ': each text region needs a valid translation key.');
        });
    });
    if (catalog.labelStyles !== undefined && !plain(catalog.labelStyles)) throw new Error('labelStyles must be an object.');
    Object.keys(catalog.labelStyles || {}).forEach(key => {
        if (!safeKey(key) || !plain(catalog.labelStyles[key])) throw new Error('Invalid label layout: ' + key);
        Object.keys(catalog.labelStyles[key]).forEach(code => {
            const style = catalog.labelStyles[key][code];
            if (codes.indexOf(code) < 0 || !plain(style)) throw new Error(key + ': label style must use a catalog locale.');
            ['width','height','fontSize','lineHeight','maxLines'].forEach(field => {
                if (style[field] !== undefined && (typeof style[field] !== 'number' || !isFinite(style[field]) || style[field] < 0)) throw new Error(key + ': ' + field + ' must be a non-negative number.');
            });
            if (style.maxLines !== undefined && (!Number.isInteger(style.maxLines) || style.maxLines < 1)) throw new Error(key + ': maxLines must be a positive integer.');
            ['x','y'].forEach(field => { if (style[field] !== undefined && (typeof style[field] !== 'number' || !isFinite(style[field]))) throw new Error(key + ': ' + field + ' must be a finite number.'); });
            if (style.wrap !== undefined && typeof style.wrap !== 'boolean') throw new Error(key + ': wrap must be true or false.');
            if (style.fontFamily !== undefined && (typeof style.fontFamily !== 'string' || !style.fontFamily.trim())) throw new Error(key + ': fontFamily must name a system font.');
            if (style.fontRole !== undefined && ['display','body'].indexOf(style.fontRole) < 0) throw new Error(key + ': fontRole must be display or body.');
            ['color','highlightColor'].forEach(field => { if (style[field] !== undefined && (typeof style[field] !== 'string' || !/^#[0-9a-f]{6}$/i.test(style[field]))) throw new Error(key + ': ' + field + ' must be a six-digit hex color.'); });
            if (style.horizontalAlign !== undefined && [0,1,2].indexOf(style.horizontalAlign) < 0) throw new Error(key + ': horizontalAlign must be 0 (left), 1 (center) or 2 (right).');
            if (style.overflow !== undefined && ['NONE','CLAMP','SHRINK','RESIZE_HEIGHT'].indexOf(style.overflow) < 0) throw new Error(key + ': overflow must be NONE, CLAMP, SHRINK or RESIZE_HEIGHT.');
        });
    });
    if (catalog.fontRoles !== undefined) {
        if (!plain(catalog.fontRoles)) throw new Error('fontRoles must be an object.');
        Object.keys(catalog.fontRoles).forEach(code => {
            if (codes.indexOf(code) < 0 || !plain(catalog.fontRoles[code])) throw new Error('fontRoles must use a catalog locale.');
            Object.keys(catalog.fontRoles[code]).forEach(key => {
                if (!safeKey(key) || ['display','body'].indexOf(catalog.fontRoles[code][key]) < 0) throw new Error('fontRoles assignments must use a valid key and display or body.');
            });
        });
    }
    ['nodeStyles','nodePathStyles'].forEach(section => {
        if (catalog[section] !== undefined && !plain(catalog[section])) throw new Error(section + ' must be an object.');
        Object.keys(catalog[section] || {}).forEach(id => { if (!safeKey(catalog[section][id]) || reserved.indexOf(id) >= 0) throw new Error(section + ': invalid layout binding ' + id); });
    });
    return catalog;
}
function tokens(text) {
    return (text.match(/\{[\w.]+\}|%(?:\d+\$)?[sdf]/g) || []).sort().join('|');
}
function tags(text) {
    // Cocos accepts </c> as the closing color tag.
    return (text.match(/<\/?(?:b|i|u|color|c|size|outline|on|br|img)(?=[\s=/>])[^>]*>/gi) || []).map(tag => {
        let name = /^<\/?([a-z]+)/i.exec(tag)[1].toLowerCase();
        if (name === 'c') name = 'color';
        return (tag[1] === '/' ? '/' : '') + name;
    }).sort().join('|');
}
function validate(catalog) {
    structure(catalog);
    const issues = [];
    const base = catalog.languages.some(l => l.code === 'zh') ? 'zh' : catalog.defaultLanguage;
    Object.keys(catalog.entries).forEach(key => {
        const entry = catalog.entries[key];
        const source = entry[base] || entry[catalog.defaultLanguage] || '';
        catalog.languages.forEach(language => {
            const value = entry[language.code];
            if (typeof value !== 'string' || !value.trim()) issues.push({ key, language: language.code, type: 'missing', message: 'Missing translation' });
            else if (source) {
                if (tokens(source) !== tokens(value)) issues.push({ key, language: language.code, type: 'placeholder', message: 'Placeholder mismatch: preserve ' + (tokens(source) || '(none)') });
                if (tags(source) !== tags(value)) issues.push({ key, language: language.code, type: 'markup', message: 'Rich text tag mismatch' });
            }
        });
    });
    catalog.languages.forEach(language => {
        if (!own(catalog.entries, language.nameKey)) issues.push({ key: language.nameKey, language: language.code, type: 'reference', message: 'Language name key does not exist' });
    });
    Object.keys(catalog.images || {}).forEach(uuid => {
        if (!own(catalog.entries, catalog.images[uuid].key)) issues.push({ key: catalog.images[uuid].key, image: uuid, type: 'reference', message: 'Artwork translation key does not exist' });
    });
    Object.keys(catalog.artTemplates || {}).forEach(id => {
        catalog.artTemplates[id].regions.forEach(region => {
            if (!own(catalog.entries, region.key)) issues.push({ key: region.key, template: id, type: 'reference', message: 'Artwork template translation key does not exist' });
        });
    });
    ['nodeStyles','nodePathStyles'].forEach(section => {
        Object.keys(catalog[section] || {}).forEach(id => {
            const key = catalog[section][id];
            if (!catalog.labelStyles || !own(catalog.labelStyles, key)) issues.push({ key, node: id, type: 'reference', message: 'Node layout style does not exist' });
        });
    });
    return issues;
}
function quote(value) { return '"' + String(value === undefined ? '' : value).replace(/"/g, '""') + '"'; }
function toCSV(catalog) {
    structure(catalog);
    const columns = ['key', 'context'].concat(catalog.languages.map(l => l.code));
    const rows = [columns];
    Object.keys(catalog.entries).sort().forEach(key => {
        rows.push(columns.map(column => column === 'key' ? key : catalog.entries[key][column] || ''));
    });
    return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
function parseCSV(input) {
    const text = String(input).replace(/^\uFEFF/, '');
    const rows = []; let row = [], value = '', inQuote = false, quoted = false, endedQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuote) {
            if (c === '"') {
                if (text[i + 1] === '"') { value += '"'; i++; }
                else { inQuote = false; endedQuote = true; }
            } else value += c;
        } else if (c === '"') {
            if (value || quoted) throw new Error('Unexpected quote in CSV row ' + (rows.length + 1));
            inQuote = true; quoted = true;
        } else if (c === ',' || c === '\r' || c === '\n') {
            row.push(value); value = ''; quoted = false; endedQuote = false;
            if (c !== ',') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                rows.push(row); row = [];
            }
        } else {
            if (endedQuote) throw new Error('Unexpected text after a closing CSV quote in row ' + (rows.length + 1));
            value += c;
        }
    }
    if (inQuote) throw new Error('Unclosed CSV quote.');
    if (row.length || value || quoted) { row.push(value); rows.push(row); }
    return rows.filter(r => r.some(cell => cell !== ''));
}
function mergeCSV(catalog, text) {
    structure(catalog);
    const rows = parseCSV(text), next = clone(catalog), seen = new Set();
    if (rows.length < 1) throw new Error('CSV is empty.');
    const header = rows.shift();
    if (header[0] !== 'key' || new Set(header).size !== header.length) throw new Error('CSV must start with key and have unique column headers.');
    const allowed = ['key', 'context'].concat(catalog.languages.map(l => l.code));
    header.forEach(column => { if (allowed.indexOf(column) < 0) throw new Error('Unknown CSV column: ' + column + '. Add the language first.'); });
    rows.forEach((row, index) => {
        if (row.length !== header.length) throw new Error('Wrong cell count in CSV row ' + (index + 2));
        const key = row[0];
        if (!safeKey(key) || seen.has(key)) throw new Error('Invalid or duplicate key in CSV: ' + key);
        seen.add(key);
        if (!own(next.entries, key)) next.entries[key] = { context: 'Imported from CSV' };
        header.forEach((column, i) => { if (column !== 'key') next.entries[key][column] = row[i]; });
    });
    structure(next);
    return { catalog: next, count: rows.length };
}
module.exports = { structure, validate, tokens, tags, toCSV, parseCSV, mergeCSV, safeKey, clone,
    revision: text => crypto.createHash('sha256').update(text).digest('hex') };
