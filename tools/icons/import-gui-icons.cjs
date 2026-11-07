'use strict';
// The 90 GUI icons requested by the user. Runes and demo artwork are excluded.
const path=require('node:path'),Importer=require('./import-pictograms.cjs');
function importPack(root,pack){return Importer.importPack(root,pack,{source:'ResourcesData/Sprite/Component/Icon_ItemIcons(x2)/128',folder:'GUI-Pro/Icons',registry:'tools/icons/gui-pro.catalog.json'});}
module.exports={importPack};
if(require.main===module){if(!process.argv[2])throw Error('Usage: node tools/icons/import-gui-icons.cjs "path/to/GUI PRO Kit - Casual Game"');const r=importPack(path.resolve(__dirname,'../..'),process.argv[2]);console.log(JSON.stringify({count:r.count,changedFiles:r.files.length,transaction:r.transaction}));}
