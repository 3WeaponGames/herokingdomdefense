'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');

const projectRoot = path.resolve(__dirname, '../..');
const iconLibraryFolders = ['resources/icons/2d-minimal/', 'resources/icons/Pictograms/'];
// These libraries also serve the Creator panels. Keep entries reached from the
// shipped scenes, prefabs, game data, and appearance catalogs.
const optionalFolders = [
  'resources/unit-library/',
  'resources/hero-items/baked/',
  'resources/character-parts/Thumbnail/',
  'KinghtFallIconMap/Generated/Maps/',
  ...iconLibraryFolders,
];
const generatedMountIconPrefix = 'resources/unit-library/mount-icons/';
const uuidPattern = /[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/gi;
const textAsset = /\.(?:anim|atlas|effect|fire|js|json|mtl|plist|prefab|ts|txt)$/i;
const jsonAsset = /\.(?:anim|fire|json|mtl|prefab)$/i;
const projectEntries = ['project.json', 'jsconfig.json', 'tsconfig.json', 'settings', 'build-templates'];
const textureQuality = [
  [/^(?:KinghtFallIconMap\/(?:Generated\/Maps|Thumbnails)\/|KinghtFallPrefabs\/_res\/textures\/KinghtFallUIHome\/Backgrounds\/|resources\/stage-loading\/)/, 84],
  [/^(?:KinghtFallIconMap\/com\/|KinghtFallIconBuild\/|resources\/(?:buildings|unit-library)\/)/, 86],
  [/^resources\/(?:vfx|projectiles)\//, 92],
];
const losslessTextures = /^(?:KinghtFall(?:IconMap|IconBuild|Prefabs)\/|resources\/(?:buildings|hero-items\/baked|hero-maker|icons|localization\/generated|projectiles|startup|unit-library|vfx)\/)/;

function walk(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = directory + entry.name;
    if (entry.isDirectory()) return walk(root, file + '/');
    if (!entry.isFile()) throw new Error('Unsupported asset entry: ' + file);
    return [file];
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function sourceRevision(root) {
  const files = ['assets', ...projectEntries].flatMap(entry => {
    const stat = fs.statSync(path.join(root, entry), { throwIfNoEntry: false });
    if (!stat) return [];
    return stat.isDirectory() ? walk(root, entry + '/') : [entry];
  });
  return files.sort().map(file => {
    const stat = fs.statSync(path.join(root, file));
    return `${file}\t${stat.size}\t${stat.mtimeMs}\t${stat.ctimeMs}`;
  }).join('\n');
}

function visitStrings(value, visit, skipThumbnail = false) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach(item => visitStrings(item, visit, skipThumbnail));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (skipThumbnail && key === 'thumbnail') continue;
      visit(key);
      visitStrings(item, visit, skipThumbnail);
    }
  }
}

function indexAssets(assetRoot) {
  const allFiles = new Set(walk(assetRoot).sort());
  const assets = new Map();
  const byUuid = new Map();
  const byPath = new Map();
  for (const file of allFiles) {
    if (file.endsWith('.meta')) continue;
    const metadata = allFiles.has(file + '.meta') ? readJson(path.join(assetRoot, file + '.meta')) : null;
    assets.set(file, { metadata, bytes: fs.statSync(path.join(assetRoot, file)).size });

    function register(data) {
      if (!data) return;
      if (data.uuid) {
        const id = data.uuid.toLowerCase();
        if (byUuid.has(id)) throw new Error('Duplicate asset UUID in ' + file + ' and ' + byUuid.get(id));
        byUuid.set(id, file);
      }
      Object.values(data.subMetas || {}).forEach(register);
    }
    register(metadata);

    const extension = path.posix.extname(file);
    const stem = extension ? file.slice(0, -extension.length) : file;
    const keys = new Set([file, stem, 'assets/' + file, 'db://assets/' + file]);
    if (iconLibraryFolders.some(folder => file.startsWith(folder))) {
      // The game also constructs these resource paths from literal icon names.
      keys.add(path.posix.basename(stem));
    }
    for (const bundle of ['resources/', 'KinghtFallIconMap/']) {
      if (!file.startsWith(bundle)) continue;
      keys.add(file.slice(bundle.length));
      keys.add(stem.slice(bundle.length));
    }
    for (const key of keys) {
      const matches = byPath.get(key) || new Set();
      matches.add(file);
      byPath.set(key, matches);
    }
  }
  return { allFiles, assets, byUuid, byPath };
}

