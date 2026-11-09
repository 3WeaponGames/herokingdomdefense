/* Browser-side deterministic map compositor. Inputs are production sprites. */
(function () {
  'use strict';
  function canvas(width, height) { var c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
  function region(x, y) {
    if (x < .20 && y < .66) return 'ravine';
    if (y > .715 && x < .48) return 'southwest';
    if (y > .74 && x > .5) return 'southeast';
    if (y > .625 && y < .75 && x > .52) return 'south-ridge';
    if (y > .515 && y < .75 && x < .52) return 'west-grove';
    if (x > .77 && y > .31) return 'east-lower';
    if (x > .77 && y > .12) return 'east-upper';
    if (x > .17 && x < .62 && y > .065 && y < .27) return 'island';
    return 'north';
  }
  function picture(url) { return new Promise(function (resolve, reject) { var image = new Image(); image.onload = function () { resolve(image); }; image.onerror = function () { reject(Error('Cannot read sprite: ' + url)); }; image.src = url; }); }
  window.bakeMap = async function (spec) {
    var images = {}, keys = Object.keys(spec.images);
    await Promise.all(keys.map(async function (key) { images[key] = await picture('/input/' + key); }));
    var width = spec.width, height = spec.height, ground = canvas(width, height), ctx = ground.getContext('2d');
    ctx.filter = 'brightness(' + spec.groundBrightness + ')'; ctx.fillStyle = ctx.createPattern(images.Field_Fire, 'repeat'); ctx.fillRect(0, 0, width, height); ctx.filter = 'none';
    if (spec.groundTint) { ctx.save(); ctx.globalAlpha = spec.groundTint.opacity; ctx.fillStyle = spec.groundTint.color; ctx.fillRect(0, 0, width, height); ctx.restore(); }
    var randomState = spec.seed >>> 0;
    function random() { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 4294967296; }
    // Recovery can retain the exact authored road artwork in an editable pass
    // rather than flattening it permanently into the hidden foundation.
    var roadCanvas = spec.separateRoads ? canvas(width, height) : null, roadCtx = roadCanvas ? roadCanvas.getContext('2d') : ctx;
    roadCtx.save(); roadCtx.filter = 'brightness(1.1)'; roadCtx.globalAlpha = .35; roadCtx.strokeStyle = roadCtx.createPattern(images.Road_Fire, 'repeat'); roadCtx.lineCap = 'round'; roadCtx.lineJoin = 'round';
    spec.paths.forEach(function (points) { roadCtx.beginPath(); points.forEach(function (p, i) { if (i) roadCtx.lineTo(p[0] * width, p[1] * height); else roadCtx.moveTo(p[0] * width, p[1] * height); }); roadCtx.lineWidth = 125; roadCtx.stroke(); }); roadCtx.restore();
    roadCtx.save(); roadCtx.filter = 'brightness(1.2)'; roadCtx.globalAlpha = .2; roadCtx.fillStyle = roadCtx.createPattern(images.Road_Fire, 'repeat');
    for (var i = 0; i < 78; i++) { var x = random() * width, y = random() * height, w = 35 + random() * 120, h = 16 + random() * 32; roadCtx.beginPath(); roadCtx.moveTo(x - w / 2, y); roadCtx.lineTo(x, y - h / 2); roadCtx.lineTo(x + w / 2, y); roadCtx.lineTo(x + w * .15, y + h / 2); roadCtx.lineTo(x - w * .4, y + h * .2); roadCtx.closePath(); roadCtx.fill(); } roadCtx.restore();
    function drawProp(context, prop, left, top) {
      var image = images[prop.image], w = prop.width || prop.height * image.width / image.height, h = prop.height || prop.width * image.height / image.width;
      var px = prop.x * width, py = prop.y * height;
      context.save(); context.translate(px - left, py - top); if (prop.flip) context.scale(-1, 1); context.globalAlpha = prop.opacity === undefined ? 1 : prop.opacity;
      context.drawImage(image, -w / 2, -h, w, h); context.restore();
    }
    var props = spec.props.map(function (prop) { var p = Object.assign({}, prop); p.region = prop.region || region(prop.x, prop.y); return p; });
    props.filter(function (p) { return p.layer === 'ground'; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (p) { drawProp(ctx, p, 0, 0); });
    var atlas = images.terrain, ac = canvas(atlas.width, atlas.height), actx = ac.getContext('2d'); actx.drawImage(atlas, 0, 0);
    var pixels = actx.getImageData(0, 0, ac.width, ac.height), masks = {}, extents = {};
    spec.owners.forEach(function (owner) { masks[owner.key] = actx.createImageData(ac.width, ac.height); extents[owner.key] = { minX: ac.width, minY: ac.height, maxX: -1, maxY: -1 }; });
    for (var py = 0; py < ac.height; py++) for (var px = 0; px < ac.width; px++) {
      var offset = (py * ac.width + px) * 4;
      if (pixels.data[offset + 3] <= 2) continue;
      var key = region((px + .5) / ac.width, (py + .5) / ac.height), targets = [key];
      // One source-pixel overlap on opaque shared edges prevents interpolation
      // from revealing ground between two otherwise adjoining terrain pieces.
      if (pixels.data[offset + 3] >= 240) [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]].forEach(function (p) {
        if (p[0] < 0 || p[1] < 0 || p[0] >= ac.width || p[1] >= ac.height || pixels.data[(p[1] * ac.width + p[0]) * 4 + 3] <= 2) return;
        var adjacent = region((p[0] + .5) / ac.width, (p[1] + .5) / ac.height); if (targets.indexOf(adjacent) < 0) targets.push(adjacent);
      });
      targets.forEach(function (target) {
        var mask = masks[target], extent = extents[target];
        for (var channel = 0; channel < 4; channel++) mask.data[offset + channel] = pixels.data[offset + channel];
        extent.minX = Math.min(extent.minX, px); extent.minY = Math.min(extent.minY, py); extent.maxX = Math.max(extent.maxX, px); extent.maxY = Math.max(extent.maxY, py);
      });
    }
    var files = [], layers = [], padding = 14;
    function add(file, name, info) { files.push(Object.assign({ name: name, width: file.width, height: file.height, png: file.toDataURL('image/png') }, info)); }
    for (var row = 0; row < 2; row++) for (var column = 0; column < 2; column++) {
      var tile = canvas(width / 2, height / 2); tile.getContext('2d').drawImage(ground, column * width / 2, row * height / 2, width / 2, height / 2, 0, 0, tile.width, tile.height);
      add(tile, 'stage07-ground-' + (row * 2 + column + 1) + '.png', { role: 'ground', tile: row * 2 + column + 1 });
      if (roadCanvas) {
        var roadTile = canvas(width / 2, height / 2); roadTile.getContext('2d').drawImage(roadCanvas, column * width / 2, row * height / 2, width / 2, height / 2, 0, 0, roadTile.width, roadTile.height);
        add(roadTile, 'stage07-roads-' + (row * 2 + column + 1) + '.png', { role: 'roads', tile: row * 2 + column + 1 });
      }
    }
    for (var owner of spec.owners) {
      var e = extents[owner.key], selected = props.filter(function (p) { return p.layer !== 'ground' && p.region === owner.key; });
      var minX = e.minX / ac.width * width, minY = e.minY / ac.height * height, maxX = (e.maxX + 1) / ac.width * width, maxY = (e.maxY + 1) / ac.height * height;
      selected.forEach(function (p) { var image = images[p.image], w = p.width || p.height * image.width / image.height, h = p.height || p.width * image.height / image.width; minX = Math.min(minX, p.x * width - w / 2); maxX = Math.max(maxX, p.x * width + w / 2); minY = Math.min(minY, p.y * height - h); maxY = Math.max(maxY, p.y * height); });
      minX = Math.floor(minX - padding); minY = Math.floor(minY - padding); maxX = Math.ceil(maxX + padding); maxY = Math.ceil(maxY + padding);
      var baked = canvas(maxX - minX, maxY - minY), context = baked.getContext('2d'), maskCanvas = canvas(ac.width, ac.height);
      maskCanvas.getContext('2d').putImageData(masks[owner.key], 0, 0);
      context.drawImage(maskCanvas, -minX, -minY, width, height);
      selected.sort(function (a, b) { return a.y - b.y; }).forEach(function (p) { drawProp(context, p, minX, minY); });
      if (baked.width > 2048 || baked.height > 2048) throw Error(owner.key + ' exceeds the 2048 texture limit: ' + baked.width + 'x' + baked.height);
      var groundY = Math.min(owner.groundY, ...selected.map(function (p) { return height / 2 - p.y * height; }));
      var info = { role: 'obstacle', owner: owner.id, key: owner.key, center: { x: (minX + maxX) / 2 - width / 2, y: height / 2 - (minY + maxY) / 2 }, ground: { x: owner.x, y: groundY }, props: selected.length };
      add(baked, 'stage07-' + owner.key + '.png', info); layers.push({ image: baked, minX: minX, minY: minY, groundY: groundY });
    }
    var preview = canvas(width, height), pc = preview.getContext('2d'); pc.drawImage(ground, 0, 0); if (roadCanvas) pc.drawImage(roadCanvas, 0, 0);
    layers.sort(function (a, b) { return b.groundY - a.groundY; }).forEach(function (layer) { pc.drawImage(layer.image, layer.minX, layer.minY); });
    var thumbnail = null;
    if (spec.thumbnail) {
      var thumb = canvas(spec.thumbnail.width, spec.thumbnail.height), tc = thumb.getContext('2d');
      // A small stage-selection diorama made from the same production inputs.
      function platform(bottom) { tc.beginPath(); tc.moveTo(29, 132); tc.lineTo(404, 132); tc.lineTo(404, bottom - 24); tc.quadraticCurveTo(404, bottom, 380, bottom); tc.lineTo(53, bottom); tc.quadraticCurveTo(29, bottom, 29, bottom - 24); tc.closePath(); }
      platform(359); tc.fillStyle = '#554046'; tc.fill(); tc.strokeStyle = '#16111b'; tc.lineWidth = 6; tc.stroke();
      platform(339); tc.fillStyle = '#83666c'; tc.fill(); tc.save(); tc.clip(); tc.globalAlpha = .45; tc.fillStyle = tc.createPattern(images.Field_Fire, 'repeat'); tc.fillRect(0, 0, thumb.width, thumb.height); tc.restore();
      tc.drawImage(images.Stone_Fire_Dark_09, 52, 96, 185, 124);
      tc.drawImage(images.Stone_Fire_Dark_06, 142, 62, 135, 124);
      [['Tree_Fire_Bare_04', 278, 49, 92, 185], ['Tree_Fire_Dead_02', 60, 202, 55, 93], ['Stone_Fire_Red_06', 252, 244, 62, 42], ['Fire_Texture_09', 166, 280, 70, 35]].forEach(function (p) { tc.drawImage(images[p[0]], p[1], p[2], p[3], p[4]); });
      thumbnail = thumb.toDataURL('image/png');
    }
    return { files: files, preview: preview.toDataURL('image/png'), thumbnail: thumbnail, props: props.length, atlas: { width: ac.width, height: ac.height } };
  };
}());
