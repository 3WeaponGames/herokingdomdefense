'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');
const Catalog = require('./catalog');
function localAsset(root, relative, extensions) {
    if (typeof relative !== 'string' || !/^assets[\\/]/.test(relative)) throw new Error('Artwork sources must be project assets: ' + relative);
    const assets = fs.realpathSync(path.join(root, 'assets'));
    const file = fs.realpathSync(path.resolve(root, relative));
    const relation = path.relative(assets, file);
    if (relation.startsWith('..') || path.isAbsolute(relation) || extensions.indexOf(path.extname(file).toLowerCase()) < 0) throw new Error('Unsupported artwork source: ' + relative);
    return file;
}
function dataURL(file) {
    const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ttf':'font/ttf', '.otf':'font/otf', '.woff':'font/woff', '.woff2':'font/woff2' };
    return 'data:' + types[path.extname(file).toLowerCase()] + ';base64,' + fs.readFileSync(file).toString('base64');
}
function prepare(catalog, root) {
    Catalog.structure(catalog);
    const templates = Catalog.clone(catalog.artTemplates || {}), fonts = {}, pending = [];
    Object.keys(templates).forEach(id => {
        if (templates[id].pending !== undefined && typeof templates[id].pending !== 'boolean') throw new Error(id + ': pending must be true or false.');
        if (templates[id].pending) { pending.push(id); delete templates[id]; }
    });
    Object.keys(templates).forEach(id => {
        if (!Catalog.safeKey(id)) throw new Error('Invalid artwork template ID: ' + id);
        const template = templates[id];
        ['width','height'].forEach(field => {
            if (!Number.isInteger(template[field]) || template[field] < 1 || template[field] > 8192) throw new Error(id + ': ' + field + ' must be 1–8192 pixels.');
        });
        if (!Array.isArray(template.regions)) throw new Error(id + ': regions must be an array.');
        if (template.languages && (!Array.isArray(template.languages) || template.languages.some(code => !catalog.languages.some(language => language.code === code)))) throw new Error(id + ': unknown template language.');
        if (template.source) template.sourceData = dataURL(localAsset(root, template.source, ['.png','.jpg','.jpeg','.webp']));
        template.regions.forEach(region => {
            if (!region || !Catalog.safeKey(region.key) || !catalog.entries[region.key]) throw new Error(id + ': unknown text key.');
            if (!region.rect || ['x','y','width','height'].some(field => !Number.isFinite(region.rect[field])) || region.rect.width <= 0 || region.rect.height <= 0) throw new Error(id + ': invalid text rectangle.');
            if (region.rect.width > 8192 || region.rect.height > 8192) throw new Error(id + ': text rectangle is too large.');
            if (region.quad && (!Array.isArray(region.quad) || region.quad.length !== 4 || region.quad.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error(id + ': quad needs four {x,y} points, clockwise from top left.');
            if (region.clip && (!Array.isArray(region.clip) || region.clip.length < 3 || region.clip.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error(id + ': clip needs at least three {x,y} points.');
            [region].concat(Object.keys(region.locales || {}).map(code => region.locales[code])).forEach(style => {
                if (style.font && !fonts[style.font]) fonts[style.font] = dataURL(localAsset(root, style.font, ['.ttf','.otf','.woff','.woff2']));
                ['fontSize','minFontSize','outlineWidth','padding','lineHeightRatio'].forEach(field => {
                    if (style[field] !== undefined && (!Number.isFinite(style[field]) || style[field] < 0)) throw new Error(id + ': ' + field + ' must be a finite non-negative number.');
                });
            });
        });
    });
    return { catalog, templates, fonts, pending };
}
async function compile(catalog, root) {
    const request = prepare(catalog, root);
    if (!Object.keys(request.templates).length) return { count: 0, outputs: [], metrics: [], pending: request.pending };
    const BrowserWindow = require('electron').BrowserWindow;
    const window = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
    let timer;
    try {
        await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Artwork renderer did not finish loading.')), 30000);
            window.webContents.once('did-finish-load', resolve);
            window.webContents.once('did-fail-load', (_, code, message) => reject(new Error('Artwork renderer load failed: ' + code + ' ' + message)));
            window.loadURL(url.pathToFileURL(path.join(__dirname, 'art-renderer.html')).href);
        });
        clearTimeout(timer);
        const script = 'window.LocalizationArtRenderer.compile(' + JSON.stringify(request).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ')';
        const result = await window.webContents.executeJavaScript(script);
        const directory = path.join(root, 'assets', 'resources', 'localization', 'generated');
        const outputs = result.outputs.map(output => {
            if (!Catalog.safeKey(output.locale) || !Catalog.safeKey(output.template)) throw new Error('Invalid renderer output identity.');
            const target = path.join(directory, output.locale, output.template + '.png');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const bytes = Buffer.from(output.data, 'base64');
            if (bytes.slice(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Renderer output was not PNG.');
            // Write only changed files: stable artifacts and no unnecessary editor reimports.
            const changed = !fs.existsSync(target) || !fs.readFileSync(target).equals(bytes);
            if (changed) { fs.writeFileSync(target + '.tmp', bytes); fs.renameSync(target + '.tmp', target); }
            return { template: output.template, locale: output.locale, path: target,
                resource: 'localization/generated/' + output.locale + '/' + output.template,
                width: output.width, height: output.height, changed };
        });
        return { count: outputs.length, outputs, metrics: result.metrics, pending: request.pending };
    } finally { clearTimeout(timer); if (!window.isDestroyed()) window.destroy(); }
}
module.exports = { prepare, compile };
