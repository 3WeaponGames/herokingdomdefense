'use strict';
const {createServer}=require('../characters/serve-editor.cjs');
const path=require('node:path');
function create(root,options){return createServer(root,{...options,kind:'projectiles'});}
if(require.main===module){const port=Number(process.env.PROJECTILE_EDITOR_PORT||8792);create(path.resolve(__dirname,'../..'),{port}).listen(port,'127.0.0.1',()=>console.log('Silent projectile editor: http://127.0.0.1:'+port+'/'));}
module.exports={createServer:create};
