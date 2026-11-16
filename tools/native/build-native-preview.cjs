#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {inspect} = require('./pe-imports.cjs');

const PROJECTS = [
  {file:'build/libcocos2d.vcxproj', sha256:'c15640fc06311fe10e8bb1d0cf0a0ab0ca20443c86e589e849d53cc987257a50', count:297},
  {file:'tools/simulator/libsimulator/proj.win32/libsimulator.vcxproj', sha256:'2d93dda74762c655ba517bfb192c29e78b132f691274342c0468338982822ef6', count:43},
  {file:'tools/simulator/frameworks/runtime-src/proj.win32/simulator.vcxproj', sha256:'89ac5ff3145a808a7bad83365f91773c8c1cab52b22a83fd84a5fcaa0f64cae0', count:6}
];
const IMPLEMENTATION_COUNT = 3909;
const IMPLEMENTATION_SHA256 = '3a6f1e91cf513c86f411f0090caec434b5c98aa13f5b5c51a30ff7384a1ac196';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replaceAll('\\','/');
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
function requireThat(value, message) { if (!value) throw Error(message); }
function inside(file, root) { const relative = path.relative(root,file); return relative === '' || (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative)); }
function canonical(file) {
  let current = path.resolve(file); const missing = [];
  while (!fs.existsSync(current)) { const parent = path.dirname(current); requireThat(parent !== current, 'Cannot resolve output path'); missing.unshift(path.basename(current)); current = parent; }
  return path.join(fs.realpathSync.native(current),...missing);
}
function files(root) {
  const result = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const file = path.join(directory,entry.name);
      requireThat(!entry.isSymbolicLink(), 'SDK/output symlinks are unsupported: '+file);
      if (entry.isDirectory()) visit(file);
      else { requireThat(entry.isFile(), 'Unsupported file type: '+file); result.push(file); }
    }
  }
  visit(root); return result.sort(order);
}
function inventory(root) { return files(root).map(file=>({file:slash(path.relative(root,file)),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))})); }
function implementationDigest(entries) {
  const items = entries.filter(item=>/\.(h|hpp|c|cpp|cxx|cc|inl)$/i.test(item.file)).sort((a,b)=>order(a.file,b.file));
  return {count:items.length,sha256:sha(Buffer.from(items.map(item=>item.file+'\0'+item.sha256+'\n').join('')))};
}
function validateSourceInventory(entries) {
  const digest=implementationDigest(entries);
  requireThat(digest.count===IMPLEMENTATION_COUNT&&digest.sha256===IMPLEMENTATION_SHA256,'Unsupported/modified Creator2.4.13 SDK implementation');
  return digest;
}
function validateOutput(outputRoot,projectRoot,sdkRoot,toolRoot=__dirname) {
  const output=canonical(outputRoot),project=fs.realpathSync.native(projectRoot),sdk=fs.realpathSync.native(sdkRoot);
  requireThat(!inside(output,project)&&!inside(output,sdk)&&!inside(sdk,output)&&!inside(output,fs.realpathSync.native(toolRoot))&&output!==path.parse(output).root,'Output must be external to the project, tool directory, and installed SDK');
  requireThat(![sdk,project,output].some(file=>/[;$%\r\n]/.test(file)),'MSBuild paths containing semicolons, dollar/percent signs or newlines are unsupported');
  requireThat(!fs.existsSync(output),'Output already exists; use a fresh directory. Partial/previous builds are preserved.');
  return output;
}
function once(text, from, to) { requireThat(text.split(from).length === 2, 'Unsupported SDK patch anchor: '+from.slice(0,100)); return text.replace(from,to); }
function xml(value) { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }

