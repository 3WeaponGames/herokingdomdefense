'use strict';
const path=require('node:path'),Hero=require('../../packages/hkd-characters/lib/hero-maker'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function generate(root){const result=Hero.plan(root);return Tx.commit(root,result.files,result.reads,'assets/KinghtFallEnemyAni/ndPlay.prefab');}
module.exports={generate};
if(require.main===module)console.log(generate(path.resolve(__dirname,'../..')));
