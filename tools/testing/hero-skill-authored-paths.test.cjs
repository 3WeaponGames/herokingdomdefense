'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3'),Paths=require('../../assets/_script/HeroSkillArrowPaths');
const setup=String.raw`
import copy,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('authored_paths','tools/skills-vfx/authored_paths.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
data=json.loads(Path('assets/resources/vfx/hero-skills/skirmisher-triple-volley/skirmisher-triple-volley.json').read_text(encoding='utf-8'))
`;
function run(body){const result=spawnSync(python,['-B','-c',setup+body],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.error?.message||result.stderr);return result.stdout;}
test('maintained native importer reproduces all nine deformed arrow paths and binds their production source hash',()=>{
 const actual=JSON.parse(run('print(json.dumps(module.sample(data)))'));assert.deepEqual(actual,Paths);
 const native=fs.readFileSync(path.join(root,'assets/resources/vfx/hero-skills/skirmisher-triple-volley/skirmisher-triple-volley.json'));assert.equal(Paths.sourceSha256,crypto.createHash('sha256').update(native).digest('hex'));
 assert.equal(Paths.trajectories.length,9);for(let i=0;i<3;i++)assert.equal(Paths.trajectories.filter(p=>p.volley===i).length,3);
 const first=Paths.trajectories.filter(p=>p.volley===0).map(p=>p.points[0]);assert.equal(Paths.sourceOrigin.x,first.reduce((n,p)=>n+p.x,0)/3);assert.equal(Paths.sourceOrigin.y,first.reduce((n,p)=>n+p.y,0)/3);
 const arrow=Paths.trajectories[0].points,at=t=>arrow.find(p=>Math.abs(p.t-t)<1e-6);assert(at(.7083333).y>at(.7).y+90);assert(at(.7583333).y>at(.75).y+90,'Deformations must move between attachment swaps');
});
test('sparse deformation sampling interpolates offsets and respects stepped keys and pre-roll',()=>{
 run(String.raw`
keys=[{'time':0,'offset':2,'vertices':[10,20]},{'time':1,'offset':2,'vertices':[30,40]}]
assert module.deformation(keys,-.1,6)==[0]*6
assert module.deformation(keys,.5,6)==[0,0,20,30,0,0]
keys[0]['curve']='stepped';assert module.deformation(keys,.5,6)==[0,0,10,20,0,0]
assert module.deformation(keys,2,6)==[0,0,30,40,0,0]
`);
});
test('unsupported source changes fail rather than silently publishing mismatched collision paths',()=>{
 run(String.raw`
for change in ('bones','weighted','bezier'):
 altered=copy.deepcopy(data)
 if change=='bones':altered['animations']['animation']['bones']={'root':{'translate':[{'time':0,'x':1}]}}
 else:
  slot=next(s for s in altered['animations']['animation']['slots'] if 'jujijian' in s)
  name=next(k['name'] for k in altered['animations']['animation']['slots'][slot]['attachment'] if k.get('name'))
  if change=='weighted':
   for attachment in altered['skins'][0]['attachments'][slot].values():attachment['vertices'].append(1)
  else:
   for frames in altered['animations']['animation']['deform']['default'][slot].values():
    for key in frames:key['curve']=[.2,.4,.6,.8]
 try:module.sample(altered)
 except ValueError:pass
 else:raise AssertionError('Unverified source change accepted: '+change)
`);
});
