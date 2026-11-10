'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function python(code){const result=spawnSync('python',['-B','-c',"import sys\nsys.path.insert(0,'tools/characters')\n"+code],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
test('Unity slice file IDs, bottom-left rectangles, exact pixels and custom pivots survive import',()=>{
  const result=python(`import io,json,yaml
from PIL import Image
from import_fantasy import slices
image=Image.new('RGBA',(4,4));image.putdata([(x*40,y*40,70,255) for y in range(4) for x in range(4)])
buffer=io.BytesIO();image.save(buffer,format='PNG')
meta={'TextureImporter':{'spriteMode':2,'spritePixelsToUnits':128,'internalIDToNameTable':[{'first':{213:42},'second':'HeadNormal'}],'spriteSheet':{'sprites':[{'name':'HeadNormal','rect':{'x':1,'y':0,'width':2,'height':2},'alignment':9,'pivot':{'x':.2,'y':.8}}]}}}
entry={'guid':'sheet','asset':buffer.getvalue(),'asset.meta':yaml.safe_dump(meta).encode(),'name':'Assets/sheet.png'}
images,refs,sheets=slices({'Assets/sheet.png':entry},{'sheet'});part=images[refs[('sheet','42')]]
print(json.dumps({'pixels':list(part['image'].getdata()),'pivot':part['pivot'],'ppu':part['ppu'],'rect':part['rect'],'size':[part['width'],part['height']]}))`);
  assert.deepEqual(result.size,[2,2]);assert.deepEqual(result.pixels,[[40,80,70,255],[80,80,70,255],[40,120,70,255],[80,120,70,255]]);assert.deepEqual(result.pivot,{x:.2,y:.8});assert.equal(result.ppu,128);
});
test('source expression events become native sprite keys and reset to Normal on each action',()=>{
  const result=python(`import json
from import_fantasy import prepare,encode_documents
from unity_monsters import documents
def entry(name,guid,docs):return {'name':name,'guid':guid,'asset':encode_documents(docs)}
sprite=lambda n:{'guid':'sheet','fileID':n}
prefab=entry('Assets/Golem.prefab','prefab',{1:(1,{'m_Name':'Root'}),2:(1,{'m_Name':'Body'}),3:(1,{'m_Name':'Head'}),11:(4,{'m_GameObject':{'fileID':1},'m_Father':{'fileID':0}}),12:(4,{'m_GameObject':{'fileID':2},'m_Father':{'fileID':11}}),13:(4,{'m_GameObject':{'fileID':3},'m_Father':{'fileID':12}}),20:(95,{'m_GameObject':{'fileID':1},'m_Controller':{'guid':'controller'}}),21:(212,{'m_GameObject':{'fileID':3},'m_Sprite':sprite(10)}),22:(114,{'Head':{'fileID':21},'HeadSprites':[sprite(10),sprite(11),sprite(12)]})})
controller=entry('Assets/Controller.controller','controller',{i:(1102,{'m_Name':name,'m_Motion':{'guid':name}}) for i,name in enumerate(['Idle','Walk','Attack','Death'],1)})
clips=[entry('Assets/'+name+'.anim',name,{1:(74,{'m_Name':name,'m_Events':[{'functionName':'SetHead','time':.2 if name=='Attack' else 0,'intParameter':1 if name=='Attack' else 2}] if name in ['Attack','Death'] else []})}) for name in ['Idle','Walk','Attack','Death']]
entries={item['name']:item for item in [prefab,controller]+clips};refs={('sheet',str(n)):'slice'+str(n) for n in [10,11,12]}
item,actions,controller,expressions,aliases=prepare(prefab,entries,refs)
bad=documents(prefab['asset']);bad[21][1]['m_Sprite']=sprite(99)
for clip in clips:
 docs=documents(clip['asset']);docs[1][1]['m_Events']=[];clip['asset']=encode_documents(docs)
_,_,_,bad_groups,_=prepare(entry(prefab['name'],'prefab',bad),entries,refs)
print(json.dumps({'idle':actions['idle']['m_PPtrCurves'][0]['curve'],'attack':actions['attack']['m_PPtrCurves'][0]['curve'],'die':actions['die']['m_PPtrCurves'][0]['curve'],'slot':expressions[0]['slot'],'aliases':aliases,'unwiredExpressions':len(bad_groups)}))`);
  assert.equal(result.slot,'Body/Head');assert.equal(result.idle[0].value.guid,'slice10');assert.deepEqual(result.attack.map(frame=>[frame.time,frame.value.guid]),[[0,'slice10'],[.2,'slice11']]);assert.deepEqual(result.die.map(frame=>[frame.time,frame.value.guid]),[[0,'slice12']]);assert.deepEqual(result.aliases,[]);
  assert.equal(result.unwiredExpressions,0,'A dormant field pointing at unrelated artwork is not an expression control');
});
