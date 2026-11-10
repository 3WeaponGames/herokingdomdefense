'use strict';
const path = require('path'), { SoundService } = require('./service');
let service;
function current() {
  const root = path.resolve(Editor.Project && Editor.Project.path || Editor.projectPath);
  if (!service || service.root !== root) service = new SoundService(root);
  return service;
}
function reply(event, action) { Promise.resolve().then(action).then(result => event.reply(null, result), error => event.reply(error.message)); }
const messages = { open() { Editor.Panel.open('hkd-sounds'); } };
for (const name of ['load', 'mark', 'save', 'discard']) messages[name] = (event, request) => reply(event, () => {
  const result = current()[name](request);
  if (name !== 'load' && Editor.Ipc && Editor.Ipc.sendToAll) Editor.Ipc.sendToAll('hkd-sounds:changed', { version: result.version });
  return result;
});
messages.reveal = (event, request) => reply(event, () => {
  const item = current().asset(request);
  if (!item.uuid) throw Error('Creator has not imported this sound yet.');
  Editor.Selection.select('asset', item.uuid); return { selected: true };
});
module.exports = { load() {}, unload() { if (service && service.dirty()) Editor.warn('Sound checklist changes are still in drafts. Save Checklist before unloading Sound Editor.'); service = null; }, messages };