function patchProject(before, project, output) {
  requireThat(sha(Buffer.from(before)) === project.sha256, 'Unsupported Creator SDK project: '+project.file);
  let text = before.replace(/\r\n/g,'\n');
  text = text.replace(/^\s*<PlatformToolset[^>]*>.*?<\/PlatformToolset>\n/gm,'\n')
    .replace(/<WindowsTargetPlatformVersion>.*?<\/WindowsTargetPlatformVersion>/g,'<WindowsTargetPlatformVersion>10.0</WindowsTargetPlatformVersion>');
  text = once(text,'<Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />','<PropertyGroup><PlatformToolset>v143</PlatformToolset></PropertyGroup>\n  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />');
  text = text.replace(/<(PreBuildEvent|PreLinkEvent|PostBuildEvent)>[\s\S]*?<\/\1>/g,'');
  text = text.replace(/<OutDir[^>]*>[\s\S]*?<\/OutDir>/g,'<OutDir>'+xml(path.join(output,'bin'))+'\\</OutDir>')
    .replace(/<IntDir[^>]*>[\s\S]*?<\/IntDir>/g,'<IntDir>'+xml(path.join(output,'obj','$(MSBuildProjectName)'))+'\\</IntDir>')
    .replace(/<ObjectFileName>[^<]*<\/ObjectFileName>/g,'<ObjectFileName>$(IntDir)objects\\%(Filename).obj</ObjectFileName>');
  let count = 0;
  text = text.replace(/<ClCompile Include="([^"]+)"\s*\/>/g,(_all,include)=>{
    ++count;
    let headers = project.file === PROJECTS[0].file ? 'functional' : 'functional;winsock2.h;WS2tcpip.h';
    if (/protobuf-lite/i.test(include)) headers = 'functional';
    if (include.endsWith('jsb_platfrom_win32.cpp')) headers = 'string;functional';
    const forced = /\.(cpp|cc|cxx)$/i.test(include) ? '<ForcedIncludeFiles>'+headers+';%(ForcedIncludeFiles)</ForcedIncludeFiles>' : '';
    return '<ClCompile Include="'+include+'"><ObjectFileName>$(IntDir)objects\\'+sha(Buffer.from(include)).slice(0,12)+'_%(Filename).obj</ObjectFileName>'+forced+'</ClCompile>';
  });
  requireThat(count === project.count, 'Unsupported SDK translation-unit layout: '+project.file);
  const consumer = project.file !== PROJECTS[0].file;
  if (consumer) text = text.replace(/<ItemDefinitionGroup[^>]*Condition="[^"]*Release[^>]*>[\s\S]*?<\/ItemDefinitionGroup>/g,block=>block.replaceAll('COCOS2D_DEBUG=1','COCOS2D_DEBUG=0'));
  const include = project.file === PROJECTS[2].file ? '<AdditionalIncludeDirectories>$(EngineRoot)cocos\\editor-support;%(AdditionalIncludeDirectories)</AdditionalIncludeDirectories>' : '';
  const definitions = consumer ? 'USE_V8_DEBUGGER=0;CC_STATIC;NDEBUG;' : 'NDEBUG;';
  const settings = `
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Release|Win32'">
    <UseDebugLibraries>false</UseDebugLibraries><LinkIncremental>false</LinkIncremental><WholeProgramOptimization>false</WholeProgramOptimization>
  </PropertyGroup>
  <ItemDefinitionGroup Condition="'$(Configuration)|$(Platform)'=='Release|Win32'">
    <ClCompile>
      <Optimization>MaxSpeed</Optimization><MultiProcessorCompilation>true</MultiProcessorCompilation><ProcessorNumber>2</ProcessorNumber>
      ${include}
      <RuntimeLibrary>MultiThreadedDLL</RuntimeLibrary><BasicRuntimeChecks>Default</BasicRuntimeChecks><MinimalRebuild>false</MinimalRebuild>
      <FloatingPointModel>Precise</FloatingPointModel><LanguageStandard>stdcpp14</LanguageStandard>
      <PreprocessorDefinitions>${definitions}%(PreprocessorDefinitions)</PreprocessorDefinitions><ProgramDataBaseFileName>$(IntDir)compile.pdb</ProgramDataBaseFileName>
    </ClCompile>
    <Lib><OutputFile>$(OutDir)$(TargetName).lib</OutputFile></Lib>
    <Link><AdditionalLibraryDirectories>$(EngineRoot)external\\win32\\libs;$(OutDir);%(AdditionalLibraryDirectories)</AdditionalLibraryDirectories></Link>
  </ItemDefinitionGroup>
`;
  text = once(text,'  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />',settings+'  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />');
  requireThat(!/<(?:PreBuildEvent|PreLinkEvent|PostBuildEvent)>/.test(text),'SDK build event survived');
  return text.replace(/\n/g,before.includes('\r\n')?'\r\n':'\n');
}
function versions(root) { return fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^\d+(?:\.\d+)+$/.test(e.name)).map(e=>e.name).sort((a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(y[i]||0)-(x[i]||0);if(d)return d;}return 0;}); }
function command(file,args,options={}) { const result=spawnSync(file,args,{windowsHide:true,...options}); requireThat(!result.error && result.status===0,'Command failed: '+file+' (see external build logs)'+(result.error?' '+result.error.message:'')); return result.stdout; }
function toolchain(options,discover=command,programFiles=process.env['ProgramFiles(x86)']||'C:/Program Files (x86)') {
  let vs = options.vsRoot;
  if (!vs) {
    const where = path.join(programFiles,'Microsoft Visual Studio/Installer/vswhere.exe');
    requireThat(fs.existsSync(where),'VS2022 vswhere is missing; supply --vs-root');
    vs = discover(where,['-latest','-version','[17.0,18.0)','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8'}).trim();
  }
  requireThat(vs && fs.existsSync(vs),'VS2022 C++ installation not found'); vs = fs.realpathSync.native(vs);
  requireThat(!/[;$%\r\n]/.test(vs),'Unsupported special characters in Visual Studio path');
  const msbuild = path.join(vs,'MSBuild/Current/Bin/MSBuild.exe'),tools=path.join(vs,'VC/Tools/MSVC');
  requireThat(fs.existsSync(msbuild) && fs.existsSync(tools),'VS2022 MSBuild and C++ tools are required');
  requireThat(fs.existsSync(path.join(vs,'MSBuild/Microsoft/VC/v170/Platforms/Win32/PlatformToolsets/v143/Toolset.props')),'VS2022 v143 Win32 toolset is required');
  const msvc = versions(tools).find(v=>/^14\.(3\d|4[0-4])\.\d+$/.test(v)&&fs.existsSync(path.join(tools,v,'bin/Hostx64/x86/cl.exe')));
  requireThat(msvc,'The x64-hosted x86 compiler is required');
  const compiler = path.join(tools,msvc,'bin/Hostx64/x86/cl.exe');
  const kits = fs.realpathSync.native(options.windowsSdkRoot || path.join(programFiles,'Windows Kits/10'));
  requireThat(!/[;$%\r\n]/.test(kits),'Unsupported special characters in Windows SDK path');
  const complete = v=>['Include/'+v+'/um/Windows.h','Include/'+v+'/ucrt/stdio.h','Lib/'+v+'/um/x86/kernel32.lib','Lib/'+v+'/ucrt/x86/ucrt.lib'].every(f=>fs.existsSync(path.join(kits,f)));
  requireThat(fs.existsSync(path.join(kits,'Include')),'Windows10 SDK is required');
  const windowsSdkVersion = options.windowsSdkVersion || versions(path.join(kits,'Include')).find(complete);
  requireThat(windowsSdkVersion && /^10\.\d+\.\d+\.\d+$/.test(windowsSdkVersion) && complete(windowsSdkVersion),'A complete Windows10 SDK with x86 libraries is required');
  const redistRoot = path.join(vs,'VC/Redist/MSVC');
  const redist = versions(redistRoot).flatMap(v=>{const x86=path.join(redistRoot,v,'x86');return fs.existsSync(x86)?fs.readdirSync(x86).filter(f=>/^Microsoft\.VC\d+\.CRT$/.test(f)).map(f=>path.join(x86,f)):[];})[0];
  requireThat(redist,'VS x86 Release CRT deployment files are required');
  return {vsRoot:vs,msbuild,msbuildSha256:sha(fs.readFileSync(msbuild)),compiler,compilerSha256:sha(fs.readFileSync(compiler)),msvc,windowsSdkRoot:kits,windowsSdkVersion,redist};
}
function msbuildProperties(tools) {
  const trail=directory=>directory+path.sep,sdk=trail(tools.windowsSdkRoot),version=tools.windowsSdkVersion;
  return {Configuration:'Release',Platform:'Win32',PlatformToolset:'v143',VisualStudioVersion:'17.0',PreferredToolArchitecture:'x64',
    VSInstallDir:trail(tools.vsRoot),VCInstallDir:trail(path.join(tools.vsRoot,'VC')),
    VCTargetsPath:trail(path.join(tools.vsRoot,'MSBuild/Microsoft/VC/v170')),VCToolsInstallDir:trail(path.join(tools.vsRoot,'VC/Tools/MSVC',tools.msvc)),VCToolsVersion:tools.msvc,
    WindowsSdkDir:sdk,UniversalCRTSdkDir:sdk,UCRTContentRoot:sdk,TargetUniversalCRTVersion:version,UCRTVersion:version,
    WindowsTargetPlatformVersion:version,WindowsSDKVersion:version+path.sep,WindowsSDKLibVersion:version+path.sep,
    WindowsSdkBinPath:trail(path.join(tools.windowsSdkRoot,'bin')),WindowsSdkVerBinPath:trail(path.join(tools.windowsSdkRoot,'bin',version)),BuildProjectReferences:'true'};
}
function verifyProjects(sdk) {
  let count=0;
  for (const project of PROJECTS) {
    const file=path.join(sdk,project.file),text=fs.readFileSync(file,'utf8');
    for (const match of text.matchAll(/<(?:ClCompile|ProjectReference) Include="([^"]+)"/g)) {
      const target=path.resolve(path.dirname(file),match[1]);
      requireThat(inside(target,sdk) && fs.existsSync(target),'Project input escaped SDK clone or is missing: '+target); ++count;
    }
  }
  requireThat(count===348,'Unsupported SDK source/project-reference count');
}
function checkCompileFlags(output) {
  const records=[];
  for(const file of files(path.join(output,'obj')).filter(file=>path.basename(file).toLowerCase()==='cl.command.1.tlog')){
    const commands=fs.readFileSync(file).toString('utf16le').split(/\r?\n/).filter(line=>/^\/c\s/i.test(line));
    for(const line of commands){
      requireThat(/\s\/O2(?=\s|$)/i.test(line)&&/\s\/MD(?=\s|$)/i.test(line)&&/\s\/fp:precise(?=\s|$)/i.test(line)&&!/\s\/MDd(?=\s|$)/i.test(line),'Unexpected native compile flags: '+file);
      requireThat(/\/D\s+"?NDEBUG"?(?=\s|$)/i.test(line)&&/\/D\s+"?CC_STATIC"?(?=\s|$)/i.test(line),'Static Release ABI flags missing: '+file);
      if(path.relative(path.join(output,'obj'),file).split(path.sep)[0]!=='libcocos2d')requireThat(/\/D\s+"?COCOS2D_DEBUG=0"?(?=\s|$)/i.test(line)&&/\/D\s+"?USE_V8_DEBUGGER=0"?(?=\s|$)/i.test(line),'Consumer Release class layout does not match engine: '+file);
    }
    records.push({file,translationUnits:commands.length});
  }
  requireThat(records.reduce((n,r)=>n+r.translationUnits,0)===346,'Not all346 native translation units were built/audited');return records;
}
function inspectRuntime(bin) {
  const runtime = fs.readdirSync(bin).filter(name=>/\.(exe|dll)$/i.test(name)||name==='lang'||name==='config.json').sort(order).map(relativePath=>{
    const file=path.join(bin,relativePath),raw=fs.readFileSync(file),record={relativePath,bytes:raw.length,sha256:sha(raw)};
    if(/\.(exe|dll)$/i.test(file)){
      const pe=inspect(file);requireThat(pe.architecture==='x86','Wrong runtime architecture: '+file);
      requireThat(!pe.imports.concat(pe.delayed).some(name=>/(msvcp|msvcr|vcruntime|concrt|vccorlib)\d+d\.dll$|ucrtbased\.dll$/i.test(name)),'Debug CRT dependency: '+file);
      Object.assign(record,{architecture:pe.architecture,imports:pe.imports,delayed:pe.delayed});
    }return record;
  });
  const byName=new Map(runtime.map(r=>[r.relativePath.toLowerCase(),r])),queue=['simulator.exe'],seen=new Set();
  while(queue.length){const name=queue.pop().toLowerCase();if(seen.has(name))continue;seen.add(name);const record=byName.get(name);requireThat(record,'Missing local runtime: '+name);
    for(const dependency of (record.imports||[]).concat(record.delayed||[])){
      if(/^(api-ms-win-|ext-ms-win-)/i.test(dependency))continue;
      if(byName.has(dependency.toLowerCase()))queue.push(dependency);
      else {requireThat(!/^(msvcp|msvcr|vcruntime|concrt|vccorlib)\d.*\.dll$/i.test(dependency),'CRT must be local: '+dependency);requireThat(fs.existsSync(path.join(process.env.SystemRoot||'C:/Windows','SysWOW64',dependency)),'Unresolved x86 import: '+dependency);}
    }
  }return {files:runtime,transitiveLocalModules:seen.size};
}
function parseArgs(args) {
  const result={};const keys={'--sdk-root':'sdkRoot','--output-root':'outputRoot','--project-root':'projectRoot','--vs-root':'vsRoot','--windows-sdk-version':'windowsSdkVersion','--windows-sdk-root':'windowsSdkRoot'};
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--help'){result.help=true;continue;}
    requireThat(keys[arg] && args[i+1] && !args[i+1].startsWith('--'),'Unknown/missing argument: '+arg);result[keys[arg]]=args[++i];
  }return result;
}
function main(args) {
  const options=parseArgs(args);
  if(options.help){console.log('node tools/native/build-native-preview.cjs --sdk-root <Creator2.4.13/resources/cocos2d-x> --output-root <fresh external directory> [--project-root <project>] [--vs-root <VS2022>] [--windows-sdk-root <Windows Kits/10>] [--windows-sdk-version <10.0.x.0>]');return;}
  requireThat(process.platform==='win32','This build tool supports Windows only');requireThat(options.sdkRoot&&options.outputRoot,'--sdk-root and --output-root are required');
  const sdk=fs.realpathSync.native(options.sdkRoot),project=fs.realpathSync.native(options.projectRoot||path.resolve(__dirname,'../..')),output=validateOutput(options.outputRoot,project,sdk);
  requireThat(JSON.parse(fs.readFileSync(path.join(project,'project.json'),'utf8')).version==='2.4.13','Project must use Creator2.4.13; supply --project-root if this tool is outside tools/native');
  const tools=toolchain(options),sourceFiles=inventory(sdk),digest=validateSourceInventory(sourceFiles);
  for(const item of PROJECTS)requireThat(sha(fs.readFileSync(path.join(sdk,item.file)))===item.sha256,'Unsupported SDK project: '+item.file);
  fs.mkdirSync(output,{recursive:true});const clone=path.join(output,'source'),bin=path.join(output,'bin'),logs=path.join(output,'logs');
  fs.mkdirSync(bin);fs.mkdirSync(logs);fs.cpSync(sdk,clone,{recursive:true,preserveTimestamps:true,errorOnExist:true,force:false});
  for(const item of sourceFiles){requireThat(sha(fs.readFileSync(path.join(sdk,item.file)))===item.sha256,'Installed SDK changed while cloning: '+item.file);requireThat(sha(fs.readFileSync(path.join(clone,item.file)))===item.sha256,'SDK clone verification failed: '+item.file);}
  fs.writeFileSync(path.join(output,'source-files.json'),JSON.stringify({sourceRoot:sdk,implementation:digest,files:sourceFiles},null,2)+'\n');
  const patches=[];
  for(const item of PROJECTS){const file=path.join(clone,item.file),before=fs.readFileSync(file,'utf8'),after=patchProject(before,item,output);fs.writeFileSync(file,after);patches.push({file:item.file,beforeSha256:item.sha256,afterSha256:sha(Buffer.from(after))});fs.mkdirSync(path.join(output,'obj',path.basename(file,'.vcxproj'),'objects'),{recursive:true});}
  verifyProjects(clone);
  for(const entry of fs.readdirSync(path.join(clone,'external/win32/libs'),{withFileTypes:true}))if(entry.isFile())fs.copyFileSync(path.join(clone,'external/win32/libs',entry.name),path.join(bin,entry.name));
  const arguments_=[path.join(clone,PROJECTS[2].file),'/t:Build',...Object.entries(msbuildProperties(tools)).map(([name,value])=>'/p:'+name+'='+value),'/m:3','/nr:false','/verbosity:minimal','/bl:'+path.join(logs,'build.binlog'),'/flp:logfile='+path.join(logs,'build.log')+';verbosity=normal'];
  fs.writeFileSync(path.join(output,'preparation.json'),JSON.stringify({sdk,clone,output,toolchain:tools,patches,msbuildArguments:arguments_,state:'prepared',launched:false},null,2)+'\n');
  command(tools.msbuild,arguments_,{stdio:'inherit'});
  const flags=checkCompileFlags(output);
  fs.copyFileSync(path.join(clone,'tools/simulator/frameworks/runtime-src/Classes/ide-support/lang'),path.join(bin,'lang'));
  fs.copyFileSync(path.join(clone,'simulator/win32/config.json'),path.join(bin,'config.json'));
  for(const entry of fs.readdirSync(path.join(clone,'simulator/win32')))if(/^(msvcp|msvcr|vcruntime|concrt|vccorlib)\d+\.dll$/i.test(entry))fs.copyFileSync(path.join(clone,'simulator/win32',entry),path.join(bin,entry));
  for(const entry of fs.readdirSync(tools.redist))if(/\.dll$/i.test(entry))fs.copyFileSync(path.join(tools.redist,entry),path.join(bin,entry));
  const runtime=inspectRuntime(bin),executable=path.join(bin,'simulator.exe');
  for(const item of sourceFiles.filter(item=>/\.(h|hpp|c|cpp|cxx|cc|inl)$/i.test(item.file)||PROJECTS.some(project=>project.file===item.file))){requireThat(sha(fs.readFileSync(path.join(sdk,item.file)))===item.sha256,'Installed SDK changed during build: '+item.file);if(/\.(h|hpp|c|cpp|cxx|cc|inl)$/i.test(item.file))requireThat(sha(fs.readFileSync(path.join(clone,item.file)))===item.sha256,'Copied implementation changed during build: '+item.file);}
  const manifest={kind:'hkd-native-preview-release',manifestVersion:1,createdAt:new Date().toISOString(),creatorVersion:'2.4.13',sdk:{sourceRoot:sdk,cloneRoot:clone,sharedResourceRoot:path.join(clone,'simulator/win32'),implementation:digest},build:{configuration:'Release',platform:'Win32',architecture:'x86',outputRoot:output,compileFlags:flags},features:{highResolutionPacing:false},runtime:{directory:bin,executable,executableSha256:sha(fs.readFileSync(executable)),...runtime},toolchain:tools,abi:{CC_STATIC:1,COCOS2D_DEBUG:0,USE_V8_DEBUGGER:0,NDEBUG:1},patches,tooling:inventory(__dirname).filter(item=>/\.cjs$/.test(item.file)),launched:false};
  const manifestFile=path.join(output,'build-manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');console.log('Release simulator built without launching. Manifest: '+manifestFile);
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error('Native preview build refused/failed: '+error.message);process.exitCode=1;}}
module.exports={parseArgs,patchProject,implementationDigest,validateSourceInventory,validateOutput,toolchain,inside,canonical,inspectRuntime,msbuildProperties,PROJECTS};