function planRelease(assetRoot) {
  const { allFiles, assets, byUuid, byPath } = indexAssets(assetRoot);
  const projectileCatalog = 'resources/projectiles/catalog.json';
  if (assets.has(projectileCatalog)) {
    const { trails } = readJson(path.join(assetRoot, projectileCatalog));
    for (const { bundle, resource, textureUuid } of trails || []) {
      if (!resource || !textureUuid) continue;
      const expected = `${bundle || 'resources'}/${resource}`;
      const actual = byUuid.get(textureUuid.toLowerCase());
      // The stage loader requests this texture by path, even if a prefab
      // still references its UUID after an archive renames the source file.
      if (!byPath.get(expected)?.has(actual)) {
        throw new Error(`Projectile trail texture path ${expected} is missing for ${textureUuid}. Indexed file: ${actual || '(missing)'}.`);
      }
    }
  }
  const included = new Set();
  const pending = [];
  function include(file) {
    if (assets.has(file) && !included.has(file)) {
      included.add(file);
      pending.push(file);
    }
  }
  for (const file of assets.keys()) {
    if (!optionalFolders.some(prefix => file.startsWith(prefix)) || file.startsWith(generatedMountIconPrefix)) include(file);
  }

  for (let index = 0; index < pending.length; index++) {
    const file = pending[index];
    const { metadata } = assets.get(file);
    function reference(value) {
      const id = byUuid.get(value.toLowerCase());
      if (id) include(id);
      const resource = value.startsWith('@icon/') ? value.slice(6) : value;
      for (const match of byPath.get(resource) || []) include(match);
    }
    if (metadata) visitStrings(metadata, reference);
    if (metadata?.importer === 'spine') {
      const stem = file.slice(0, -path.posix.extname(file).length);
      include(stem + '.atlas');
      include(stem + '.atlas.txt');
    }
    if (!textAsset.test(file)) continue;
    const source = path.join(assetRoot, file);
    if (jsonAsset.test(file)) {
      // Thumbnail fields in this catalog are editor file paths. Runtime code
      // requests the part's resource field for both rendering and item icons.
      visitStrings(readJson(source), reference, file === 'resources/character-parts/catalog.json');
    } else {
      const text = fs.readFileSync(source, 'utf8');
      for (const value of text.match(uuidPattern) || []) reference(value);
      for (const match of text.matchAll(/"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`/g)) reference(match[1] ?? match[2] ?? match[3]);
      if (/\.atlas(?:\.txt)?$|\.plist$/i.test(file)) {
        const dir = path.posix.dirname(file);
        for (const match of text.matchAll(/(?:^|>)([^<>\r\n]+\.(?:png|jpe?g|webp))(?=\r?$|<)/gim)) {
          include(path.posix.join(dir, match[1].trim()));
        }
      }
    }
  }

  function includeMeta(file) {
    if (allFiles.has(file + '.meta')) included.add(file + '.meta');
  }
  for (const file of [...included]) {
    includeMeta(file);
    for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) includeMeta(dir);
  }

  const removed = [];
  const groups = {};
  let sourceBytes = 0;
  for (const [file, { bytes }] of assets) {
    sourceBytes += bytes;
    if (included.has(file)) continue;
    const group = optionalFolders.find(prefix => file.startsWith(prefix));
    if (!groups[group]) groups[group] = { files: 0, bytes: 0 };
    groups[group].files++;
    groups[group].bytes += bytes;
    removed.push({ file, bytes });
  }
  return { included, sourceBytes, removed, groups };
}

function retargetAtlas(text, file, conversions) {
  const parent = path.posix.dirname(file);
  function target(name) {
    const replacement = conversions.get(path.posix.join(parent, name));
    return replacement ? path.posix.relative(parent, replacement) : name;
  }
  if (file.endsWith('.plist')) {
    return text.replace(/(<key>(?:realTextureFileName|textureFileName)<\/key>\s*<string>)([^<]+)(<\/string>)/g,
      (_, before, name, after) => before + target(name) + after);
  }
  // A Spine page name precedes its page properties. Region names and UVs stay intact.
  return text.replace(/^([^\r\n]+\.png)(?=\r?\n(?:size|format|filter|repeat|pma):)/gim, name => target(name));
}

function convertTextures(root, destination, plan, cwebp) {
  const conversions = new Map();
  const textures = [];
  for (const file of plan.included) {
    if (!file.endsWith('.png') || !plan.included.has(file + '.meta')) continue;
    const rule = textureQuality.find(([pattern]) => pattern.test(file));
    if (!rule && !losslessTextures.test(file)) continue;
    const source = path.join(root, 'assets', file);
    const before = fs.statSync(source).size;
    const quality = rule && before >= 96 * 1024 ? rule[1] : null;
    if (quality === null && before < 32 * 1024) continue;
    const output = file.slice(0, -4) + '.webp';
    if (plan.included.has(output)) throw new Error('WebP target already exists: ' + output);
    const target = path.join(destination, 'assets', output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const options = quality === null ? ['-lossless', '-exact', '-metadata', 'icc'] : ['-q', String(quality), '-alpha_q', '100', '-exact', '-sharp_yuv'];
    execFileSync(cwebp, ['-quiet', ...options, source, '-o', target], { windowsHide: true });
    const after = fs.statSync(target).size;
    if (after >= before) {
      fs.unlinkSync(target);
      continue;
    }
    conversions.set(file, output);
    textures.push({ file, output, quality, before, after });
  }
  return { conversions, textures };
}

function encodeMusic(ffmpeg, original, target) {
  execFileSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', original,
    '-map', '0:a:0', '-map_metadata', '0', '-c:a', 'libvorbis', '-q:a', '3', target], { windowsHide: true });
  const before = fs.statSync(original).size;
  const after = fs.statSync(target).size;
  if (after < before) return { before, after };
  fs.copyFileSync(original, target);
  return null;
}

