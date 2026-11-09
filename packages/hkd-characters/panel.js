'use strict';
const fs=require('fs'),path=require('path');
Editor.Panel.extend({
  template:'<div id="characters"></div>',
  style:fs.readFileSync(path.join(__dirname,'style.css'),'utf8'),
  $:{root:'#characters'},
  ready(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;const api={
    ipc:(message,payload)=>new Promise((resolve,reject)=>Editor.Ipc.sendToMain('hkd-characters:'+message,payload,(error,result)=>error?reject(Error(error)):resolve(result))),
    image:file=>require('url').pathToFileURL(path.join(root,file)).href,
    runtime:description=>require(description.runtimePath),
    renderer:require('../game-data-editor/preview/spine-renderer'),core:require('../../assets/_script/CharacterPartsCore')
  };this._api=api;this._closed=false;this._client=require('./client').mount(this.$root,api);if(this._focusAvailable)this._claimFocus();},
  _claimFocus(){if(this._closed)return;if(!this._client){this._focusAvailable=true;return;}this._focusAvailable=false;this._api.ipc('take-focus').then(target=>{if(!this._closed&&target)return this._client.focusUnit(target);}).catch(error=>Editor.warn('Characters: '+error.message));},
  messages:{'hkd-characters:focus-available'(){this._claimFocus();}},
  close(){this._closed=true;if(this._client)this._client.destroy();}
});
