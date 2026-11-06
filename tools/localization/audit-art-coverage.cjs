'use strict';
// Reproducible coverage/immutability audit of the visually reviewed 711-image
// baseline. This checks known text art; it is not an OCR claim about new assets.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const inventory=read('local/localization-art-audit/inventory.json');
const own=read('tools/localization/art-entries.json'),other=read('tools/localization/root-art-entries.json');
const templates={...own.artTemplates,...other.artTemplates};
const images={...own.images,...other.images},spine={...own.spineImages,...other.spineImages};
const indices=[56,57,58,59,60,61,62,63,107,108,109,110,253,273,275,277,279,280,314,315,316,317,318,319,320,321,322,323,324,325,450,451,516,517,609,636,682,684,685,686,696,699,705];
const referenceOnly=new Set([684,685]);
const textAssets=indices.map(index=>{
 const original=inventory[index];
 const mappings=[...Object.entries(images),...Object.entries(spine)].filter(([uuid,b])=>b.source===original.path);
 const ids=[...new Set(mappings.map(([uuid,b])=>b.template))];
 const generated=ids.flatMap(id=>['en','zh'].map(locale=>({locale,template:id,path:`assets/resources/localization/generated/${locale}/${id}.png`,exists:fs.existsSync(path.join(root,`assets/resources/localization/generated/${locale}/${id}.png`))})));
 return {index,source:original.path,classification:referenceOnly.has(index)?'unused original reference screenshot':'runtime text artwork',templates:ids,mappingUUIDs:mappings.map(([uuid])=>uuid),generated};
});
const missing=textAssets.filter(a=>a.classification==='runtime text artwork'&&!a.templates.length);
const originalChanges=inventory.filter(i=>hash(i.path)!==i.sha256).map(i=>i.path);
const sourceMissing=Object.entries(templates).filter(([id,t])=>t.source&&!fs.existsSync(path.join(root,t.source))).map(([id])=>id);
const report={baselineImages:inventory.length,visuallyIdentifiedTextImages:indices.length,runtimeTextImages:textAssets.length-referenceOnly.size,referenceOnlyImages:referenceOnly.size,templates:Object.keys(templates).length,sourceMissing,missingRuntimeBindings:missing.map(a=>a.source),originalChanges,generatedMissing:textAssets.flatMap(a=>a.generated.filter(g=>!g.exists).map(g=>g.path)),textAssets,notes:['The two original Chinese phone screenshots have no code, scene or prefab references; the active instruction composite is localized.','Open Noto Sans SC Black approximates the raster lettering; original source font files were unavailable.','Chinese originals are preserved by runtime bindings where configured until table text changes.']};
fs.writeFileSync(path.join(root,'local/localization-art-audit/coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,textAssets:undefined,notes:undefined}));
if(missing.length||originalChanges.length||sourceMissing.length)process.exitCode=1;
