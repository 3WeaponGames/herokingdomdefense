'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process'), http = require('http');
const bridges = new Map();
function prefixes(root) {
  const source = fs.readFileSync(path.join(root,'assets/_script/Config.js'),'utf8');
  const values = ['AppCacheName','WebCacheName'].map(key => {const match = source.match(new RegExp('\\.'+key+'\\s*=\\s*"([^"\\r\\n]+)"'));if (!match) throw Error('Cannot read the game save namespace.');return match[1];});
  return [...new Set(values)];
}
function backupRoot(root) {
  const key = crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
  return path.join(os.homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','progress-reset-backups',key);
}
function execFile(file,args,input) {
  return new Promise((resolve,reject) => {
    const child = cp.execFile(file,args,{windowsHide:true,timeout:15000,maxBuffer:1024*1024,env:Object.assign({},process.env,{ELECTRON_RUN_AS_NODE:'1'})},(error,stdout) => {
      if (error && !stdout) return reject(Error('Unable to run the save utility. Install Node 22.13 or newer, then retry. '+error.message));
      try {const result = JSON.parse(stdout);if(!result.ok)throw Error(result.error);resolve(result.value);} catch(issue) {reject(issue);}
    });
    if (child.stdin) {child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));}
  });
}
function native(root,request) {
  return execFile('node',['--no-warnings',path.join(__dirname,'native-save.cjs')],Object.assign({},request,{prefixes:prefixes(root),backupRoot:backupRoot(root)}));
}
async function requireStopped() {
  // A closed Simulator cannot restore the old in-memory player after reset.
  const result = await new Promise((resolve,reject) => cp.execFile(process.platform === 'win32' ? 'tasklist.exe' : 'pgrep', process.platform === 'win32' ? ['/FI','IMAGENAME eq simulator.exe','/FO','CSV','/NH'] : ['-ix','simulator'],{windowsHide:true,timeout:5000},(error,stdout) => error && (process.platform === 'win32' || error.code !== 1) ? reject(error) : resolve(stdout)));
  if (process.platform === 'win32' ? /"simulator\.exe"/i.test(result) : /\d/.test(result)) throw Error('Close the Simulator, then refresh this panel before resetting its progress.');
}
function candidates(root) {
  const resources = process.resourcesPath || '';
  return [...new Set([path.join(root,'jsb.sqlite'),path.join(root,'simulator/win32/jsb.sqlite'),path.join(root,'temp/jsb.sqlite'),path.join(process.env.LOCALAPPDATA || os.homedir(),'Simulator/jsb.sqlite'),resources && path.join(resources,'cocos2d-x/simulator/win32/jsb.sqlite')].filter(file => file && fs.existsSync(file)))];
}
function close(root) {const entry = bridges.get(root);if(entry){clearTimeout(entry.timer);entry.server.close();bridges.delete(root);}}
function browserStatus(root) {const entry = bridges.get(root);return entry ? {pending:!entry.complete,backup:entry.backup || null,removed:entry.removed,message:entry.complete?'Browser progress reset. Close the reset page and press Play.':'A Browser reset page is open. Confirm the reset there.'} : null;}
async function browser(Editor,root,request) {
  const port = Number(Editor.PreviewServer && Editor.PreviewServer._previewPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('The Cocos Browser preview server is unavailable.');
  const hostname = request.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost', origin = 'http://'+hostname+':'+port;
  close(root);
  const entry = {token:crypto.randomBytes(24).toString('hex'),origin,complete:false};
  entry.server = http.createServer((req,res) => {
    const headers = {'Content-Type':'application/json','Cache-Control':'no-store'};
    if (req.headers.origin !== origin) {res.writeHead(403,headers);return res.end(JSON.stringify({error:'Open the reset page from the Cocos Tools panel.'}));}
    headers['Access-Control-Allow-Origin'] = origin;headers['Vary'] = 'Origin';
    if (req.method === 'OPTIONS') {res.writeHead(204,Object.assign(headers,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}));return res.end();}
    function reply(code,value){res.writeHead(code,headers);res.end(JSON.stringify(value));}
    if (req.url !== '/reset' || req.method !== 'POST') return reply(404,{error:'Unknown reset action.'});
    let body = '', tooLarge = false;
    req.on('data',part=>{body+=part;if(body.length>16*1024*1024){tooLarge=true;req.destroy();}});
    req.on('error',()=>{});
    req.on('end',()=>{if(tooLarge)return;try{
      const data = JSON.parse(body);
      if (data.token !== entry.token || bridges.get(root) !== entry) throw Error('This reset link expired. Reopen it from Cocos Tools.');
      if (data.action === 'backup') {
        if (entry.complete) throw Error('This reset link has already been used.');
        if (data.origin !== origin || JSON.stringify(data.prefixes) !== JSON.stringify(prefixes(root)) || !Array.isArray(data.storage) || data.storage.some(row=>!Array.isArray(row)||row.length!==2||row.some(value=>typeof value!=='string'))) throw Error('The Browser did not supply a valid player backup.');
        const digest = crypto.createHash('sha256').update(JSON.stringify(data.storage)).digest('hex');
        if (entry.digest && entry.digest !== digest) throw Error('This player changed. Reopen the reset page before retrying.');
        if (!entry.backup) {
          const directory = backupRoot(root);fs.mkdirSync(directory,{recursive:true});
          const backup = path.join(directory,'browser-player-'+Date.now()+'-'+entry.token.slice(0,8)+'.json');
          const value = JSON.stringify({version:1,kind:'browser-progress-backup',project:root,time:new Date().toISOString(),origin,prefixes:data.prefixes,storage:data.storage},null,2);
          fs.writeFileSync(backup,value,{flag:'wx'});
          if(fs.readFileSync(backup,'utf8')!==value)throw Error('Browser backup verification failed.');
          entry.backup=backup;entry.digest=digest;
        }
        return reply(200,{backup:entry.backup});
      }
      if (data.action === 'complete' && entry.backup && Number.isSafeInteger(data.removed) && data.removed >= 0) {entry.complete=true;entry.removed=data.removed;return reply(200,{complete:true});}
      throw Error('Unknown reset action.');
    }catch(error){reply(400,{error:error.message});}});
  });
  bridges.set(root,entry);
  try {await new Promise((resolve,reject)=>{entry.server.once('error',reject);entry.server.listen(0,'127.0.0.1',resolve);});}
  catch(error){if(bridges.get(root)===entry)close(root);throw error;}
  if(bridges.get(root)!==entry){entry.server.close();throw Error('A newer Browser reset page replaced this request.');}
  entry.timer=setTimeout(()=>close(root),10*60*1000);if(entry.timer.unref)entry.timer.unref();
  const url = origin+'/?hkd-reset-progress='+entry.token+'&hkd-reset-bridge='+encodeURIComponent('http://127.0.0.1:'+entry.server.address().port+'/reset');
  try {await Promise.resolve(require('electron').shell.openExternal(url));}catch(error){close(root);throw error;}
  return {message:'Confirm the reset in the Browser page. This panel has not cleared any progress.',url};
}
async function handle(Editor,root,request) {
  root=path.resolve(root);request=request||{action:'status'};
  if(request.action==='status')return {files:candidates(root),browser:browserStatus(root),backupRoot:backupRoot(root)};
  if(request.action==='inspect')return native(root,{action:'inspect',file:request.file});
  if(request.action==='reset-native'){
    if(request.confirm!=='RESET')throw Error('Type RESET to confirm the Simulator player reset.');
    await requireStopped();
    return native(root,{action:'reset',file:request.file,revision:request.revision,confirm:request.confirm});
  }
  if(request.action==='open-browser')return browser(Editor,root,request);
  if(request.action==='cancel-browser'){close(root);return {message:'Browser reset link cancelled. No progress was cleared.'};}
  throw Error('Unknown progress reset action.');
}
function shutdown(){Array.from(bridges.keys()).forEach(close);}
module.exports={handle,shutdown,prefixes,backupRoot,_bridges:bridges};
