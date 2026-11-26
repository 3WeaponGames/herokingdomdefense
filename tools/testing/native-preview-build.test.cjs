'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const SOURCE=process.env.HKD_NATIVE_BUILD_SOURCE||path.resolve(__dirname,'../native/build-native-preview.cjs');
const api=require(SOURCE),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const unitRegionBounds=require('../native/unit-region-bounds.cjs');
const manualCameraMatrices = require('../native/manual-camera-matrices.cjs');
const foregroundStencilReuse = require('../native/foreground-stencil-reuse.cjs');
const captureRendererInventory = require('../native/capture-renderer-inventory.cjs');
const captureFramebufferStatus = require('../native/capture-framebuffer-status.cjs');
const nvidiaOptimus = require('../native/nvidia-optimus.cjs');
const terrainRevision = require('../native/terrain-geometry-revision.cjs');
const groupedMasks = require('../native/grouped-mask-queue.cjs');
const targetlessActorCaptures = require('../native/targetless-actor-captures.cjs');
const targetlessLeafMatrices = require('../native/targetless-leaf-matrices.cjs');
const v8InlineBudget = require('../native/v8-inline-budget.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-native-build-'));t.after(()=>{assert(path.basename(root).startsWith('hkd-native-build-')&&path.dirname(root)===os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});return root;}
function write(file,bytes='fixture'){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;}
function projectFixture(project,includes){
  const source=`<Project>\n<PropertyGroup><PlatformToolset>v120</PlatformToolset>\n<WindowsTargetPlatformVersion>8.1</WindowsTargetPlatformVersion></PropertyGroup>\n<Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />\n<PropertyGroup><OutDir>installed</OutDir><IntDir>installed</IntDir></PropertyGroup>\n<ItemDefinitionGroup Condition="'$(Configuration)'=='Release'"><ClCompile><PreprocessorDefinitions>COCOS2D_DEBUG=1;CC_STATIC;</PreprocessorDefinitions></ClCompile><PostBuildEvent><Command>unsafe</Command></PostBuildEvent></ItemDefinitionGroup>\n<ItemDefinitionGroup Condition="'$(Configuration)'=='Debug'"><ClCompile><PreprocessorDefinitions>COCOS2D_DEBUG=1;</PreprocessorDefinitions></ClCompile></ItemDefinitionGroup>\n<ItemGroup>${includes.map(include=>'<ClCompile Include="'+include+'" />').join('')}</ItemGroup>\n  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />\n</Project>\n`;
  return{source,project:{...project,count:includes.length,sha256:sha(Buffer.from(source))}};
}
function pe(imports=[],machine=0x14c){
  const data=Buffer.alloc(0x1800),pe=0x80,optional=pe+24,optionalSize=machine===0x14c?224:240,dir=optional+(machine===0x14c?96:112),section=optional+optionalSize;
  data.write('MZ');data.writeUInt32LE(pe,0x3c);data.write('PE\0\0',pe,'ascii');data.writeUInt16LE(machine,pe+4);data.writeUInt16LE(1,pe+6);data.writeUInt16LE(optionalSize,pe+20);data.writeUInt16LE(machine===0x14c?0x10b:0x20b,optional);data.writeUInt32LE(0x1000,section+8);data.writeUInt32LE(0x1000,section+12);data.writeUInt32LE(0x1000,section+16);data.writeUInt32LE(0x200,section+20);
  if(imports.length){data.writeUInt32LE(0x1000,dir+8);data.writeUInt32LE((imports.length+1)*20,dir+12);let name=0x400;imports.forEach((value,i)=>{data.writeUInt32LE(0x1000+name-0x200,0x200+i*20+12);data.write(value+'\0',name,'ascii');name+=value.length+1;});}return data;
}
function fakeTools(root){const vs=path.join(root,'VS'),programFiles=path.join(root,'Program Files (x86)');
  for(const file of ['MSBuild/Current/Bin/MSBuild.exe','MSBuild/Microsoft/VC/v170/Platforms/Win32/PlatformToolsets/v143/Toolset.props','VC/Tools/MSVC/14.44.35207/bin/Hostx64/x86/cl.exe','VC/Redist/MSVC/14.44.35112/x86/Microsoft.VC143.CRT/vcruntime140.dll'])write(path.join(vs,file));
  for(const file of ['Include/10.0.26100.0/um/Windows.h','Include/10.0.26100.0/ucrt/stdio.h','Lib/10.0.26100.0/um/x86/kernel32.lib','Lib/10.0.26100.0/ucrt/x86/ucrt.lib'])write(path.join(programFiles,'Windows Kits/10',file));
  write(path.join(programFiles,'Microsoft Visual Studio/Installer/vswhere.exe'));return{vs,programFiles};
}
test('CLI defaults to stock Release and accepts explicit cleanup and region bounds flags',()=>{assert.deepEqual(api.parseArgs(['--sdk-root','SDK','--output-root','OUT','--vs-root','VS']),{sdkRoot:'SDK',outputRoot:'OUT',vsRoot:'VS'});assert.deepEqual(api.parseArgs(['--spine-inline-color-cleanup']),{spineInlineColorCleanup:true});assert.deepEqual(api.parseArgs(['--unit-region-bounds']),{unitRegionBounds:true});assert.deepEqual(api.parseArgs(['--spine-inline-color-cleanup','--unit-region-bounds']),{spineInlineColorCleanup:true,unitRegionBounds:true});assert.throws(()=>api.parseArgs(['--spine-inline-color-cleanup','false']),/Unknown/);assert.throws(()=>api.parseArgs(['--unit-region-bounds','false']),/Unknown/);assert.throws(()=>api.parseArgs(['--high-resolution-pacing']),/Unknown/);assert.throws(()=>api.parseArgs(['--sdk-root']),/Unknown/);});
test('region bounds applies exact binding anchors only in the clone and verifies its independent receipt',t=>{
  const root=fixture(t),sdk=path.join(root,'sdk'),clone=path.join(root,'clone'),patch=unitRegionBounds.definition();
  const binding=patch.changes[0].after;
  assert.match(binding,/if \(args\.size\(\) == 9 && !args\[8\]\.isBoolean\(\)\) return true;/);
  assert.match(binding,/const bool includeMeshes = args\.size\(\) == 9 && args\[8\]\.toBoolean\(\);/);
  assert.match(binding,/if \(!includeMeshes \|\| !hkdIncludeHealthMesh\(/);
  const before=Buffer.from(patch.changes.map(change=>change.before).join('\n')+'\n');
  const after=Buffer.from(patch.changes.map(change=>change.after).join('\n')+'\n');
  const expected={...patch,beforeSha256:sha(before),afterSha256:sha(after)};
  const installed=write(path.join(sdk,patch.file),before),copied=write(path.join(clone,patch.file),before);
  assert.deepEqual(api.prepareSourcePatches(clone,false,[expected],'unitRegionBounds'),[]);
  assert.throws(()=>unitRegionBounds.patchSource(before),/source hash/);
  const duplicate=Buffer.concat([before,before]);
  assert.throws(()=>unitRegionBounds.patchSource(duplicate,{...expected,beforeSha256:sha(duplicate)}),/patch anchor/);
  const patches=api.prepareSourcePatches(clone,true,[expected],'unitRegionBounds');
  assert.deepEqual(fs.readFileSync(copied),before);
  const diff=api.writeSourcePatchArtifacts(root,clone,patches);
  assert.equal(path.basename(diff.file),'unit-region-bounds-diff.json');
  assert.equal(JSON.parse(fs.readFileSync(diff.file)).feature,'unitRegionBounds');
  assert.deepEqual(fs.readFileSync(copied),after);
  assert.deepEqual(fs.readFileSync(installed),before);
  const backup=path.join(root,'source-patch-backups/unit-region-bounds',patch.file);
  assert.deepEqual(fs.readFileSync(backup),before);
  api.verifySourcePatchArtifacts(root,patches,diff);
  fs.writeFileSync(backup,'drift');
  assert.throws(()=>api.verifySourcePatchArtifacts(root,patches,diff),/backup changed/);
});

test('manual camera matrix patch is opt-in, preserves stock dispatch and records the verified clone', t => {
  const feature = 'manualCameraMatrices';
  assert.equal(Object.hasOwn(api.parseArgs([]), feature), false);
  assert.deepEqual(api.parseArgs(['--manual-camera-matrices', '--unit-region-bounds']), {
    manualCameraMatrices: true, unitRegionBounds: true
  });
  assert.throws(() => api.parseArgs(['--manual-camera-matrices', 'false']), /Unknown/);

  const patch = manualCameraMatrices.definition();
  assert.equal(patch.file, 'cocos/renderer/scene/RenderFlow.cpp');
  assert.equal(patch.beforeSha256, '91e8fa68945451a6ae12b8a1324fb7e429c78dc69bd06feb3b09fbd7ae2a6f53');
  assert.equal(patch.afterSha256, '662450d433e2eb61af9a31baf436958b92d1df023ba444a6ded8a97523f01848');
  const patchedSource = patch.changes.map(change => change.after).join('\n');
  const dispatch = patch.changes.find(change => change.after.includes('calculateLocalMatrices<true>(-1);'));
  assert.ok(dispatch, 'The patch adds the manual matrix dispatch');
  assert.match(dispatch.after, /#if defined\(HKD_MANUAL_MATRIX_SSE2\)[\s\S]*?if \(camera\)\s*\{\s*calculateLocalMatrices<true>\(-1\);\s*calculateWorldMatrix\(\);\s*\}\s*else/);
  assert.ok(dispatch.after.endsWith(dispatch.before), 'The normal render still reaches the original worker dispatch');
  assert.match(patchedSource, /calculateLocalMatrices<false>\(tid\)/);
  assert.match(patchedSource, /_mm_loadu_si128/);
  assert.match(patchedSource, /freeFlag == SPACE_FREE_FLAG/);

  for (const lineEnding of ['\n', '\r\n']) {
    const root = fixture(t), sdk = path.join(root, 'sdk'), clone = path.join(root, 'clone');
    const source = key => Buffer.from(['// before anchors', ...patch.changes.map(change => change[key]), '// after anchors', '']
      .join('\n').replaceAll('\n', lineEnding));
    const before = source('before'), expected = source('after');
    const hashes = { beforeSha256: sha(before), afterSha256: sha(expected) };
    const fixturePatch = { ...patch, ...hashes };
    const installed = write(path.join(sdk, patch.file), before), copied = write(path.join(clone, patch.file), before);
    const originals = [{ file: patch.file, sha256: hashes.beforeSha256 }];

    const disabled = api.prepareSourcePatches(clone, false, [fixturePatch], feature);
    assert.deepEqual(disabled, []);
    assert.equal(api.writeSourcePatchArtifacts(root, clone, disabled), null);
    assert.deepEqual(fs.readFileSync(copied), before);
    assert.throws(() => manualCameraMatrices.patchSource(before), /source hash/);
    const duplicate = Buffer.concat([before, before]);
    assert.throws(() => manualCameraMatrices.patchSource(duplicate, { ...fixturePatch, beforeSha256: sha(duplicate) }), /patch anchor/);
    assert.throws(() => manualCameraMatrices.patchSource(before, { ...fixturePatch, afterSha256: hashes.beforeSha256 }), /result hash/);

    const prepared = api.prepareSourcePatches(clone, true, [fixturePatch], feature);
    assert.deepEqual(fs.readFileSync(copied), before);
    const receipt = { file: patch.file, feature, kind: 'implementation', ...hashes };
    assert.deepEqual(prepared.map(api.sourcePatchRecord), [receipt]);
    const diff = api.writeSourcePatchArtifacts(root, clone, prepared);
    assert.equal(path.basename(diff.file), 'manual-camera-matrices-diff.json');
    const diffBytes = fs.readFileSync(diff.file);
    assert.equal(diff.sha256, sha(diffBytes));
    assert.deepEqual(JSON.parse(diffBytes), {
      format: 'exact-replacement-v1', feature, patches: [{ ...receipt, changes: patch.changes }]
    });
    assert.deepEqual(fs.readFileSync(copied), expected);
    assert.deepEqual(fs.readFileSync(installed), before);
    assert.deepEqual(fs.readFileSync(path.join(root, 'source-patch-backups/manual-camera-matrices', patch.file)), before);
    assert.deepEqual(api.verifySourceFiles(sdk, clone, originals, prepared),
      api.implementationDigest([{ file: patch.file, sha256: hashes.afterSha256 }]));
    api.verifySourcePatchArtifacts(root, prepared, diff);
  }
});

const creatorSDK=process.env.HKD_CREATOR_SDK_ROOT||(process.platform==='win32'?'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/cocos2d-x':null);
test('terrain geometry revision is an independent build opt-in',()=>{
  assert.equal(Object.hasOwn(api.parseArgs([]),terrainRevision.FEATURE),false);
  assert.deepEqual(api.parseArgs(['--terrain-geometry-revision','--manual-camera-matrices']),{
    terrainGeometryRevision:true,manualCameraMatrices:true
  });
  assert.throws(()=>api.parseArgs(['--terrain-geometry-revision','false']),/Unknown/);
});

test('terrain engine resources are pinned, versioned and compose with the grouped adapter',{
  skip:!creatorSDK||!terrainRevision.PATCHES.every(patch=>fs.existsSync(path.join(creatorSDK,patch.file)))
},t=>{
  const root=fixture(t),sdk=path.join(root,'sdk'),clone=path.join(root,'clone'),feature=terrainRevision.FEATURE;
  for(const patch of terrainRevision.PATCHES){
    const bytes=fs.readFileSync(path.join(creatorSDK,patch.file));
    write(path.join(sdk,patch.file),bytes);write(path.join(clone,patch.file),bytes);
    assert.equal(sha(bytes),patch.beforeSha256);
    assert.throws(()=>terrainRevision.patchSource(Buffer.concat([bytes,Buffer.from(' ')]),patch),/Unsupported terrain geometry revision source/);
  }
  assert.deepEqual(api.prepareSourcePatches(clone,false,terrainRevision.PATCHES,feature),[]);
  const patches=api.prepareSourcePatches(clone,true,terrainRevision.PATCHES,feature);
  const diff=api.writeSourcePatchArtifacts(root,clone,patches);
  assert.equal(path.basename(diff.file),'terrain-geometry-revision-diff.json');
  assert(patches.map(api.sourcePatchRecord).every(record=>record.kind==='resource'));
  api.verifySourcePatchArtifacts(root,patches,diff);
  api.verifyResourceFiles(sdk,clone,patches);
  const core=patches[0].after.toString('utf8');
  new vm.Script(core);
  const start=core.indexOf('    (function () {\n      var listeners =');
  const end=core.indexOf('    })();',start)+'    })();'.length;
  assert(start>=0&&end>start);
  const cc={};
  new vm.Script(core.slice(start,end)).runInNewContext({cc});
  const tracker=cc._hkdTerrainGeometry,main={},rootNode={},child={};
  assert.equal(tracker.version,1);
  assert(Object.isFrozen(tracker));
  assert.equal(Object.getOwnPropertyDescriptor(cc,'_hkdTerrainGeometry').writable,false);
  assert.equal(tracker.track([rootNode],[main]),null,'Ancestor set must be owned');
  const ticket=tracker.track([main,rootNode,child],[main]);
  assert.equal(tracker.track([main],[]),null);
  tracker.markMembership(main);
  assert.equal(ticket.value,0);
  tracker.markMembership(rootNode);
  tracker.mark(main);
  tracker.mark(child);
  assert.equal(ticket.value,3);
  tracker.release(ticket,[main,rootNode,child]);
  const next=tracker.track([main],[]);
  tracker.release(ticket,[main]);
  tracker.markMembership(main);
  assert.equal(next.value,1);
  assert.match(core,/this\._parent = value \|\| null;\n\s+cc\._hkdTerrainGeometry\.mark\(this\);\n\s+cc\._hkdTerrainGeometry\.markMembership\(oldParent\);/);
  assert.match(core,/this\._type = value;\n\s+cc\._hkdTerrainGeometry\.mark\(this\);\n\s+this\.setVertsDirty\(\);/);
  assert.match(core,/this\._objFlags \|= Destroying;\n\s+cc\._hkdTerrainGeometry\.mark\(this\);/);
  const adapter=patches[1],combined=terrainRevision.patchGroupedAdapter(groupedMasks.patch(adapter.before));
  new vm.Script(combined.toString('utf8'));
  assert.match(combined.toString('utf8'),/\.setLocalDirty = function \(flag\) {\n  this\._localMatDirty \|= flag;\n  cc\._hkdTerrainGeometry\.mark\(this\);/);
  assert.match(combined.toString('utf8'),/RenderFlow\._hkdMaskQueue/);
  assert.throws(()=>terrainRevision.patchGroupedAdapter(adapter.before),/Unsupported terrain geometry revision source/);
  fs.appendFileSync(path.join(clone,terrainRevision.CORE),'// drift');
  assert.throws(()=>api.verifyResourceFiles(sdk,clone,patches),/Copied engine resource changed/);
});

test('capture framebuffer status is opt-in and includes owned capture target support', () => {
  assert.equal(Object.hasOwn(api.parseArgs([]), 'captureFramebufferStatus'), false);
  assert.deepEqual(api.parseArgs(['--capture-framebuffer-status', '--unit-region-bounds']), {
    captureFramebufferStatus: true, captureRendererInventory: true, unitRegionBounds: true
  });
  assert.throws(() => api.parseArgs(['--capture-framebuffer-status', 'false']), /Unknown/);
});

test('capture framebuffer status composes with both supported inventory source variants', {
  skip: !creatorSDK || !captureFramebufferStatus.definitions().every(patch => fs.existsSync(path.join(creatorSDK, patch.file)))
}, t => {
  const root = fixture(t), feature = 'captureFramebufferStatus';
  for (const withBounds of [false, true]) {
    const clone = path.join(root, String(withBounds), 'source');
    const preceding = captureRendererInventory.definitions(withBounds);
    const definitions = captureFramebufferStatus.definitions(withBounds);
    assert.equal(definitions.length, 8);
    for (const { file } of definitions.concat(preceding)) {
      write(path.join(clone, file), fs.readFileSync(path.join(creatorSDK, file)));
    }
    const bounds = api.prepareSourcePatches(clone, withBounds, [unitRegionBounds.definition()], 'unitRegionBounds');
    const inventory = api.prepareSourcePatches(clone, true, preceding, 'captureRendererInventory', bounds);
    const status = api.prepareSourcePatches(clone, true, definitions, feature, inventory);
    const sdkSpine = status.find(patch => patch.file.endsWith('/jsb_spine_manual.cpp'));
    const stockInventory = inventory.find(patch => patch.file === sdkSpine.file);
    assert.equal(sdkSpine.beforeSha256, stockInventory.afterSha256);
    assert.match(sdkSpine.after.toString(), /defineFunction\("_hkdArmCaptureFramebufferStatus"/);
    assert.throws(() => captureFramebufferStatus.patchSource(Buffer.concat([sdkSpine.before, Buffer.from(' ')]),
      definitions.find(patch => patch.file === sdkSpine.file)), /source hash/);
  }
});

test('NVIDIA Optimus preference is an independent, value-free opt-in',()=>{
  assert.equal(Object.hasOwn(api.parseArgs([]),'preferNvidia'),false);
  assert.deepEqual(api.parseArgs(['--manual-camera-matrices','--prefer-nvidia']),{manualCameraMatrices:true,preferNvidia:true});
  assert.throws(()=>api.parseArgs(['--prefer-nvidia','false']),/Unknown/);
});

test('NVIDIA preference patches only the cloned main.cpp and records its source proof',{
  skip:!creatorSDK||!fs.existsSync(path.join(creatorSDK,nvidiaOptimus.PATCH.file))
},t=>{
  const feature='nvidiaOptimusPreference',patch=nvidiaOptimus.PATCH;
  const root=fixture(t),sdk=path.join(root,'sdk'),clone=path.join(root,'clone');
  const input=path.join(creatorSDK,patch.file),before=fs.readFileSync(input);
  assert.equal(sha(before),patch.beforeSha256);
  const installed=write(path.join(sdk,patch.file),before),copied=write(path.join(clone,patch.file),before);
  const originals=[{file:patch.file,sha256:patch.beforeSha256}];
  assert.deepEqual(api.prepareSourcePatches(clone,false,[patch],feature),[]);
  assert.deepEqual(fs.readFileSync(copied),before);
  assert.throws(()=>nvidiaOptimus.patchSource(Buffer.concat([before,Buffer.from(' ')])),/source hash/);
  const prepared=api.prepareSourcePatches(clone,true,[patch],feature);
  assert.deepEqual(fs.readFileSync(copied),before);
  const diff=api.writeSourcePatchArtifacts(root,clone,prepared);
  assert.equal(path.basename(diff.file),'nvidia-optimus-preference-diff.json');
  assert.equal(JSON.parse(fs.readFileSync(diff.file)).feature,feature);
  assert.equal(sha(fs.readFileSync(copied)),patch.afterSha256);
  assert.match(fs.readFileSync(copied,'utf8'),/extern "C" \{\n__declspec\(dllexport\) DWORD NvOptimusEnablement = 0x00000001;/);
  assert.deepEqual(fs.readFileSync(installed),before);
  assert.deepEqual(fs.readFileSync(input),before);
  assert.deepEqual(api.verifySourceFiles(sdk,clone,originals,prepared),api.implementationDigest([{file:patch.file,sha256:patch.afterSha256}]));
  api.verifySourcePatchArtifacts(root,prepared,diff);
});

function optimusImage(exportName = 'NvOptimusEnablement'){
  const image=pe(),nt=0x80,optional=nt+24,section=optional+224,data=section+40;
  image.writeUInt16LE(2,nt+6);
  image.writeUInt32LE(16,optional+92);
  image.writeUInt32LE(0x1000,optional+96);
  image.writeUInt32LE(0x100,optional+100);
  image.write('.rdata',section);
  image.writeUInt32LE(0x600,section+8);
  image.writeUInt32LE(0x600,section+16);
  image.writeUInt32LE(0x40000040,section+36);
  image.write('.data',data);
  image.writeUInt32LE(0x100,data+8);
  image.writeUInt32LE(0x2000,data+12);
  image.writeUInt32LE(0x100,data+16);
  image.writeUInt32LE(0x800,data+20);
  image.writeUInt32LE(0xc0000040,data+36);
  image.writeUInt32LE(2,0x214);
  image.writeUInt32LE(2,0x218);
  image.writeUInt32LE(0x1040,0x21c);
  image.writeUInt32LE(0x1050,0x220);
  image.writeUInt32LE(0x1060,0x224);
  image.writeUInt32LE(0x2004,0x240);
  image.writeUInt32LE(0x2000,0x244);
  image.writeUInt32LE(0x1080,0x250);
  image.writeUInt32LE(0x10a0,0x254);
  image.writeUInt16LE(1,0x260);
  image.writeUInt16LE(0,0x262);
  image.write(exportName+'\0',0x280);
  image.write('ZAnotherExport\0',0x2a0);
  image.writeUInt32LE(1,0x800);
  return image;
}

test('NVIDIA receipt resolves a real initialized data export and validates its DWORD',()=>{
  assert.deepEqual(nvidiaOptimus.verifyExport(optimusImage()),{
    symbol:'NvOptimusEnablement',value:1,rva:0x2000,section:'.data'
  });
  for(const [mutate,message] of [
    [bytes=>bytes.writeUInt32LE(0,0x800),/DWORD value 1/],
    [bytes=>bytes.writeUInt32LE(0x1080,0x244),/forwarded export/],
    [bytes=>bytes.writeUInt32LE(0x20fe,0x244),/unmapped/],
    [bytes=>bytes.writeUInt32LE(0x60000060,0x1c4),/initialized readable data/],
    [bytes=>bytes.writeUInt16LE(2,0x260),/ordinal/],
    [bytes=>bytes.writeUInt32LE(0x1080,0x254),/duplicate/],
    [bytes=>bytes[0x280]=0xce,/missing NvOptimusEnablement/],
    [bytes=>bytes.writeUInt32LE(0,0xf8),/missing export directory/]
  ]){
    const bytes=optimusImage();mutate(bytes);
    assert.throws(()=>nvidiaOptimus.verifyExport(bytes),message);
  }
  assert.throws(()=>nvidiaOptimus.verifyExport(Buffer.alloc(12)),/DOS header/);
  assert.throws(()=>nvidiaOptimus.verifyExport(optimusImage().subarray(0,0x870)),/section range/);
});

test('targetless leaf matrices are opt-in and require both matrix and targetless support', () => {
  const targetless = ['--capture-framebuffer-status', '--terrain-geometry-revision', '--targetless-actor-captures'];
  assert.equal(Object.hasOwn(api.parseArgs([]), 'targetlessLeafMatrices'), false);
  assert.throws(() => api.parseArgs(['--targetless-leaf-matrices']), /requires --targetless-actor-captures and --manual-camera-matrices/);
  assert.throws(() => api.parseArgs([...targetless, '--targetless-leaf-matrices']), /requires --targetless-actor-captures and --manual-camera-matrices/);
  const options = api.parseArgs([...targetless, '--manual-camera-matrices', '--targetless-leaf-matrices']);
  assert.equal(options.targetlessLeafMatrices, true);
  assert.throws(() => api.parseArgs([...targetless, '--manual-camera-matrices', '--targetless-leaf-matrices', 'false']), /Unknown/);

  const symbol = 'HKDTargetlessLeafMatrices';
  assert.deepEqual(targetlessLeafMatrices.verifyExport(optimusImage(symbol)), {symbol, value: 1, rva: 0x2000, section: '.data'});
  assert.throws(() => targetlessLeafMatrices.verifyExport(optimusImage()), /missing HKDTargetlessLeafMatrices/);
});

test('the V8 inlining budget is an independent, value-free Release option with a linked receipt', () => {
  assert.equal(Object.hasOwn(api.parseArgs([]), 'v8InlineBudget'), false);
  assert.deepEqual(api.parseArgs(['--v8-inline-budget']), {v8InlineBudget: true});
  assert.throws(() => api.parseArgs(['--v8-inline-budget', 'off']), /Unknown/);
  const symbol = 'HKDV8InlineBudget';
  assert.deepEqual(v8InlineBudget.verifyExport(optimusImage(symbol)), {symbol, value: 1, rva: 0x2000, section: '.data'});
  assert.throws(() => v8InlineBudget.verifyExport(optimusImage()), /missing HKDV8InlineBudget/);
});

test('the V8 inlining patch verifies the installed Creator source and the scoped clone', {skip: !creatorSDK}, t => {
  const root = fixture(t), sdkClone = path.join(root, 'clone');
  const definitions = v8InlineBudget.definitions();
  assert.equal(definitions.length, 1);
  const [definition] = definitions;
  const installed = path.join(creatorSDK, definition.file);
  const before = fs.readFileSync(installed);
  const cloned = write(path.join(sdkClone, definition.file), before);
  const patches = api.prepareSourcePatches(sdkClone, true, definitions, v8InlineBudget.FEATURE);
  const diff = api.writeSourcePatchArtifacts(root, sdkClone, patches);
  assert.equal(path.basename(diff.file), 'v8-inline-budget-diff.json');
  api.verifySourcePatchArtifacts(root, patches, diff);
  assert.equal(sha(fs.readFileSync(cloned)), definition.afterSha256);
  assert.deepEqual(fs.readFileSync(installed), before);
});

test('targetless leaf matrices preserve the exact preceding native patch receipts', {
  skip: !creatorSDK
}, t => {
  const root = fixture(t);
  const options = {manualCameraMatrices: true, targetlessActorCaptures: true};
  const definitions = targetlessLeafMatrices.definitions(options);
  const files = new Set(definitions.map(patch => patch.file));
  for (const file of files) write(path.join(root, file), fs.readFileSync(path.join(creatorSDK, file)));

  const manual = api.prepareSourcePatches(root, true, [manualCameraMatrices.definition()], 'manualCameraMatrices');
  const targetlessDefinitions = targetlessActorCaptures.definitions(options).filter(patch => files.has(patch.file));
  const targetless = api.prepareSourcePatches(root, true, targetlessDefinitions, targetlessActorCaptures.FEATURE, manual);
  const leaf = api.prepareSourcePatches(root, true, definitions, targetlessLeafMatrices.FEATURE, manual.concat(targetless));
  assert.equal(leaf.length, 4);
  assert.equal(targetless.length, 2);
  for (const earlier of targetless) {
    const later = leaf.find(patch => patch.file === earlier.file);
    assert.equal(later.beforeSha256, earlier.afterSha256);
  }
  const manualDiff = api.writeSourcePatchArtifacts(root, root, manual);
  const targetlessDiff = api.writeSourcePatchArtifacts(root, root, targetless);
  const leafDiff = api.writeSourcePatchArtifacts(root, root, leaf);
  api.verifySourcePatchArtifacts(root, manual, manualDiff);
  api.verifySourcePatchArtifacts(root, targetless, targetlessDiff);
  api.verifySourcePatchArtifacts(root, leaf, leafDiff);
  assert.deepEqual(JSON.parse(fs.readFileSync(leafDiff.file)).patches.map(patch => patch.file), [...files]);
});

test('foreground stencil reuse is an independent native Release option', () => {
  assert.equal(Object.hasOwn(api.parseArgs([]), 'foregroundStencilReuse'), false);
  assert.deepEqual(api.parseArgs(['--foreground-stencil-reuse', '--unit-region-bounds', '--manual-camera-matrices']), {
    foregroundStencilReuse: true, unitRegionBounds: true, manualCameraMatrices: true
  });
  assert.throws(() => api.parseArgs(['--foreground-stencil-reuse', 'false']), /Unknown/);
  const others = [
    ...require('../native/spine-inline-color-cleanup.cjs').PATCHES,
    unitRegionBounds.definition(),
    manualCameraMatrices.definition()
  ];
  const touched = new Set(others.map(patch => patch.file));
  assert(foregroundStencilReuse.PATCHES.length);
  for (const patch of foregroundStencilReuse.PATCHES) {
    assert(!touched.has(patch.file), patch.file);
    touched.add(patch.file);
    assert.notEqual(patch.beforeSha256, patch.afterSha256);
  }
});

test('foreground stencil patches and exact receipts cover every modified SDK file', {
  skip: !creatorSDK || !foregroundStencilReuse.PATCHES.every(patch => fs.existsSync(path.join(creatorSDK, patch.file)))
}, t => {
  const root = fixture(t), sdk = path.join(root, 'sdk'), clone = path.join(root, 'clone'), originals = [];
  for (const patch of foregroundStencilReuse.PATCHES) {
    const bytes = fs.readFileSync(path.join(creatorSDK, patch.file));
    assert.equal(sha(bytes), patch.beforeSha256);
    originals.push({ file: patch.file, sha256: patch.beforeSha256 });
    write(path.join(sdk, patch.file), bytes);
    write(path.join(clone, patch.file), bytes);
  }
  const feature = 'foregroundStencilReuse';
  const patches = api.prepareSourcePatches(clone, true, foregroundStencilReuse.PATCHES, feature);
  for (const patch of patches) assert.equal(sha(fs.readFileSync(path.join(clone, patch.file))), patch.beforeSha256);
  const diff = api.writeSourcePatchArtifacts(root, clone, patches);
  assert.equal(path.basename(diff.file), 'foreground-stencil-reuse-diff.json');
  const receipts = JSON.parse(fs.readFileSync(diff.file)).patches;
  assert.deepEqual(receipts.map(patch => patch.file), patches.map(patch => patch.file));
  assert(receipts.every(patch => patch.feature === feature));
  for (const patch of patches) {
    assert.equal(sha(fs.readFileSync(path.join(clone, patch.file))), patch.afterSha256);
    assert.equal(sha(fs.readFileSync(path.join(creatorSDK, patch.file))), patch.beforeSha256);
    assert.equal(sha(fs.readFileSync(path.join(root, 'source-patch-backups/foreground-stencil-reuse', patch.file))), patch.beforeSha256);
  }
  api.verifySourceFiles(sdk, clone, originals, patches);
  api.verifySourcePatchArtifacts(root, patches, diff);
});

test('the pristine Creator source accepts the audited region bridge in memory',{skip:!creatorSDK||!fs.existsSync(path.join(creatorSDK,unitRegionBounds.definition().file))},()=>{
  const patch=unitRegionBounds.definition(),file=path.join(creatorSDK,patch.file),before=fs.readFileSync(file);
  const after=unitRegionBounds.patchSource(before,patch);
  assert.equal(sha(after),patch.afterSha256);
  assert.equal(after.toString().split('ns->defineFunction("_hkdRegionBounds", _SE(js_hkdRegionBounds));').length,2);
  assert.equal(after.toString().split('ns->defineFunction("_hkdSampleOneDepthBounds", _SE(js_hkdSampleOneDepthBounds));').length,2);
  assert.deepEqual(fs.readFileSync(file),before);
  assert(!require('../native/spine-inline-color-cleanup.cjs').PATCHES.some(cleanup=>cleanup.file===patch.file));
});
test('fresh output must be outside project, SDK, tools and existing builds',t=>{const root=fixture(t),project=path.join(root,'project'),sdk=path.join(root,'sdk'),tools=path.join(root,'tools');[project,sdk,tools].forEach(dir=>fs.mkdirSync(dir));
  for(const bad of [path.join(project,'build'),path.join(sdk,'build'),path.join(tools,'build'),root])assert.throws(()=>api.validateOutput(bad,project,sdk,tools));
  const out=path.join(root,'fresh');assert.equal(api.validateOutput(out,project,sdk,tools),out);assert(!fs.existsSync(out));
  assert.throws(()=>api.validateOutput(path.join(root,'bad;path'),project,sdk,tools),/special|unsupported/i);
});
test('junction-resolved output cannot escape containment guard',t=>{const root=fixture(t),project=path.join(root,'project'),sdk=path.join(root,'sdk'),tools=path.join(root,'tools');[project,sdk,tools].forEach(dir=>fs.mkdirSync(dir));const alias=path.join(root,'alias');fs.symlinkSync(project,alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>api.validateOutput(path.join(alias,'fresh'),project,sdk,tools),/external/);});
test('source inventory is order-stable and rejects missing or modified SDKs',()=>{const a={file:'a.cpp',sha256:'1'},b={file:'b.hpp',sha256:'2'};assert.deepEqual(api.implementationDigest([a,b]),api.implementationDigest([b,a]));assert.notEqual(api.implementationDigest([a,b]).sha256,api.implementationDigest([a,{...b,sha256:'3'}]).sha256);assert.throws(()=>api.validateSourceInventory([a,b]),/Unsupported/);});
test('engine patch removes events, isolates objects and preserves C-only inputs',()=>{const f=projectFixture(api.PROJECTS[0],['a\\same.cpp','b\\same.cpp','jsb_platfrom_win32.cpp','plain.c']),out=api.patchProject(f.source,f.project,path.join(os.tmpdir(),'OUT'));
  assert(!out.includes('<PostBuildEvent>'));assert(out.includes('<PlatformToolset>v143</PlatformToolset>'));assert(out.includes('<Optimization>MaxSpeed</Optimization>'));assert(out.includes('<ProcessorNumber>2</ProcessorNumber>'));assert(out.includes('<FloatingPointModel>Precise</FloatingPointModel>'));assert(out.includes('<RuntimeLibrary>MultiThreadedDLL</RuntimeLibrary>'));assert(out.includes('string;functional;'));
  const names=[...out.matchAll(/<ClCompile Include="[^"]+"><ObjectFileName>([^<]+)<\/ObjectFileName>/g)].map(m=>m[1]);assert.equal(new Set(names).size,4);
  assert(!out.match(/<ClCompile Include="plain.c">([\s\S]*?)<\/ClCompile>/)[1].includes('ForcedIncludeFiles'));assert.throws(()=>api.patchProject(f.source+' ',f.project,'OUT'),/Unsupported/);
});
test('consumer Release layout matches engine while protobuf excludes Windows macros',()=>{const f=projectFixture(api.PROJECTS[1],['normal.cpp','protobuf-lite\\parse.cpp']),out=api.patchProject(f.source,f.project,'OUT');assert(out.includes('USE_V8_DEBUGGER=0;CC_STATIC;NDEBUG;'));assert(out.includes('COCOS2D_DEBUG=0;CC_STATIC;'));assert(out.includes("'Debug'\"><ClCompile><PreprocessorDefinitions>COCOS2D_DEBUG=1;"));const proto=out.match(/<ClCompile Include="protobuf-lite\\parse.cpp">([\s\S]*?)<\/ClCompile>/)[1];assert(proto.includes('functional;'));assert(!proto.includes('winsock'));});
test('app Release restores required editor-support headers',()=>{const f=projectFixture(api.PROJECTS[2],['AppDelegate.cpp']),out=api.patchProject(f.source,f.project,'OUT');assert(out.includes('$(EngineRoot)cocos\\editor-support;'));assert(out.includes('functional;winsock2.h;WS2tcpip.h;'));});
test('toolchain discovers VS, pins x86 v143 and complete Windows SDK',t=>{const f=fakeTools(fixture(t));let calls=0;const tools=api.toolchain({},(exe,args)=>{++calls;assert(exe.endsWith('vswhere.exe'));assert(args.includes('[17.0,18.0)'));return f.vs+'\n';},f.programFiles);assert.equal(calls,1);assert.equal(tools.msvc,'14.44.35207');assert.equal(tools.windowsSdkVersion,'10.0.26100.0');assert(tools.compiler.includes(path.join('Hostx64','x86','cl.exe')));assert.equal(tools.compilerSha256,sha(Buffer.from('fixture')));});
test('toolchain rejects missing compiler, incomplete SDK and invalid SDK selector',t=>{const f=fakeTools(fixture(t));assert.throws(()=>api.toolchain({vsRoot:f.vs,windowsSdkVersion:'../bad'},undefined,f.programFiles),/complete Windows10 SDK/);fs.unlinkSync(path.join(f.programFiles,'Windows Kits/10/Lib/10.0.26100.0/ucrt/x86/ucrt.lib'));assert.throws(()=>api.toolchain({vsRoot:f.vs},undefined,f.programFiles),/complete Windows10 SDK/);fs.unlinkSync(path.join(f.vs,'VC/Tools/MSVC/14.44.35207/bin/Hostx64/x86/cl.exe'));assert.throws(()=>api.toolchain({vsRoot:f.vs},undefined,f.programFiles),/x86 compiler/);});
test('explicit portable SDK root needs no Program Files SDK or discovery mutation',t=>{const root=fixture(t),f=fakeTools(root),portable=path.join(root,'portable-sdk');fs.renameSync(path.join(f.programFiles,'Windows Kits/10'),portable);const selected=api.toolchain({vsRoot:f.vs,windowsSdkRoot:portable},()=>{throw Error('Unexpected discovery');},f.programFiles);assert.equal(selected.windowsSdkRoot,fs.realpathSync.native(portable));assert.equal(selected.windowsSdkVersion,'10.0.26100.0');assert.deepEqual(api.parseArgs(['--windows-sdk-root',portable]),{windowsSdkRoot:portable});});
test('MSBuild receives all selected portable VC and UCRT paths explicitly',()=>{const selected={vsRoot:path.resolve('VS'),windowsSdkRoot:path.resolve('SDK'),msvc:'14.44.35207',windowsSdkVersion:'10.0.26100.0'},props=api.msbuildProperties(selected);assert.equal(props.Platform,'Win32');assert.equal(props.Configuration,'Release');assert.equal(props.VCToolsVersion,selected.msvc);assert.equal(props.VCToolsInstallDir,path.join(selected.vsRoot,'VC/Tools/MSVC',selected.msvc)+path.sep);assert.equal(props.VCTargetsPath,path.join(selected.vsRoot,'MSBuild/Microsoft/VC/v170')+path.sep);for(const name of ['WindowsSdkDir','UniversalCRTSdkDir','UCRTContentRoot'])assert.equal(props[name],selected.windowsSdkRoot+path.sep);for(const name of ['TargetUniversalCRTVersion','UCRTVersion','WindowsTargetPlatformVersion'])assert.equal(props[name],selected.windowsSdkVersion);});
test('PE validation resolves local transitive x86 DLL closure and hashes exact bytes',t=>{const bin=fixture(t);write(path.join(bin,'simulator.exe'),pe(['one.dll']));write(path.join(bin,'one.dll'),pe(['two.dll']));write(path.join(bin,'two.dll'),pe());const result=api.inspectRuntime(bin);assert.equal(result.transitiveLocalModules,3);assert.equal(result.files.find(f=>f.relativePath==='simulator.exe').sha256,sha(pe(['one.dll'])));});
test('PE validation rejects x64, debug CRT, missing DLL and truncated PE',t=>{const root=fixture(t);for(const [name,bytes]of [['x64',pe([],0x8664)],['debug',pe(['ucrtbased.dll'])],['missing',pe(['hkd_missing_test_dependency.dll'])],['truncated',Buffer.from('MZ')]]){const bin=path.join(root,name);write(path.join(bin,'simulator.exe'),bytes);assert.throws(()=>api.inspectRuntime(bin));}});
