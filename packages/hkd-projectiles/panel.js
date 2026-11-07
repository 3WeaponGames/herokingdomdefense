'use strict';
const fs=require('fs'),path=require('path');
Editor.Panel.extend({template:'<div id="projectiles"></div>',style:fs.readFileSync(path.join(__dirname,'style.css'),'utf8'),$:{root:'#projectiles'},
  ready(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;this._client=require('./client').mount(this.$root,{
    ipc:(name,request)=>new Promise((resolve,reject)=>Editor.Ipc.sendToMain('hkd-projectiles:'+name,request,(error,result)=>error?reject(Error(error)):resolve(result))),
    image:file=>require('url').pathToFileURL(path.join(root,file)).href,runtime:description=>require(description.runtimePath),renderer:require('../game-data-editor/preview/spine-renderer')
  });},close(){if(this._client)this._client.destroy();}
});
