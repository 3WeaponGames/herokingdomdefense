'use strict';
const Profiles=require('./unit-profiles');
function read(store,request,drafts){
 const snapshot=store.snapshot(),id=Number(request.id),view=Profiles.describe(store.root,store.draftState(),id,drafts);
 return {version:snapshot.version,dirty:snapshot.dirty,changes:snapshot.changes,canUndo:snapshot.canUndo,canRedo:snapshot.canRedo,documents:snapshot.documents,id,...view};
}
function change(store,request,drafts){
 store.checkVersion(request);const before=store.draftState(),result=Profiles.operation(store.root,before,request,drafts);
 store.change({version:request.version,edits:Profiles.edits(before,result.state)});
 return read(store,{id:result.selectedId},drafts);
}
module.exports={read,change};
