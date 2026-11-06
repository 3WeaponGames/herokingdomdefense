'use strict';
const fs=require('fs'),path=require('path'),url=require('url');
function index(root){
    const result={images:[],prefabs:[],animations:[]};
    function scan(dir){fs.readdirSync(dir,{withFileTypes:true}).forEach(e=>{const file=path.join(dir,e.name);if(e.isDirectory())return scan(file);const rel=path.relative(root,file).replace(/\\/g,'/'),name=e.name.replace(/\.[^.]+$/,'');
        if(/\.(png|jpg|jpeg|webp)$/i.test(e.name))result.images.push({name,url:url.pathToFileURL(file).href,path:rel});
        else if(/\.prefab$/i.test(e.name))result.prefabs.push({name,path:rel});
        else if(/\.(anim|skel)$/i.test(e.name))result.animations.push({name,path:rel});
        else if(/\.json$/i.test(e.name)&&/KinghtFall(EnemyAni|Player)/.test(rel)){try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.skeleton&&d.animations)result.animations.push({name,path:rel,clips:Object.keys(d.animations),skins:Array.isArray(d.skins)?d.skins.map(s=>s.name):Object.keys(d.skins||{})});}catch(e){}}
    });}
    scan(path.join(root,'assets'));Object.keys(result).forEach(k=>result[k].sort((a,b)=>a.name.localeCompare(b.name)));return result;
}
module.exports={index};
