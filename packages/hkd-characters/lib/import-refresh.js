'use strict';
// Wait for textures before importing Spine data, then prefab references and
// catalogs. A successful Save reply means Simulator can resolve dependencies.
async function refresh(editor,files){
  const pending=[...new Set(files.filter(file=>!file.endsWith('.meta')))];
  const rank=file=>/\.png$/i.test(file)?0:/\.atlas$/i.test(file)?1:/\.(?:prefab|fire)$/i.test(file)?3:/\/catalog\.json$/i.test(file)?4:2;
  for(let phase=0;phase<=4;phase++)await Promise.all(pending.filter(file=>rank(file)===phase).map(file=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Creator import timed out: '+file)),10000);
    try { editor.assetdb.refresh('db://'+file,error=>{clearTimeout(timer);error?reject(error):resolve();}); }
    catch(error){clearTimeout(timer);reject(error);}
  })));
}
module.exports={refresh};
