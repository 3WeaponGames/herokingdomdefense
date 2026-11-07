'use strict';
const path=require('node:path'),{createServer}=require('./serve-editor.cjs');
const port=Number(process.env.ITEM_EDITOR_PORT||8791);createServer(path.resolve(__dirname,'../..'),{kind:'items',port}).listen(port,'127.0.0.1',()=>console.log('Silent item editor: http://127.0.0.1:'+port+'/'));
