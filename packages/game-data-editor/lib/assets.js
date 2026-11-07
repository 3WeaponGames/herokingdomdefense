'use strict';
const fs=require('fs'),path=require('path'),url=require('url');
function index(root){
    const result={images:[],prefabs:[],animations:[]};
    const bundles=new Set(['resources']);
    fs.readdirSync(path.join(root,'assets'),{withFileTypes:true}).filter(e=>e.isDirectory()).forEach(e=>{try{if(JSON.parse(fs.readFileSync(path.join(root,'assets',e.name+'.meta'),'utf8')).isBundle)bundles.add(e.name);}catch(error){if(error.code!=='ENOENT')throw error;}});
    function scan(dir){fs.readdirSync(dir,{withFileTypes:true}).forEach(e=>{const file=path.join(dir,e.name);if(e.isDirectory())return scan(file);const rel=path.relative(root,file).replace(/\\/g,'/'),name=e.name.replace(/\.[^.]+$/,'');
        if(/\.(png|jpg|jpeg|webp)$/i.test(e.name)){
            const resource=rel.startsWith('assets/resources/')?rel.slice(17).replace(/\.[^.]+$/,''):null;
            const bundle=rel.split('/')[1];
            let frame=false;try{const meta=JSON.parse(fs.readFileSync(file+'.meta','utf8'));frame=Object.values(meta.subMetas||{}).some(m=>m.importer==='sprite-frame');}catch(error){if(error.code!=='ENOENT')throw error;}
            result.images.push({name,url:url.pathToFileURL(file).href,path:rel,bundle,resource,reference:frame?(resource?'@icon/'+resource:bundles.has(bundle)?'@sprite/'+bundle+'/'+rel.split('/').slice(2).join('/').replace(/\.[^.]+$/,''):null):null});
        }
        else if(/\.prefab$/i.test(e.name))result.prefabs.push({name,path:rel});
        else if(/\.(anim|skel)$/i.test(e.name))result.animations.push({name,path:rel});
        else if(/\.json$/i.test(e.name)&&/KinghtFall(EnemyAni|Player)/.test(rel)){try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.skeleton&&d.animations)result.animations.push({name,path:rel,clips:Object.keys(d.animations),skins:Array.isArray(d.skins)?d.skins.map(s=>s.name):Object.keys(d.skins||{})});}catch(e){}}
    });}
    scan(path.join(root,'assets'));Object.keys(result).forEach(k=>result[k].sort((a,b)=>a.name.localeCompare(b.name)));return result;
}
module.exports={index};
