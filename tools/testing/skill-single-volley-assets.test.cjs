'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),root=path.resolve(__dirname,'../..');
const original=Catalog.clips.find(clip=>clip.id==='skirmisher-triple-volley'),folder=path.dirname(path.join(root,'assets/resources',original.resource));

test('the three-arrow crop can still be verified outside the game library',t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-volley-source-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith('hkd-volley-source-'));
    fs.rmSync(temporary,{recursive:true,force:true});
  });
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  execFileSync(python,['-B','tools/skills-vfx/import-single-volley.py',temporary,'--node',process.execPath],{cwd:root,encoding:'utf8'});
  const output=path.join(temporary,fs.readdirSync(temporary)[0]);
  const report=JSON.parse(fs.readFileSync(path.join(output,'verification.json')));
  assert.equal(report.arrows,3);assert.equal(report.flashLayers,2);assert(report.samples>700);assert(report.pieces>3000);assert(report.maxDrift<=.001);
});

test('the single-volley removal preserves the triple-volley Spine and shared texture page',()=>{
  assert.equal(Catalog.presets.skirmisher,undefined);
  assert(!Catalog.clips.some(clip=>clip.id==='skirmisher-single-volley'));
  for(const suffix of ['.json','.atlas','.json.meta','.atlas.meta'])assert(!fs.existsSync(path.join(folder,'skirmisher-single-volley'+suffix)));
  const meta=JSON.parse(fs.readFileSync(path.join(folder,'skirmisher-triple-volley.json.meta')));
  const page=JSON.parse(fs.readFileSync(path.join(folder,'page_000.png.meta')));
  assert.deepEqual(meta.textures,[page.uuid]);
  const atlas=fs.readFileSync(path.join(folder,'skirmisher-triple-volley.atlas'),'utf8');
  assert(atlas.split(/\r?\n/).includes('page_000.png'));assert(fs.statSync(path.join(folder,'page_000.png')).size>0);
});
