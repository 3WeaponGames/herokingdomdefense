'use strict';
const fs=require('fs'),path=require('path'),Client=require('./client'),Routing=require('./panel-routing');
function mount(container,options){
 const node=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;},root=node('div','world-workspace'),style=node('style'),nav=node('nav','world-workspace-nav'),error=node('p','world-workspace-error'),views={};let active=null,closed=false,serial=0,pending=Promise.resolve(),following=null;
 const selectionKey='hkd-world-selection-v1:'+(options.preferenceKey||path.resolve(__dirname,'../../..'));
 let selection={};
 try{const saved=JSON.parse(window.localStorage.getItem(selectionKey));if(saved&&typeof saved==='object')selection=saved;}catch(_){}
 function remember(view){
  if(!view)return;
  const stageId=view.stageId||selection.stageId;
  if(view.mapId===selection.mapId&&stageId===selection.stageId)return;
  selection={mapId:view.mapId,stageId};
  try{window.localStorage.setItem(selectionKey,JSON.stringify(selection));}catch(_){}
 }
 style.textContent=fs.readFileSync(path.join(__dirname,'workspace.css'),'utf8');root.appendChild(style);nav.setAttribute('role','tablist');nav.setAttribute('aria-label','World editors');root.appendChild(nav);error.hidden=true;error.setAttribute('role','alert');root.appendChild(error);container.appendChild(root);
 const scrollSelectors=['.world-side','.world-inspector','.world-layer-list','.world-timeline','#world-palette','.world-rows'];
 function capture(view){view.scroll=scrollSelectors.flatMap(selector=>Array.from(view.host.querySelectorAll(selector),(element,index)=>({selector,index,top:element.scrollTop,left:element.scrollLeft})));}
 function restore(view){for(const entry of view.scroll||[]){const element=view.host.querySelectorAll(entry.selector)[entry.index];if(element){element.scrollTop=entry.top;element.scrollLeft=entry.left;}}}
 function showError(value){if(closed)return;error.textContent=value&&value.message||String(value);error.hidden=false;}
 function ensure(kind,request){
  const view=views[kind];if(view.client)return;
  view.client=Client.mount(view.host,Object.assign({},options,{kind,
   mapId:kind==='maps'&&(request.mapId||options.mapId),initialSelection:selection,
   onView:view=>{if(!closed&&active===kind&&following!==kind)remember(view);},
   preferenceKey:options.preferenceKey||'hkd-world-dock-v3'}));
 }
 function open(request){
  request=request||{};const kind=request.view||options.kind||'maps';if(!Routing.isWorld(kind))return Promise.reject(Error('Choose Maps or Stages.'));const token=++serial;
  const operation=pending.catch(()=>{}).then(async()=>{
   if(closed||token!==serial)return false;error.hidden=true;
   const previous=active&&views[active],switching=active!==kind;
   if(previous&&switching){
    const focus=document.activeElement;if(focus&&previous.host.contains(focus)&&typeof focus.blur==='function')focus.blur();
    await previous.client.setActive(false);capture(previous);if(closed||token!==serial)return false;
    remember(previous.client.viewSelection());previous.host.hidden=true;
   }
   const view=views[kind],follow=!!view.client&&(switching||kind==='maps'&&request.mapId);
   view.host.hidden=false;active=kind;ensure(kind,request);
   for(const [id,item]of Object.entries(views)){item.button.setAttribute('aria-selected',String(id===kind));item.button.tabIndex=id===kind?0:-1;item.host.setAttribute('aria-hidden',String(id!==kind));}
   following=follow?kind:null;
   try{
    await view.client.setActive(true);if(closed||token!==serial)return false;
    if(follow){
     await view.client.ready;if(closed||token!==serial)return false;
     if(kind==='maps'&&request.mapId)await view.client.focusMap(request.mapId);
     else await view.client.followSelection(selection);
     if(closed||token!==serial)return false;
     remember(view.client.viewSelection());
    }
   }finally{following=null;}
   restore(view);return true;
  });pending=operation.catch(showError);return operation;
 }
 for(const kind of ['maps','stages']){const button=node('button'),host=node('section','world-workspace-view');button.textContent=kind==='maps'?'Maps':'Stages';button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');button.setAttribute('aria-controls','world-workspace-'+kind);button.id='world-workspace-tab-'+kind;button.tabIndex=kind==='maps'?0:-1;button.onclick=()=>open({view:kind}).catch(showError);host.id='world-workspace-'+kind;host.setAttribute('role','tabpanel');host.setAttribute('aria-labelledby',button.id);host.hidden=true;views[kind]={button,host,client:null,scroll:[]};nav.appendChild(button);root.appendChild(host);}
 nav.onkeydown=event=>{const current=event.target===views.stages.button?'stages':'maps',next=event.key==='Home'?'maps':event.key==='End'?'stages':['ArrowLeft','ArrowRight'].includes(event.key)?current==='maps'?'stages':'maps':null;if(next){event.preventDefault();views[next].button.focus();open({view:next}).catch(showError);}};
 root.addEventListener('keydown',event=>{if(event.defaultPrevented||!active||['Tab','Enter',' '].includes(event.key))return;if(event.target.closest&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(!nav.contains(event.target)&&event.target!==root&&event.target!==error)return;const client=views[active].client;if(client)client.handleKey(event);});
 if(options.autoStart!==false)open({view:options.kind||'maps'}).catch(showError);
 return {open,focusMap:mapId=>open({view:'maps',mapId}),async focus(){const token=serial,view=views[active];if(!view||!view.client)return;await view.client.ready;if(!closed&&token===serial)view.client.focus();},changed(){for(const view of Object.values(views))if(view.client)view.client.changed();},destroy(){if(closed)return;closed=true;serial++;for(const view of Object.values(views))if(view.client)view.client.destroy();root.remove();},whenIdle:()=>pending,_views:views,get _active(){return active;},_root:root};
}
module.exports={mount};
