'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const available=cp.spawnSync(python,['--version'],{encoding:'utf8'}).status===0;
function run(code){
  const setup='import sys,io,json,importlib.util\nfrom pathlib import Path\nfrom PIL import Image\nspec=importlib.util.spec_from_file_location("hkd_import_units",'+JSON.stringify(path.join(root,'tools/characters/import_units.py'))+')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nroot=Path('+JSON.stringify(root)+')\n';
  const result=cp.spawnSync(python,['-c',setup+code],{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);return result.stdout;
}
const pictures='def picture(width,height,seed):\n pixels=bytes((x*7+y*11+channel*31+seed)%256 for y in range(height) for x in range(width) for channel in range(4));return {"width":width,"height":height,"region":"region_"+str(seed),"image":Image.frombytes("RGBA",(width,height),pixels)}\n';

test('fixture co-used parts remain on one capped atlas page without changing source pixels or packing determinism',{skip:!available},()=>{
  run(pictures+
    'images={"a":picture(12,20,1),"b":picture(12,19,2),"c":picture(12,7,3),"d":picture(12,6,4)};groups=[["a","c"],["b","d"]]\n'+
    'old,scattered=m.atlas_pages(images,32);assert len({scattered[key][0] for key in groups[0]})==2\n'+
    'pages,placed=m.atlas_pages(images,32,groups=groups);assert len(pages)==2\n'+
    'assert all(len({placed[key][0] for key in group})==1 for group in groups)\n'+
    'reverse=m.atlas_pages(dict(reversed(list(images.items()))),32,groups=list(reversed(groups)));assert (pages,placed)==reverse\n'+
    'for index,(raw,width,height) in enumerate(pages):\n assert width<=32 and height<=32;page=Image.open(io.BytesIO(raw)).convert("RGBA")\n for key,(number,x,y) in placed.items():\n  if number!=index:continue\n  source=images[key]["image"];w,h=source.size;assert page.crop((x,y,x+w,y+h)).tobytes()==source.tobytes()\n'+
    'print("grouped-pixels-pass")');
});

test('fixture overlapping co-usage groups form one family and oversized families fall back without resampling',{skip:!available},()=>{
  run(pictures+
    'images={key:picture(20,20,index) for index,key in enumerate(["a","b","c"])}\n'+
    'pages,placed=m.atlas_pages(images,32,groups=[["a","b"],["b","c"]]);assert len(pages)==3;assert set(placed)==set(images)\n'+
    'for key,(index,x,y) in placed.items():\n raw,width,height=pages[index];assert width<=32 and height<=32;page=Image.open(io.BytesIO(raw));source=images[key]["image"];assert page.crop((x,y,x+source.width,y+source.height)).tobytes()==source.tobytes()\n'+
    'try:m.atlas_pages({"too-large":picture(29,1,4)},32,groups=[["too-large"]]);raise AssertionError("Oversized source was resampled")\nexcept ValueError:pass\n'+
    'try:m.atlas_pages(images,32,groups=[["missing"]]);raise AssertionError("Unknown region was discarded")\nexcept ValueError:pass\n'+
    'print("fallback-pixels-pass")');
});

test('current Monster 1 and 2 units can be repacked at 2048px with one page per complete skin family',{skip:!available},()=>{
  const report=JSON.parse(run('report=[]\nfor kind in ["monster1","monster2"]:\n'+
    ' folder=root/"assets/resources/unit-library"/kind;manifest=json.loads((folder/"catalog.json").read_text());rigs=[json.loads(file.read_text()) for file in sorted((folder/"Units").glob("*.json"))]\n'+
    ' needed=set().union(*(m.attachment_regions(rig) for rig in rigs));images={part["guid"]:{"width":part["width"],"height":part["height"],"region":"u_"+part["guid"]} for part in manifest["parts"] if "u_"+part["guid"] in needed}\n'+
    ' groups=m.atlas_region_groups(images,rigs);pages=m._atlas_layouts(images,2048,groups);placed={guid:number for number,page in enumerate(pages) for guid,x,y in page};assert set(placed)==set(images)\n'+
    ' assert all(len({placed[guid] for guid in group})==1 for group in groups if group)\n'+
    ' sizes=[(2**(max(x+images[guid]["width"]+2 for guid,x,y in page)-1).bit_length(),2**(max(y+images[guid]["height"]+2 for guid,x,y in page)-1).bit_length()) for page in pages];assert all(w<=2048 and h<=2048 for w,h in sizes)\n'+
    ' report.append({"pack":kind,"units":len(rigs),"pages":sizes,"bytes":sum(w*h*4 for w,h in sizes)})\nprint(json.dumps(report))'));
  assert.equal(report.length,2);for(const pack of report){assert(pack.units>100);assert(pack.bytes<4096*4096*4,'Locality preserves the memory improvement for '+pack.pack);}
});

test('published Monster 1 and 2 atlases keep every unit skin and animation on one texture page',{skip:!available},()=>{
  run('for kind in ["monster1","monster2"]:\n'+
    ' folder=root/"assets/resources/unit-library"/kind/"Units";files=sorted(folder.glob("*.json"));assert len(files)>100\n'+
    ' for file in files:\n  regions,_=m._read_atlas_regions(file.with_suffix(".atlas").read_bytes());needed=m.attachment_regions(json.loads(file.read_text()));pages={regions[name]["page"] for name in needed};assert len(pages)<=1,str(file)+" crosses texture pages: "+str(pages)\n'+
    'print("published-locality-pass")');
});
