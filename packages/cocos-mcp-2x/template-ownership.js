'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=bytes=>bytes===null?null:crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.existsSync(file)?fs.readFileSync(file):null;
function strip(bytes){
    // Latin-1 is a byte-preserving view. Never normalize authored line endings,
    // trailing whitespace, or text on the same line as an injected marker.
    return Buffer.from(bytes.toString('latin1')
        .replace(/<!-- COCOS-MCP-LOG-START[^]*?<!-- COCOS-MCP-LOG-END -->/g,'')
        .replace(/^[ \t]*\/\/- COCOS-MCP-LOG-START[^]*?^[ \t]*\/\/- COCOS-MCP-LOG-END/gm,''),'latin1');
}
function locations(dir){const base=path.join(path.dirname(dir),'local/cocos-mcp-2x');return{base,record:path.join(base,'preview-template.json')};}
function recordFor(dir,file){const loc=locations(dir);if(!fs.existsSync(loc.record))return null;const record=JSON.parse(fs.readFileSync(loc.record,'utf8'));if(record.version!==1||record.name!==path.basename(file)||!/^index\.(html|ejs|jade)$/.test(record.name))throw Error('Preview template ownership does not match; keep the ownership record for recovery.');return record;}
function replace(dir,file,before,after,record){
    if(hash(before)===hash(after))return;
    const loc=locations(dir),stamp=Date.now()+'-'+crypto.randomBytes(6).toString('hex');
    const recordBefore=read(loc.record),recordBytes=record?Buffer.from(JSON.stringify(record,null,2)+'\n'):null;
    fs.mkdirSync(path.join(loc.base,'backups'),{recursive:true});
    if(before!==null)fs.writeFileSync(path.join(loc.base,'backups',stamp+'-'+path.basename(file)),before,{flag:'wx'});
    if(recordBefore!==null)fs.writeFileSync(path.join(loc.base,'backups',stamp+'-ownership.json'),recordBefore,{flag:'wx'});
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+'.cocos-mcp-'+stamp+'.tmp',recordTemp=loc.record+'.'+stamp+'.tmp';
    let recordCommitted=false,committed=false;
    try{
        if(after!==null)fs.writeFileSync(temp,after,{flag:'wx'});
        if(record)fs.writeFileSync(recordTemp,recordBytes,{flag:'wx'});
        if(hash(read(file))!==hash(before))throw Error('Preview template changed during update; no authored changes were overwritten.');
        if(hash(read(loc.record))!==hash(recordBefore))throw Error('Preview template ownership changed during update.');
        // Keep recovery metadata before replacing the template, including the
        // exact original bytes and installed block, if the process is stopped.
        if(record){fs.renameSync(recordTemp,loc.record);recordCommitted=true;}
        if(hash(read(file))!==hash(before))throw Error('Preview template changed during update; no authored changes were overwritten.');
        if(after===null)fs.unlinkSync(file);else fs.renameSync(temp,file);
        committed=true;
    }catch(error){
        // A busy template must not leave the new block's metadata attached to
        // the unchanged old template. Restore only the record this call wrote.
        if(recordCommitted&&!committed&&hash(read(loc.record))===hash(recordBytes)){
            try{if(recordBefore===null)fs.unlinkSync(loc.record);else{fs.writeFileSync(recordTemp,recordBefore,{flag:'wx'});if(hash(read(loc.record))!==hash(recordBytes))throw Error('Ownership changed during rollback');fs.renameSync(recordTemp,loc.record);}}
            catch(rollback){throw Error(error.message+' Ownership recovery backups: '+path.join(loc.base,'backups')+' ('+rollback.message+')');}
        }
        throw error;
    }finally{for(const leftover of [temp,recordTemp])if(fs.existsSync(leftover))fs.unlinkSync(leftover);}
}
function withoutOwnedBlock(current,record){
    const block=Buffer.from(record.block,'base64'),at=current.indexOf(block);
    if(at<0){if(hash(current)===hash(record.original===null?null:Buffer.from(record.original,'base64')))return current;throw Error('The injected preview block was edited. Keep the template and ownership backup for manual recovery.');}
    if(current.indexOf(block,at+block.length)>=0)throw Error('Ambiguous preview log blocks; template was preserved.');
    return Buffer.concat([current.subarray(0,at),current.subarray(at+block.length)]);
}
function install(dir,file,kind,block,scaffold){
    const before=read(file),previous=recordFor(dir,file);
    let original=before;
    if(previous&&before!==null){original=hash(before)===previous.installedHash?(previous.original===null?null:Buffer.from(previous.original,'base64')):withoutOwnedBlock(before,previous);}
    else if(before!==null)original=strip(before);
    let after,injected;
    if(original===null){after=Buffer.from(scaffold);injected=Buffer.from(block);}
    else{
        const text=original.toString('latin1'),match=kind==='jade'?null:/<\/body>/i.exec(text),at=match?match.index:original.length;
        injected=Buffer.from((!match&&at&&original[at-1]!==10?'\n':'')+block+'\n');
        after=Buffer.concat([original.subarray(0,at),injected,original.subarray(at)]);
    }
    const record={version:1,name:path.basename(file),original:original===null?null:original.toString('base64'),block:injected.toString('base64'),installedHash:hash(after)};
    replace(dir,file,before,after,record);
    return{file,mode:original===null?'created':'injected',kind};
}
function remove(dir,file){
    const before=read(file);if(before===null)return;
    const record=recordFor(dir,file);
    const after=record?(hash(before)===record.installedHash?(record.original===null?null:Buffer.from(record.original,'base64')):withoutOwnedBlock(before,record)):strip(before);
    replace(dir,file,before,after,null);
    if(record)fs.unlinkSync(locations(dir).record);
}
module.exports={install,remove,strip,recordFor};
