'use strict';
const fs=require('fs'),path=require('path');
Editor.Panel.extend({template:'<div id="projectiles"></div>',style:require('../game-data-editor/panel/control-theme')(fs.readFileSync(path.join(__dirname,'style.css'),'utf8')),$:{root:'#projectiles'},
  ready(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;this._closed=false;this._api={
    ipc:(name,request)=>new Promise((resolve,reject)=>Editor.Ipc.sendToMain('hkd-projectiles:'+name,request,(error,result)=>error?reject(Error(error)):resolve(result))),
    image:file=>require('url').pathToFileURL(path.join(root,file)).href,runtime:description=>require(description.runtimePath),renderer:require('../game-data-editor/preview/spine-renderer')
  };this._client=require('./client').mount(this.$root,this._api);if(this._focusAvailable)this._claimFocus();},
  _claimFocus(){if(this._closed)return;if(!this._client){this._focusAvailable=true;return;}this._focusAvailable=false;this._api.ipc('take-focus').then(target=>{if(!this._closed&&target)return this._client.focusUnit(target);}).catch(error=>Editor.warn('Projectiles: '+error.message));},
  messages:{'hkd-projectiles:focus-available'(){this._claimFocus();}},
  close(){this._closed=true;if(this._client)this._client.destroy();}
});
