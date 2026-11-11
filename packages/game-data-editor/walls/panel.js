'use strict';
const Client = require('./client');
function ipc(message, payload) {
  return new Promise((resolve, reject) => {
    const args = ['game-data-editor:' + message];
    if (payload !== undefined) args.push(payload);
    args.push((error, value) => error ? reject(new Error(String(error))) : resolve(value));
    Editor.Ipc.sendToMain.apply(Editor.Ipc, args);
  });
}
function create() {
  return Editor.Panel.extend({
    template: '<div id="wall-adjustments-host" style="height:100%;min-height:0;display:flex"></div>',
    style: Client.style,
    $: {host: '#wall-adjustments-host'},
    ready() {this._wallClient = Client.mount(this.$host, {ipc});},
    run() {if (this._wallClient) this._wallClient.focus();},
    close() {if (this._wallClient) this._wallClient.destroy(); this._wallClient = null;}
  });
}
module.exports = {create};
