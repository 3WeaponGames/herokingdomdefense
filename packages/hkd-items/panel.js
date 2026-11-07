'use strict';
const fs=require('fs'),path=require('path');
Editor.Panel.extend({
  template:'<div id="characters"></div>',style:fs.readFileSync(path.join(__dirname,'../hkd-characters/style.css'),'utf8'),$:{root:'#characters'},
  ready(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;this._client=require('../hkd-characters/client').mount(this.$root,{
    kind:'items',ipc:(message,payload)=>new Promise((resolve,reject)=>Editor.Ipc.sendToMain('hkd-items:'+message,payload,(error,result)=>error?reject(Error(error)):resolve(result))),
    image:file=>require('url').pathToFileURL(path.join(root,file)).href,runtime:description=>require(description.runtimePath),renderer:require('../game-data-editor/preview/spine-renderer'),core:require('../../assets/_script/CharacterPartsCore'),
    openEquipment:()=>Editor.Ipc.sendToMain('hkd-items:equipment')
  });},close(){if(this._client)this._client.destroy();}
});
