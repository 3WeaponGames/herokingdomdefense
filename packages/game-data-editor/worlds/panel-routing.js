'use strict';
const PANEL_ID='hkd-maps';
function isWorld(kind){return kind==='maps'||kind==='stages';}
function open(Editor,kind,request){
 if(!isWorld(kind))throw Error('Choose Maps or Stages.');
 const argv={view:kind};if(request&&request.mapId!==undefined){if(kind!=='maps'||typeof request.mapId!=='string'||!request.mapId)throw Error('Choose a valid map.');argv.mapId=request.mapId;}
 // Creator calls run(argv) both after ready and when focusing an existing panel.
 Editor.Panel.open(PANEL_ID,argv);
 if(request&&request.closeLegacy)Editor.Panel.close('hkd-stages');
 return true;
}
function createLegacy(Editor){
 return Editor.Panel.extend({
  template:'<div id="status">Opening Maps &amp; Stages…</div><button id="retry" hidden>Retry</button>',
  style:':host{padding:12px;color:#c8c8c8;background:#303030;font:12px Arial}button[hidden]{display:none}',
  $:{status:'#status',retry:'#retry'},
  ready(){this._closed=false;this.$retry.onclick=()=>this._redirect();this._redirect();},
  _redirect(){if(this._closed||this._redirecting)return;this._redirecting=true;this.$retry.hidden=true;Editor.Ipc.sendToMain('game-data-editor:open-world',{view:'stages',closeLegacy:true},error=>{if(this._closed)return;this._redirecting=false;if(error){this.$status.textContent='Could not open Maps & Stages: '+String(error);this.$retry.hidden=false;}});},
  close(){this._closed=true;}
 });
}
module.exports={PANEL_ID,isWorld,open,createLegacy};
