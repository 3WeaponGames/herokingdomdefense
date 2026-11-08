'use strict';
const JSONDoc=require('../lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value));
function diff(before,after){return JSONDoc.diff(before,after).map(edit=>{
 if(!Array.isArray(edit.before)||!Array.isArray(edit.after))return edit;
 const a=edit.before,b=edit.after;let first=0,last=0;
 while(first<a.length&&first<b.length&&JSONDoc.equal(a[first],b[first]))first++;
 while(last<a.length-first&&last<b.length-first&&JSONDoc.equal(a[a.length-1-last],b[b.length-1-last]))last++;
 return {path:edit.path,type:'splice',index:first,before:a.slice(first,a.length-last),after:b.slice(first,b.length-last)};
});}
function apply(value,edits,redo){for(const edit of edits){let parent=value;for(const key of edit.path.slice(0,-1))parent=parent[key];const key=edit.path[edit.path.length-1];let next=redo?edit.after:edit.before;
 if(edit.type==='splice'){const list=parent[key],old=redo?edit.before:edit.after;next=list.slice(0,edit.index).concat(next,list.slice(edit.index+old.length));}
 if(next===undefined)delete parent[key];else Object.defineProperty(parent,key,{value:clone(next),writable:true,enumerable:true,configurable:true});
}return value;}
module.exports={diff,apply};
