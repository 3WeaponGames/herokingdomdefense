"use strict";
var LanguageMgr = require("LanguageMgr").LanguageMgr;
// Add this component to new UI text and choose a key in the Translation Tables panel.
cc.Class({
  extends: cc.Component,
  editor: { menu: "Localization/Localized Label" },
  properties: {
    key: { default: "", tooltip: "Stable ID from Localization > Translation Tables" },
    parameters: { default: "{}", multiline: true, tooltip: "JSON parameters, e.g. {\"0\": 5}" }
  },
  onLoad: function () { this.refresh(); },
  refresh: function () {
    var label = this.getComponent(cc.Label) || this.getComponent(cc.RichText);
    if (!label || !this.key) return;
    var parameters;
    try { parameters = JSON.parse(this.parameters); }
    catch (error) { cc.error("Invalid localization parameters", this.node.name, error); return; }
    LanguageMgr.getInstance().bindLabel(label, this.key, parameters);
  },
  setParameters: function (parameters) {
    this.parameters = JSON.stringify(parameters);
    this.refresh();
  }
});
