'use strict';
const fs = require('fs'), path = require('path'), URL = require('url');
Editor.Panel.extend({
  template: '<div id="skills"></div>',
  style: fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'),
  $: { root: '#skills' },
  ready() {
    const root = Editor.Project && Editor.Project.path || Editor.projectPath;
    this._client = require('./client').mount(this.$root, {
      ipc: (message, request) => new Promise((resolve, reject) => Editor.Ipc.sendToMain('hkd-skills:' + message, request,
        (error, result) => error ? reject(Error(error)) : resolve(result))),
      runtime: description => require(description.runtimePath),
      renderer: require('../game-data-editor/preview/spine-renderer'),
      core: require('../../assets/_script/HeroStyleSkills'),
      settings: require('../../assets/_script/HeroSkillSettings'),
      createPreview: require('./preview').create,
      createAudio: () => document.createElement('audio'),
      audioURL: value => {
        if (value && value.url) return value.url;
        const normalized = String(value && value.file || value).replace(/\\/g, '/');
        return URL.pathToFileURL(path.isAbsolute(normalized) ? normalized : path.join(root, normalized.startsWith('assets/') ? normalized : 'assets/resources/' + normalized)).href;
      }
    });
  },
  close() { if (this._client) this._client.destroy(); }
});
