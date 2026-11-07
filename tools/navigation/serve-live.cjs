'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.LIVE_GATE_EXPORT?path.resolve(process.env.LIVE_GATE_EXPORT):path.resolve(__dirname, '../../local/live-gates/export/web-mobile');
const types = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.ttf':'font/ttf','.woff':'font/woff'};
http.createServer((req,res) => {
  const host=req.headers&&req.headers.host||'',authority=/^(localhost|127\.0\.0\.1|\[::1\]):8787$/i.test(host);
  if(!authority||req.headers.origin&&req.headers.origin!==new URL('http://'+host).origin){res.writeHead(403).end();return;}
  let rel;
  try { rel = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch (error) { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(error,bytes) => { if(error) {res.writeHead(404).end();return;} res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(bytes); });
}).listen(8787,'127.0.0.1',()=>console.log('Live gate build: http://127.0.0.1:8787/?live-gates=1'));
