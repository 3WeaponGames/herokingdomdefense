'use strict';
// A local palette menu: opening it never changes the selected tool or asset.
function create(root,actions){
 let current=null;
 const document=root.ownerDocument,window=document.defaultView,eventRoot=root.getRootNode();
 function close(restore){
  if(!current)return;
  const previous=current;current=null;previous.menu.remove();
  document.removeEventListener('pointerdown',outside,true);
  document.removeEventListener('keydown',key,true);
  document.removeEventListener('scroll',scroll,true);
  if(eventRoot!==document)eventRoot.removeEventListener('scroll',scroll,true);
  window.removeEventListener('blur',blur);
  if(restore&&previous.anchor.isConnected)previous.anchor.focus({preventScroll:true});
 }
 // Cocos panels use Shadow DOM, so document listeners see the panel host as
 // event.target even when the user presses a menu item inside the panel.
 function inside(event){return current&&(current.menu.contains(event.target)||typeof event.composedPath==='function'&&event.composedPath().includes(current.menu));}
 function outside(event){if(current&&!inside(event))close(false);}
 function scroll(){close(false);}
 function blur(){close(false);}
 function key(event){
  if(!current)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(!inside(event))return;
  event.stopPropagation();
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const items=Array.from(current.menu.querySelectorAll('button'));
   const path=typeof event.composedPath==='function'?event.composedPath():[event.target];
   let at=items.findIndex(item=>path.includes(item));
   at=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
   items[at].focus();
  }
 }
 function open(event,asset,anchor){
  event.preventDefault();event.stopPropagation();close(false);
  if(actions.busy&&actions.busy())return;
  const menu=document.createElement('div');menu.className='world-asset-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Asset actions for '+asset.name);
  current={menu,anchor};
  for(const [label,action] of [['Rename',actions.rename],['Delete',actions.remove]]){
   const item=document.createElement('button');item.textContent=label;item.setAttribute('role','menuitem');
   item.onclick=()=>{close(false);Promise.resolve().then(()=>action(asset)).catch(actions.error);};menu.appendChild(item);
  }
  root.appendChild(menu);const bounds=anchor.getBoundingClientRect(),x=Number.isFinite(event.clientX)?event.clientX:bounds.left,y=Number.isFinite(event.clientY)?event.clientY:bounds.bottom;
  menu.style.left=Math.max(0,Math.min(x,window.innerWidth-menu.offsetWidth-4))+'px';menu.style.top=Math.max(0,Math.min(y,window.innerHeight-menu.offsetHeight-4))+'px';
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);window.addEventListener('blur',blur);menu.querySelector('button').focus({preventScroll:true});
  // Scroll events do not cross Shadow DOM boundaries.
  if(eventRoot!==document)eventRoot.addEventListener('scroll',scroll,true);
 }
 function bind(anchor,asset){
  anchor.oncontextmenu=event=>open(event,asset,anchor);
  anchor.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)open(event,asset,anchor);});
 }
 return {bind,close,destroy:()=>close(false)};
}
module.exports={create};