function prepareRelease(root, output, { cwebp, ffmpeg } = {}) {
  if (readJson(path.join(root, 'project.json')).version !== '2.4.13') throw new Error('Expected a Cocos Creator 2.4.13 project.');
  const requested = path.resolve(output);
  const parent = fs.realpathSync(path.dirname(requested));
  const destination = path.join(parent, path.basename(requested));
  const relative = path.relative(root, destination);
  if (!relative || (!path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..')) {
    throw new Error('The release copy must be outside the source project.');
  }
  if (fs.existsSync(destination)) throw new Error('Choose a new output directory: ' + destination);
  if (cwebp) execFileSync(cwebp, ['-version'], { windowsHide: true });
  if (ffmpeg) execFileSync(ffmpeg, ['-version'], { windowsHide: true });
  const revision = sourceRevision(root);
  const plan = planRelease(path.join(root, 'assets'));
  fs.mkdirSync(destination);
  const { conversions, textures } = cwebp ? convertTextures(root, destination, plan, cwebp) : { conversions: new Map(), textures: [] };
  const music = [];
  for (const file of plan.included) {
    if (conversions.has(file)) continue;
    const original = path.join(root, 'assets', file);
    const texture = file.endsWith('.meta') && conversions.get(file.slice(0, -5));
    const target = path.join(destination, 'assets', texture ? texture + '.meta' : file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (conversions.size && /\.(?:atlas(?:\.txt)?|plist)$/i.test(file)) {
      const text = fs.readFileSync(original, 'utf8');
      fs.writeFileSync(target, retargetAtlas(text, file, conversions), { flag: 'wx' });
    } else if (ffmpeg && /^KinghtFallAudio\/music\/[^/]+\.ogg$/.test(file)) {
      const sizes = encodeMusic(ffmpeg, original, target);
      if (sizes) music.push({ file, ...sizes });
    } else fs.copyFileSync(original, target, fs.constants.COPYFILE_EXCL);
  }
  for (const entry of projectEntries) {
    const source = path.join(root, entry);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, entry), { recursive: true, errorOnExist: true, force: false });
  }
  if (sourceRevision(root) !== revision) throw new Error('Project inputs changed during preparation. Run again with a fresh output directory.');
  const removedBytes = plan.removed.reduce((sum, entry) => sum + entry.bytes, 0);
  const textureBytesSaved = textures.reduce((sum, entry) => sum + entry.before - entry.after, 0);
  const musicBytesSaved = music.reduce((sum, entry) => sum + entry.before - entry.after, 0);
  const report = { sourceBytes: plan.sourceBytes, stagedBytes: plan.sourceBytes - removedBytes - textureBytesSaved - musicBytesSaved,
    removedBytes, textureBytesSaved, musicBytesSaved, groups: plan.groups, textures, music, removed: plan.removed };
  fs.writeFileSync(path.join(destination, 'android-asset-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { destination, removedFiles: plan.removed.length, removedBytes, textures: textures.length, textureBytesSaved,
    tracks: music.length, musicBytesSaved };
}

if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string' }, cwebp: { type: 'string' }, ffmpeg: { type: 'string' }, help: { type: 'boolean' } } });
    if (values.help || !values.out) {
      console.log('Usage: node tools/native/prepare-android-release.cjs --out <new external directory> [--cwebp <path>] [--ffmpeg <path>]');
      process.exitCode = values.help ? 0 : 1;
    } else {
      const result = prepareRelease(fs.realpathSync(projectRoot), values.out, values);
      console.log(`Prepared ${result.destination}\nExcluded ${result.removedFiles} files (${(result.removedBytes / 1e6).toFixed(1)} MB of source assets).`);
      if (result.textures) console.log(`Encoded ${result.textures} textures as WebP (saved ${(result.textureBytesSaved / 1e6).toFixed(1)} MB).`);
      if (result.tracks) console.log(`Re-encoded ${result.tracks} music tracks as Vorbis (saved ${(result.musicBytesSaved / 1e6).toFixed(1)} MB).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { planRelease, prepareRelease, retargetAtlas, encodeMusic };
