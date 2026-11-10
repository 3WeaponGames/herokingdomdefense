'use strict';
const fs = require('fs'), path = require('path');
Editor.Panel.extend({
  template: '<div id="sound-editor"></div>',
  style: fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'),
  $: { root: '#sound-editor' },
  ready() {
    const project = Editor.Project && Editor.Project.path || Editor.projectPath;
    this._client = require('./client').mount(this.$root, {
      ipc: (name, request) => new Promise((resolve, reject) => Editor.Ipc.sendToMain('hkd-sounds:' + name, request,
        (error, result) => error ? reject(Error(error)) : resolve(result))),
      url: item => require('url').pathToFileURL(path.join(project, item.file)).href,
      createAudio: () => document.createElement('audio'),
      confirm: message => window.confirm(message)
    });
  },
  messages: { 'hkd-sounds:changed'(_event, value) { if (this._client) this._client.changed(value); } },
  close() { if (this._client) this._client.destroy(); }
});
