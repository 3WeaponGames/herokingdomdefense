'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const JSONDocument=require('./json-document');
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const defaults=()=>({version:1,timings:{},parameters:{},perks:{}});
const files={A:'assets/KinghtFallConfig/GameJsonCfg.json',B:'assets/KinghtFallConfigB/GameJsonCfg.json',D:'assets/KinghtFallConfigD/GameJsonCfg.json',catalog:'assets/resources/localization/catalog.json'};
const reserved=['__proto__','prototype','constructor'];
function safePath(parts) {if(!Array.isArray(parts)||!parts.length||parts.some(k=>(typeof k!=='number'&&typeof k!=='string')||reserved.indexOf(String(k))>=0))throw Error('Invalid field path');}
function setAt(data,parts,value,remove) {
    safePath(parts);let target=data;
    for(let i=0;i<parts.length-1;i++){const key=parts[i];if(!target||typeof target!=='object'||!own(target,key))throw Error('The field no longer exists. Reload before editing.');target=target[key];}
    const key=parts[parts.length-1];if(!target||typeof target!=='object')throw Error('Invalid field parent');
    if(Array.isArray(target)&&(!Number.isInteger(Number(key))||Number(key)<0||Number(key)>target.length))throw Error('Invalid array index');
    if(remove){if(Array.isArray(target))throw Error('Change the complete row list to remove array items');delete target[key];}
    else {if(value===undefined)throw Error('A value is required');target[key]=clone(value);}
}
function issueKey(i){return [i.doc,JSON.stringify(i.path||[]),i.message].join(':');}
function issueValue(documents,issue){let value=documents[issue.doc]&&documents[issue.doc].data;for(const key of issue.path||[]){if(value==null)return undefined;value=value[key];}return value;}
class Store {
    constructor(root,options){this.root=path.resolve(root);this.options=options||{};this.version=0;this.documents={};this.undoStack=[];this.redoStack=[];this.load();}
    absolute(relative){const result=path.resolve(this.root,relative);if(!result.startsWith(this.root+path.sep))throw Error('Path leaves project');return result;}
    readDocument(id,relative){const file=this.absolute(relative),text=fs.readFileSync(file,'utf8'),data=JSON.parse(text.replace(/^\uFEFF/,''));return{id,path:relative,original:clone(data),data,text,revision:hash(text)};}
    load(){
        const maps=Object.keys(this.documents).filter(id=>id.indexOf('map:')===0).map(id=>({id,path:this.documents[id].path}));
        this.documents={};Object.keys(files).forEach(id=>{this.documents[id]=this.readDocument(id,files[id]);});
        maps.forEach(m=>{this.documents[m.id]=this.readDocument(m.id,m.path);});
        const original=this.documents.A.data.GameTools===undefined?defaults():clone(this.documents.A.data.GameTools);
        this.documents.overrides={id:'overrides',path:files.A+'#GameTools',original:clone(original),data:original,revision:this.documents.A.revision,virtual:true};
        this.undoStack=[];this.redoStack=[];this.version++;return this.snapshot();
    }
    checkVersion(request){if(!request||request.version!==this.version)throw Error('Another panel changed these drafts. Refresh this panel and try again.');}
    addMap(id){
        if(!/^Map0[1-4]$/.test(id))throw Error('Unknown playable map');const key='map:'+id;
        if(!this.documents[key]){this.documents[key]=this.readDocument(key,'assets/KinghtFallIconMap/'+id+'.prefab');this.version++;}
        return this.snapshot();
    }
    changes(){const result=[];Object.keys(this.documents).forEach(id=>JSONDocument.diff(this.documents[id].original,this.documents[id].data).forEach(change=>result.push(Object.assign({doc:id},change))));return result;}
    draftState(){const state={};Object.keys(this.documents).forEach(id=>{state[id]=clone(this.documents[id].data);});return state;}
    restore(state){Object.keys(state).forEach(id=>{if(this.documents[id])this.documents[id].data=clone(state[id]);});this.version++;}
    change(request){
        this.checkVersion(request);if(!Array.isArray(request.edits)||!request.edits.length) return this.snapshot();
        const next=this.draftState();
        request.edits.forEach(edit=>{
            if(!own(next,edit.doc))throw Error('Unknown document');
            if(edit.doc==='A'&&edit.path&&edit.path[0]==='GameTools')throw Error('Edit runtime overrides through the overrides document');
            if(Array.isArray(edit.path)&&!edit.path.length&&edit.doc.indexOf('map:')===0){if(!Array.isArray(edit.value)||edit.remove)throw Error('A complete serialized map is required');next[edit.doc]=clone(edit.value);}
            else setAt(next[edit.doc],edit.path,edit.value,edit.remove);
        });
        if(JSONDocument.equal(next,this.draftState()))return this.snapshot();
        this.undoStack.push(this.draftState());if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];this.restore(next);return this.snapshot();
    }
    undo(request){this.checkVersion(request);if(this.undoStack.length){this.redoStack.push(this.draftState());this.restore(this.undoStack.pop());}return this.snapshot();}
    redo(request){this.checkVersion(request);if(this.redoStack.length){this.undoStack.push(this.draftState());this.restore(this.redoStack.pop());}return this.snapshot();}
    discard(request){this.checkVersion(request);Object.keys(this.documents).forEach(id=>{this.documents[id].data=clone(this.documents[id].original);});this.undoStack=[];this.redoStack=[];this.version++;return this.snapshot();}
    refresh(){if(this.changes().length)throw Error('Save or discard drafts before reloading files');return this.load();}
    recoveries(){
        const folder=this.absolute('local/game-data-editor/backups');if(!fs.existsSync(folder))return [];
        return fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{
            try{const j=JSON.parse(fs.readFileSync(path.join(folder,d.name,'transaction.json'),'utf8'));return ['prepared','recovery-required'].indexOf(j.status)>=0?{id:d.name,status:j.status,files:j.files.map(f=>f.path)}:null;}catch(e){return null;}
        }).filter(Boolean);
    }
    recover(request){
        this.checkVersion(request);if(this.changes().length)throw Error('Discard drafts before recovering an interrupted save');
        if(!this.recoveries().some(r=>r.id===request.id))throw Error('Unknown recovery transaction');
        const folder=this.absolute('local/game-data-editor/backups/'+request.id),journalFile=path.join(folder,'transaction.json'),journal=JSON.parse(fs.readFileSync(journalFile,'utf8'));
        const files=journal.files.map(f=>{const file=this.absolute(f.path),backup=path.resolve(folder,f.path);if(!backup.startsWith(folder+path.sep))throw Error('Invalid recovery path');const before=fs.readFileSync(backup,'utf8'),current=fs.readFileSync(file,'utf8');if(hash(before)!==f.before)throw Error('Recovery backup failed verification: '+f.path);if(hash(current)!==f.before&&hash(current)!==f.after)throw Error('External changes prevent automatic recovery: '+f.path);return{file,before,changed:hash(current)!==f.before};});
        // Recovery is an explicit UI action. Opening an editor never runs this.
        files.filter(f=>f.changed).forEach(f=>{const temp=f.file+'.game-tools-recover.tmp';fs.writeFileSync(temp,f.before,'utf8');fs.renameSync(temp,f.file);});
        journal.status='recovered';fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));this.load();return Object.assign(this.snapshot(),{result:{recovered:true,files:journal.files.map(f=>f.path)}});
    }
    validate(originalDocuments){
        const validators=this.options.validators||[], docs={}, baseline={};
        Object.keys(this.documents).forEach(id=>{docs[id]={data:this.documents[id].data};baseline[id]={data:(originalDocuments||this.documents)[id].original};});
        const changes=this.changes(), all=[];
        validators.forEach(validate=>{
            const previous=new Set(validate(baseline,[]).map(issueKey));
            validate(docs,changes).forEach(issue=>{const item=Object.assign({},issue);if(previous.has(issueKey(issue))&&item.severity==='error'&&JSONDocument.equal(issueValue(baseline,issue),issueValue(docs,issue))){item.severity='warning';item.existing=true;}all.push(item);});
        });
        return all;
    }
    saveCandidate(){
        // Refresh only untouched inputs, in isolation. A failed save must keep
        // the user's draft and its undo/redo history exactly as they were.
        const documents=Object.assign({},this.documents);
        const overridesChanged=!JSONDocument.equal(documents.overrides.original,documents.overrides.data);
        Object.keys(documents).filter(id=>!documents[id].virtual).forEach(id=>{
            const d=documents[id],text=fs.readFileSync(this.absolute(d.path),'utf8');
            if(hash(text)===d.revision)return;
            if(!JSONDocument.equal(d.original,d.data)||(id==='A'&&overridesChanged))throw Error(d.path+' changed outside these panels. Save cancelled; your drafts are retained.');
            const data=JSON.parse(text.replace(/^\uFEFF/,''));
            documents[id]={id,path:d.path,original:clone(data),data,text,revision:hash(text)};
            if(id==='A'){
                const original=data.GameTools===undefined?defaults():clone(data.GameTools);
                documents.overrides={id:'overrides',path:files.A+'#GameTools',original:clone(original),data:original,revision:documents.A.revision,virtual:true};
            }
        });
        return Object.assign(Object.create(Object.getPrototypeOf(this)),this,{documents});
    }
    snapshot(){const documents={};Object.keys(this.documents).forEach(id=>{const d=this.documents[id];documents[id]={path:d.path,data:clone(d.data),revision:d.revision,virtual:!!d.virtual};});const changes=this.changes();return{version:this.version,documents,dirty:changes.length>0,changes,canUndo:this.undoStack.length>0,canRedo:this.redoStack.length>0,issues:this.validate(),recoveries:this.recoveries(),root:this.root};}
    save(request){
        this.checkVersion(request);if(!this.changes().length)return Object.assign(this.snapshot(),{result:{saved:false,noChanges:true}});
        if(this.recoveries().length)throw Error('Recover the interrupted save before saving further edits');
        const candidate=this.saveCandidate();
        // Keep the old baseline for advisory classification: broken references
        // introduced externally must not become "existing" warnings by refresh.
        const issues=candidate.validate(this.documents),errors=issues.filter(i=>i.severity==='error');if(errors.length)throw Error('Fix validation errors before saving: '+errors.slice(0,5).map(i=>i.message).join('; '));
        const values=candidate.draftState();
        if(!JSONDocument.equal(candidate.documents.overrides.original,values.overrides)) {
            if(JSONDocument.equal(values.overrides,defaults()))delete values.A.GameTools;
            else values.A.GameTools=clone(values.overrides);
        }
        const prepared=[];
        Object.keys(candidate.documents).filter(id=>!candidate.documents[id].virtual).forEach(id=>{
            const d=candidate.documents[id];if(JSONDocument.equal(d.original,values[id]))return;
            const file=this.absolute(d.path),current=fs.readFileSync(file,'utf8');
            if(hash(current)!==d.revision)throw Error(d.path+' changed outside these panels. Save cancelled; your drafts are retained.');
            const text=JSONDocument.patch(d.text,d.original,values[id]);prepared.push({id,path:d.path,file,before:d.text,after:text});
        });
        if(!prepared.length){this.load();return Object.assign(this.snapshot(),{result:{saved:false,noChanges:true}});}
        // Check all read dependencies too: a referenced unit/map/translation could
        // have changed even when its own document has no draft edit.
        Object.keys(candidate.documents).filter(id=>!candidate.documents[id].virtual).forEach(id=>{const d=candidate.documents[id];if(hash(fs.readFileSync(this.absolute(d.path),'utf8'))!==d.revision)throw Error(d.path+' changed again during save. Save cancelled; your drafts are retained. Please retry.');});
        const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
        const backupDir=this.absolute('local/game-data-editor/backups/'+stamp);fs.mkdirSync(backupDir,{recursive:true});
        const journal={version:1,status:'prepared',files:prepared.map(p=>({path:p.path,before:hash(p.before),after:hash(p.after)}))};
        const journalFile=path.join(backupDir,'transaction.json');
        const committed=[];
        try {
            prepared.forEach(p=>{const backup=path.join(backupDir,p.path);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,p.before,'utf8');p.temp=p.file+'.game-tools-'+stamp+'.tmp';fs.writeFileSync(p.temp,p.after,'utf8');});
            fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));
            prepared.forEach((p,index)=>{if(this.options.beforeCommit)this.options.beforeCommit(index,p);if(hash(fs.readFileSync(p.file,'utf8'))!==hash(p.before))throw Error('File changed during save: '+p.path);fs.renameSync(p.temp,p.file);committed.push(p);});
            prepared.forEach(p=>{if(hash(fs.readFileSync(p.file,'utf8'))!==hash(p.after))throw Error('Saved file verification failed: '+p.path);});
            journal.status='complete';fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));
        } catch(error) {
            const recovery=[];
            committed.reverse().forEach(p=>{try{if(hash(fs.readFileSync(p.file,'utf8'))!==hash(p.after)){recovery.push(p.path);return;}fs.writeFileSync(p.file,p.before,'utf8');}catch(e){recovery.push(p.path);}});
            prepared.forEach(p=>{if(p.temp&&fs.existsSync(p.temp))fs.unlinkSync(p.temp);});
            journal.status=recovery.length?'recovery-required':'rolled-back';journal.error=error.message;journal.recovery=recovery;
            fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));
            throw Error(error.message+' Drafts retained. Backup: '+backupDir+(recovery.length?' Manual recovery required for '+recovery.join(', '):''));
        }
        this.load();return Object.assign(this.snapshot(),{result:{saved:true,files:prepared.map(p=>p.path),backup:backupDir,reloadRequired:true}});
    }
}
module.exports={Store,files,defaults,hash,setAt};
