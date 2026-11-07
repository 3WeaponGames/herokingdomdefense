'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function commit(root,files,expected,primary){
  root=path.resolve(root);const plan=[];
  for(const [relative,value]of files){const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw Error('Character output leaves the project');const before=fs.existsSync(target)?fs.readFileSync(target):null,after=Buffer.isBuffer(value)?value:Buffer.from(value);if(before&&!Buffer.compare(before,after))continue;plan.push({relative,target,before,after});}
  if(!plan.length)return{files:[],backup:null};
  const project=digest(Buffer.from(root.toLowerCase())).slice(0,16),folder=path.join(os.homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','character-saves',project,Date.now()+'-'+crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(folder,{recursive:true});const records=[],done=[];
  function check(file,before){const current=fs.existsSync(file)?fs.readFileSync(file):null;if(before===null?current!==null:current===null||Buffer.compare(current,before))throw Error('Another editor changed '+path.relative(root,file)+'. Your draft is intact.');}
  for(const item of plan){const token=digest(Buffer.from(item.relative));item.backup=path.join(folder,'original',token+'.bin');item.staged=path.join(folder,'staged',token+'.bin');fs.mkdirSync(path.dirname(item.staged),{recursive:true});fs.writeFileSync(item.staged,item.after,{flag:'wx'});if(item.before){fs.mkdirSync(path.dirname(item.backup),{recursive:true});fs.writeFileSync(item.backup,item.before,{flag:'wx'});}records.push({path:item.relative,before:item.before&&digest(item.before),after:digest(item.after),original:item.before?'original/'+token+'.bin':null});}
  const journal=path.join(folder,'transaction.json');fs.writeFileSync(journal,JSON.stringify({status:'prepared',files:records},null,2));
  try{
    for(const [file,before]of expected||[])check(file,before);
    for(const item of plan)check(item.target,item.before);
    // Publish metadata first so Creator never invents a conflicting UUID.
    plan.sort((a,b)=>Number(!a.relative.endsWith('.meta'))-Number(!b.relative.endsWith('.meta')));
    for(const item of plan){check(item.target,item.before);fs.mkdirSync(path.dirname(item.target),{recursive:true});fs.renameSync(item.staged,item.target);done.push(item);}
    fs.writeFileSync(journal,JSON.stringify({status:'complete',files:records},null,2));
  }catch(error){const conflicts=[];for(const item of done.reverse()){try{check(item.target,item.after);if(item.before)fs.writeFileSync(item.target,item.before);else fs.unlinkSync(item.target);}catch(issue){conflicts.push(item.relative);}}fs.writeFileSync(journal,JSON.stringify({status:conflicts.length?'recovery-required':'rolled-back',files:records,conflicts,error:error.message},null,2));throw error;}
  const original=plan.find(item=>item.relative===primary&&item.before)||plan.find(item=>item.before);
  return{files:plan.map(item=>item.relative.replace(/\\/g,'/')),backup:original?path.relative(root,original.backup).replace(/\\/g,'/'):null,transaction:folder};
}
module.exports={commit};
