'use strict';
// The same authoring client as the Creator panel, served locally for review.
// Only the pure Spine renderer is loaded; no game, director, saves or audio.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),url=require('node:url');
const {Service}=require('../../packages/hkd-characters/lib/service');
const Units=require('../../packages/game-data-editor/lib/unit-assets');
function createServer(root,options){
  options=options||{};const itemMode=options.kind==='items',projectileMode=options.kind==='projectiles';
  root=path.resolve(root);const ServiceType=projectileMode?require('../../packages/hkd-projectiles/service').ProjectilesService:itemMode?require('../../packages/hkd-items/service').ItemsService:Service;const service=new ServiceType(root),panel=path.join(root,projectileMode?'packages/hkd-projectiles':'packages/hkd-characters');
  function bundle(){
    const modules={core:fs.readFileSync(path.join(root,'assets/_script/CharacterPartsCore.js'),'utf8'),renderer:fs.readFileSync(path.join(root,'packages/game-data-editor/preview/spine-renderer.js'),'utf8'),client:fs.readFileSync(path.join(panel,'client.js'),'utf8'),'./lib/placement':fs.readFileSync(path.join(root,'packages/hkd-characters/lib/placement.js'),'utf8'),'./lib/label-scrub':fs.readFileSync(path.join(root,'packages/hkd-characters/lib/label-scrub.js'),'utf8')};
    return '(function(){var modules={'+Object.entries(modules).map(([key,value])=>JSON.stringify(key)+':function(module,exports,require){\n'+value+'\n}').join(',')+'};var cache={};function require(id){if(!cache[id]){var m=cache[id]={exports:{}};modules[id](m,m.exports,require);}return cache[id].exports;}var app=require("client").mount(document.getElementById("characters"),{kind:'+JSON.stringify(options.kind||'characters')+',renderer:require("renderer"),core:require("core"),runtime:function(){return window.spine;},image:function(file){return "/asset/"+file.split("/").map(encodeURIComponent).join("/");},ipc:async function(name,request){var r=await fetch("/api/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request||{})});var result=await r.json();if(!r.ok)throw Error(result.error);return result;}});window.addEventListener("pagehide",function(){app.destroy();});})();';
  }
  const server=http.createServer(async(req,res)=>{
    const respond=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
    try{
      const address=server.address&&server.address(),port=address&&address.port||options.port||(itemMode?8791:8790);
      const authority=/^(localhost|127\.0\.0\.1|\[::1\]):([0-9]+)$/i.exec(req.headers.host||'');
      if(!authority||Number(authority[2])!==port)throw Error('Use the local editor address.');
      if(req.headers.origin&&req.headers.origin!==new URL('http://'+req.headers.host).origin)throw Error('Use the local editor window.');
      const parsed=new URL(req.url,'http://127.0.0.1'),route=parsed.pathname;
      if(req.method==='POST'&&route.startsWith('/api/')){
        const origin=req.headers.origin,expected=new URL('http://'+req.headers.host).origin;
        if(origin!==expected||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Error('Use the editor window for character changes.');
        let body='';for await(const chunk of req){body+=chunk;if(body.length>2*1024*1024)throw Error('Character draft is too large.');}
        const request=JSON.parse(body||'{}'),method=route.slice(5);if(!['load','describe','change','discard','save'].includes(method))throw Error('Unknown editor operation.');
        const result=service[method](request);
        if(method==='describe')for(const layer of result.layers)for(const [name,source]of Object.entries(layer.pages))layer.pages[name]='/asset/'+path.relative(root,url.fileURLToPath(source)).split(path.sep).map(encodeURIComponent).join('/');
        respond(200,'application/json',JSON.stringify(result));return;
      }
      if(req.method!=='GET')throw Error('Unsupported method.');
      if(route==='/'){respond(200,'text/html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+(projectileMode?'Projectiles':itemMode?'Items':'Characters')+' · Hero Kingdom Defense</title><link rel="stylesheet" href="/style.css"><style>html,body{height:100%;margin:0}#characters{height:100vh}</style><div id="characters"></div><script src="/spine-runtime.js"></script><script src="/app.js"></script></html>');return;}
      if(route==='/style.css'){respond(200,'text/css',fs.readFileSync(path.join(panel,'style.css')));return;}
      if(route==='/app.js'){respond(200,'application/javascript',bundle());return;}
      if(route==='/spine-runtime.js'){respond(200,'application/javascript','(function(){var module={exports:{}};\n'+fs.readFileSync(Units.enginePath(),'utf8')+'\nwindow.spine=module.exports;})();');return;}
      if(route.startsWith('/asset/')){
        const relative=decodeURIComponent(route.slice(7)),file=path.resolve(root,relative),allowed=path.join(root,'assets')+path.sep;
        if(!file.startsWith(allowed)||!/\.png$/i.test(file))throw Error('Unknown character image.');respond(200,'image/png',fs.readFileSync(file));return;
      }
      respond(404,'text/plain','Not found');
    }catch(error){respond(400,'application/json',JSON.stringify({error:error.message}));}
  });
  return server;
}
if(require.main===module){const root=path.resolve(__dirname,'../..'),port=Number(process.env.CHARACTER_EDITOR_PORT||8790);createServer(root,{port}).listen(port,'127.0.0.1',()=>console.log('Silent character editor: http://127.0.0.1:'+port+'/'));}
module.exports={createServer};
