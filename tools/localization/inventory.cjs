const fs=require('fs'),path=require('path');
const root=process.cwd(); const han=/[\u3400-\u9fff]/;
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);}
const out={scripts:[],labels:[],configs:[]};
for(const f of walk('assets')){
 if(f.endsWith('.js')){let s=fs.readFileSync(f,'utf8'), re=/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,m;while(m=re.exec(s)){let v;try{v=Function('return '+m[0])()}catch{}if(typeof v==='string'&&han.test(v)){let line=s.slice(0,m.index).split('\n').length;out.scripts.push({f,line,v,context:s.split('\n')[line-1].trim()})}}}
 if(/\.(prefab|fire)$/.test(f)){let data=JSON.parse(fs.readFileSync(f,'utf8'));data.forEach((x,i)=>{if(['cc.Label','cc.RichText','cc.EditBox'].includes(x.__type__)){for(let k of ['_string','_N$string','_N$placeholder'])if(x[k]&&/[A-Za-z\u3400-\u9fff]/.test(x[k]))out.labels.push({f,i,k,v:x[k]});}})}
 if(f.endsWith('.json')&&!f.includes('resources')){let d=JSON.parse(fs.readFileSync(f,'utf8'));function r(x,p){if(typeof x==='string'&&han.test(x))out.configs.push({f,p,v:x});else if(Array.isArray(x))x.forEach((v,i)=>r(v,p.concat(i)));else if(x&&typeof x==='object')Object.keys(x).filter(k=>k!=='TextCfg').forEach(k=>r(x[k],p.concat(k)));}r(d,[])}
}
fs.writeFileSync('tools/localization/inventory.json',JSON.stringify(out,null,2));
for(let [k,a] of Object.entries(out))console.log(k,a.length,'unique',new Set(a.map(x=>x.v)).size);
fs.writeFileSync('local/config-strings.txt',[...new Set(out.configs.map(x=>x.v))].join('\n'));
fs.writeFileSync('local/label-strings.txt',[...new Set(out.labels.map(x=>x.v))].join('\n'));
