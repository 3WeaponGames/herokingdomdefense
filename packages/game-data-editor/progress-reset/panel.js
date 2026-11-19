'use strict';
const Client=require('./client');
function ipc(message,payload){return new Promise((resolve,reject)=>{const args=['game-data-editor:'+message];if(payload!==undefined)args.push(payload);args.push((error,value)=>error?reject(Error(String(error))):resolve(value));Editor.Ipc.sendToMain.apply(Editor.Ipc,args);});}
function create(){return Editor.Panel.extend({
  template:'<div id="progress-reset-host" style="height:100%;overflow:auto"></div>',style:Client.style,$:{host:'#progress-reset-host'},
  ready(){this._resetClient=Client.mount(this.$host,{ipc});},
  close(){if(this._resetClient)this._resetClient.destroy();this._resetClient=null;}
});}
module.exports={create};
