"use strict";

// Opt-in text panels. Decorative cards, progress bars and icon buttons keep
// their own geometry; each attached panel declares only its real content.
cc.Class({
  extends: cc.Component,
  properties: {
    content: { default: [], type: [cc.Node] },
    paddingX: 16,
    paddingY: 10,
    gap: 8,
    minWidth: 0,
    minHeight: 0,
    maxWidth: 700,
    ribbonTitle: false,
    ribbonCenterY: 0.12,
    reflowRows: true,
    columnMode: false,
    paragraph: { default: null, type: cc.Node },
    footer: { default: null, type: cc.Node },
    mirrorBackgrounds: { default: [], type: [cc.Node] }
  },
  onLoad: function () {
    this._labels = [];
    this._watched = [];
    this._rows = [];
    var self = this;
    function visit(node) {
      if (!node || self._watched.indexOf(node) !== -1) return;
      self._watched.push(node);
      node.on(cc.Node.EventType.SIZE_CHANGED, self.invalidate, self);
      node.on(cc.Node.EventType.SCALE_CHANGED, self.invalidate, self);
      node.on(cc.Node.EventType.POSITION_CHANGED, self.invalidate, self);
      var label = node.getComponent(cc.Label) || node.getComponent(cc.RichText);
      if (label) self._labels.push(label);
      // RichText fragments belong to the RichText renderer.
      if (!(label instanceof cc.RichText)) node.children.forEach(visit);
    }
    this.content.forEach(function (node) {
      visit(node);
      var row = self._rows.find(function (candidate) { return Math.abs(candidate.y - node.y) < 16; });
      if (!row) self._rows.push(row = { y: node.y, nodes: [] });
      row.nodes.push(node);
    });
    this._rows.sort(function (a, b) { return b.y - a.y; });
    this._rows.forEach(function (row) { row.nodes.sort(function (a, b) { return a.x - b.x; }); });
    var layout = this.node.getComponent(cc.Layout);
    if (layout) layout.enabled = false;
    var sprite = this.node.getComponent(cc.Sprite);
    if (sprite) {
      var frameName = sprite.spriteFrame && sprite.spriteFrame.name;
      if (/^wg_(zy_pd|gxhd_pd|jzfz_bt|tf_bt|tf_pd|txz_ptd|txz_gjd|txz_djbtd)$/.test(frameName || "")) this.ribbonTitle = true;
      if (/^wg_txz_(ptd|gjd|djbtd)$/.test(frameName || "")) {
        if (this.ribbonCenterY === 0.12) this.ribbonCenterY = 0.18;
        this.minHeight = Math.max(this.minHeight, frameName === "wg_txz_djbtd" ? 128 : 112);
        if (frameName !== "wg_txz_djbtd" && this.minWidth === 0 && this.maxWidth === 700) { this.minWidth = 369; this.maxWidth = 369; }
      }
      sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      sprite.type = cc.Sprite.Type.SLICED;
    }
    this.invalidate();
  },
  onEnable: function () { this.invalidate(); },
  onDestroy: function () {
    var self = this;
    (this._watched || []).forEach(function (node) {
      if (!cc.isValid(node)) return;
      node.off(cc.Node.EventType.SIZE_CHANGED, self.invalidate, self);
      node.off(cc.Node.EventType.SCALE_CHANGED, self.invalidate, self);
      node.off(cc.Node.EventType.POSITION_CHANGED, self.invalidate, self);
    });
  },
  invalidate: function () { if (!this._fitting) this._dirty = true; },
  lateUpdate: function () {
    if (!this._labels) return;
    // Text can change without a size event while a localization SHRINK rule
    // is active. Only measure/layout when copy, visibility or size changes.
    var signature = [this.paddingX, this.paddingY, this.gap, this.minWidth, this.minHeight, this.maxWidth, this.reflowRows, this.ribbonTitle, this.ribbonCenterY].join(":") +
      this.content.map(function (n) { return n.active + ":" + n.scaleX + ":" + n.scaleY; }).join("|") +
      this._labels.map(function (l) { return l.string + ":" + l.fontSize + ":" + l.lineHeight + ":" + l.node.activeInHierarchy; }).join("|");
    if (!this._dirty && signature === this._signature) return;
    this.fit();
    this._signature = signature;
  },
  _prepare: function (node, available) {
    if (!node.active) return;
    var scale = Math.abs(node.scaleX) || 1;
    var label = node.getComponent(cc.Label);
    var rich = node.getComponent(cc.RichText);
    if (label) {
      label.overflow = cc.Label.Overflow.NONE;
      label.enableWrapText = false;
      label._forceUpdateRenderData();
      if (node.width * scale > available) {
        label.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        node.width = available / scale;
        label._forceUpdateRenderData();
      }
    } else if (rich) {
      rich.maxWidth = 0;
      if (node.width * scale > available) rich.maxWidth = available / scale;
    } else {
      var self = this;
      node.children.forEach(function (child) { self._prepare(child, available / scale); });
      var layout = node.getComponent(cc.Layout);
      if (layout) {
        layout.updateLayout();
        if (layout.type === cc.Layout.Type.HORIZONTAL && node.width * scale > available) {
          this._fitRow(node.children.filter(function (child) { return child.active; }), available / scale,
            layout.spacingX || 0);
          layout.updateLayout();
        }
      }
    }
  },
  _fitRow: function (nodes, limit, gap) {
    var self = this, fixed = Math.max(0, nodes.length - 1) * gap, flexible = [];
    nodes.forEach(function (node) {
      var width = node.width * Math.abs(node.scaleX);
      var hasLabel = self._labels.some(function (label) {
        for (var parent = label.node; parent; parent = parent.parent) if (parent === node) return true;
        return false;
      });
      if (hasLabel) flexible.push({ node: node, width: width });
      else fixed += width;
    });
    var total = flexible.reduce(function (sum, item) { return sum + item.width; }, 0);
    if (total + fixed > limit) flexible.forEach(function (item) {
      self._prepare(item.node, Math.max(16, (limit - fixed) * item.width / total));
    });
  },
  _positionContent: function (node, x, y) {
    if (this.ribbonTitle && node.parent !== this.node && node.parent === this.node.parent) {
      node.setPosition(this.node.x + x * this.node.scaleX, this.node.y + y * this.node.scaleY);
    } else node.setPosition(x, y);
  },
  fit: function () {
    if (!this._rows || this._fitting) return;
    this._fitting = true;
    try {
      if (this.columnMode && this.paragraph) {
        var paragraph = this.paragraph, footer = this.footer;
        var text = paragraph.getComponent(cc.Label);
        if (text) text._forceUpdateRenderData();
        var textHeight = paragraph.height * Math.abs(paragraph.scaleY);
        var footerHeight = footer && footer.active ? footer.height * Math.abs(footer.scaleY) : 0;
        var blockHeight = textHeight + (footerHeight ? this.gap + footerHeight : 0);
        var height = Math.ceil(Math.max(this.minHeight, blockHeight + this.paddingY * 2));
        this.node.height = height;
        paragraph.y = height / 2 - this.paddingY - (1 - paragraph.anchorY) * textHeight;
        if (footer) footer.y = -height / 2 + this.paddingY + footer.anchorY * footerHeight;
        this.mirrorBackgrounds.forEach(function (node) { if (cc.isValid(node)) node.height = height; });
        return;
      }
      var sprite = this.node.getComponent(cc.Sprite), frame = sprite && sprite.spriteFrame;
      // The folded tails are outside the ribbon's usable front face.
      var tails = this.ribbonTitle && frame && !/^wg_txz_/.test(frame.name || "") ? (frame.insetLeft || 0) + (frame.insetRight || 0) : 0;
      var self = this, limit = Math.max(32, this.maxWidth - tails - 2 * this.paddingX);
      var rows = this._rows.map(function (row) {
        var nodes = row.nodes.filter(function (node) { return node.active; });
        nodes.forEach(function (node) { self._prepare(node, 1000000); });
        var gaps = Math.max(0, nodes.length - 1) * self.gap;
        self._fitRow(nodes, limit, self.gap);
        return { nodes: nodes, width: nodes.reduce(function (sum, n) { return sum + n.width * Math.abs(n.scaleX); }, gaps),
          height: nodes.reduce(function (height, n) { return Math.max(height, n.height * Math.abs(n.scaleY)); }, 0) };
      }).filter(function (row) { return row.nodes.length; });
      if (!rows.length) return;
      var width = 0, height = 0;
      if (this.reflowRows) {
        height = rows.reduce(function (sum, row) { return sum + row.height; }, Math.max(0, rows.length - 1) * this.gap);
        var y = height / 2;
        rows.forEach(function (row) {
          var x = -row.width / 2, centerY = y - row.height / 2;
          width = Math.max(width, row.width);
          row.nodes.forEach(function (node) {
            var w = node.width * Math.abs(node.scaleX), h = node.height * Math.abs(node.scaleY);
            self._positionContent(node, x + node.anchorX * w, centerY + (node.anchorY - 0.5) * h);
            x += w + self.gap;
          });
          y -= row.height + self.gap;
        });
      } else {
        rows.forEach(function (row) { row.nodes.forEach(function (node) {
          var box = node.getBoundingBox();
          width = Math.max(width, 2 * Math.abs(box.x), 2 * Math.abs(box.x + box.width));
          height = Math.max(height, 2 * Math.abs(box.y), 2 * Math.abs(box.y + box.height));
        }); });
      }
      var fittedHeight = Math.ceil(Math.max(this.minHeight, height + 2 * this.paddingY));
      this.node.setContentSize(Math.ceil(Math.max(this.minWidth, width + tails + 2 * this.paddingX)), fittedHeight);
      if (this.ribbonTitle && this.reflowRows) rows.forEach(function (row) {
        row.nodes.forEach(function (node) { node.y += fittedHeight * self.ribbonCenterY * (node.parent === self.node ? 1 : self.node.scaleY); });
      });
    } finally { this._fitting = false; this._dirty = false; }
  }
});
