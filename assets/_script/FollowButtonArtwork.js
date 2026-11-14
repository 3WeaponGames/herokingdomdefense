"use strict";

// Rally and Follow use plain dark circles behind their white pictograms.
// A cyan rim identifies an enabled command without the old baked gold artwork.
function activeRim() {
  var size = 256, pixels = new Uint8Array(size * size * 4), scale = size / 128;
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    var dx = x + .5 - size / 2, dy = y + .5 - size / 2, radius = Math.sqrt(dx * dx + dy * dy) / scale;
    var coverage = Math.max(0, Math.min(1, (52 - radius) * scale + .5)) *
      Math.max(0, Math.min(1, (radius - 45) * scale + .5)), i = (y * size + x) * 4;
    pixels[i] = 31; pixels[i + 1] = 204; pixels[i + 2] = 241; pixels[i + 3] = Math.round(255 * coverage);
  }
  // Analytic edge coverage and mipmaps keep this thin rim smooth in both the
  // browser and native renderer, without blurring or recoloring the artwork.
  var texture = new cc.Texture2D();
  texture.genMipmaps = true;
  texture.initWithData(pixels, cc.Texture2D.PixelFormat.RGBA8888, size, size);
  texture.setFilters(cc.Texture2D.Filter.LINEAR, cc.Texture2D.Filter.LINEAR);
  texture.update({ mipFilter: cc.Texture2D.Filter.LINEAR });
  return { texture: texture, frame: new cc.SpriteFrame(texture) };
}

exports.install = function (button) {
  if (!button || button._armyButtonArtwork) return;
  var idle = button.getChildByName("ndTag1"), active = button.getChildByName("ndTag2");
  if (!idle || !active || !idle.getComponent(cc.Sprite) || !active.getComponent(cc.Sprite)) return;
  var backgrounds = [];
  [idle, active].forEach(function (node) {
    var sprite = node.getComponent(cc.Sprite);
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = null; sprite.enabled = false;
    node.setContentSize(104, 104);
    var background = new cc.Node("CommandFace");
    background.parent = node;
    background.setContentSize(104, 104);
    var g = background.addComponent(cc.Graphics);
    g.clear();
    g.fillColor = cc.color(36, 45, 57); g.circle(0, 0, 52); g.fill();
    backgrounds.push(background);
  });
  var rim = activeRim(), highlight = new cc.Node("CommandActiveRim");
  highlight.parent = active;
  var sprite = highlight.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.spriteFrame = rim.frame;
  highlight.setContentSize(128, 128);
  rim.sprite = sprite; rim.highlight = highlight; rim.backgrounds = backgrounds; button._armyButtonArtwork = rim;
  // Gameplay initializes both commands inactive; the first frame agrees.
  idle.active = true; active.active = false;
};

exports.dispose = function (button) {
  var rim = button && button._armyButtonArtwork;
  if (!rim) return;
  rim.sprite.spriteFrame = null;
  rim.backgrounds.concat(rim.highlight).forEach(function (node) { node.active = false; node.destroy(); });
  rim.frame.destroy(); rim.texture.destroy();
  button._armyButtonArtwork = null;
};
