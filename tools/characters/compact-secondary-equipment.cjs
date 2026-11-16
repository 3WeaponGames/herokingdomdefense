'use strict';
// Explicit publication only. Authoring panels never run this conversion.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),Doc=require('../../packages/game-data-editor/lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value));
function compact(config){
 const gear=config.EquipCfg.find(item=>item.id===3),settings=config.HeroEquipment;
 if(settings.secondaryProgression&&settings.secondaryProgression.version>=1){if(gear.levelInfo.length!==25)throw Error('Saved secondary progression does not match its equipment levels.');return null;}
 if(gear.levelInfo.length!==50)throw Error('Expected the existing fifty-level secondary equipment track.');
 const old=gear.levelInfo,total=old.reduce((sum,row)=>sum+row.GoldCost,0),target=Math.round(total/2),rows=old.filter((_row,index)=>index%2===1).map(clone),selected=rows.reduce((sum,row)=>sum+row.GoldCost,0);
 let sourceCost=0,previous=0;
 rows.forEach((row,index)=>{row.Level=index+1;if(index===24){row.GoldCost=0;return;}sourceCost+=row.GoldCost;const next=selected?Math.round(sourceCost*target/selected):0;row.GoldCost=next-previous;previous=next;});
 gear.levelInfo=rows;
 settings.secondaryProgression={version:1,from:50,to:25,originalTotalGold:total,totalGold:target};
 return{levels:25,oldTotalGold:total,totalGold:target,oldLevels:rows.map((_row,index)=>(index+1)*2)};
}
function plan(root){
 const files=new Map(),reads=new Map(),report=[];
 for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json']){
  const full=path.join(root,file),before=fs.readFileSync(full),original=JSON.parse(before),next=clone(original);reads.set(full,before);
  const result=compact(next);if(!result)continue;
  files.set(file,Doc.patch(before.toString('utf8'),original,next));report.push({file,...result});
 }
 return{files,reads,report};
}
function apply(root){
 root=path.resolve(root);const result=plan(root);if(!result.files.size)return{...result,backup:null};
 const backup=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-secondary-25-')),published=[];
 function check(file,expected){if(!fs.readFileSync(file).equals(expected))throw Error('Another editor changed '+path.relative(root,file)+'. No unrelated changes were overwritten.');}
 for(const [file,bytes]of result.reads)check(file,bytes);
 const journal=[];
 for(const [relative,text]of result.files){const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('Equipment publication leaves the project.');const name=crypto.createHash('sha256').update(relative).digest('hex');fs.writeFileSync(path.join(backup,name+'.before.json'),result.reads.get(file));fs.writeFileSync(path.join(backup,name+'.after.json'),text);journal.push({file,original:name+'.before.json'});}
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({files:journal,report:result.report},null,2));
 try{for(const [relative,text]of result.files){const file=path.resolve(root,relative);check(file,result.reads.get(file));fs.writeFileSync(file,text);published.push({file,after:Buffer.from(text)});}}
 catch(error){for(const item of published.reverse()){check(item.file,item.after);fs.writeFileSync(item.file,result.reads.get(item.file));}throw error;}
 return{report:result.report,files:[...result.files.keys()],backup};
}
module.exports={compact,plan,apply};
if(require.main===module){const root=path.resolve(__dirname,'../..');console.log(JSON.stringify(process.argv.includes('--apply')?apply(root):plan(root).report,null,2));}
