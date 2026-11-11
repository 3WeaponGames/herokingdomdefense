'use strict';
// Real DOM, textures and Spine previews. Draft changes live only in memory;
// capture files are supplied by the external muted Electron test runner.
const fs=require('fs'),path=require('path'),url=require('url');
const root=path.resolve(__dirname,'../../..');
const wait=async predicate=>{const start=Date.now();while(!predicate()){if(Date.now()-start>60000)throw Error('Preview did not become ready: '+document.body.textContent.slice(-450));await new Promise(resolve=>setTimeout(resolve,30));}};
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
async function verify(options={}){
 const {ItemsService}=require('../../hkd-items/service'),service=new ItemsService(root),checks=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);},captures=[];
 const files=['assets/resources/hero-items/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/characters/catalog.json'],before=files.map(file=>fs.readFileSync(path.join(root,file)));
 const initial=service.load(),first=service.describe({type:'item',id:initial.units[0].id});
 document.body.innerHTML='';document.body.style.cssText='margin:0;height:100vh;background:#161c25';
 const style=document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'packages/hkd-characters/style.css'),'utf8');document.head.appendChild(style);
 let host=document.createElement('div');host.style.cssText='height:100vh';document.body.appendChild(host);
 const client=require('../../hkd-characters/client').mount(host,{kind:'items',image:file=>url.pathToFileURL(path.join(root,file)).href,runtime:description=>require(description.runtimePath),renderer:require('../preview/spine-renderer'),core:require('../../../assets/_script/CharacterPartsCore'),async ipc(name,request){if(name==='load')return initial;if(name==='describe')return request.id===initial.units[0].id?first:service.describe(request);if(name==='change')return service.change(request);throw Error('Publication is forbidden in this test: '+name);}});
 async function choose(key){const picker=host.querySelector('[aria-label="Equipment tier"]');picker.value=key;picker.dispatchEvent(new Event('change'));await wait(()=>client.getState().loaded);await paint();}
 try{
  await wait(()=>client.getState().loaded);await paint();assert(service.snapshot().dirty===false,'Opening Items is read-only');assert(host.textContent.includes('FIT SELECTED PART'),'Current parts immediately have fitting controls');assert(host.querySelector('.part-list').textContent.includes('cape'),'Armor tier includes its fitted cape');
  await choose('3:tier:lv1:guardian');assert(host.querySelector('.part-list').textContent.includes('shield'),'Guardian offhand tier exposes the real shield');
  const shield=service.assets().parts.find(asset=>asset.id.startsWith('HandLeft/Shield/')&&asset.id!=='HandLeft/Shield/FA_WP_Sub_Shield_012_Blue'),shieldTile=[...host.querySelectorAll('.asset-tile')].find(tile=>tile.title===shield.name);assert(shieldTile,'Alternative shield is available');shieldTile.click();host.querySelector('.character-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));await wait(()=>service.data.profiles[service.data.assignments['3:tier:lv1:guardian']]?.parts[0]?.sprite===shield.id);await paint();
  const offhand=service.data.profiles[service.data.assignments['3:tier:lv1:guardian']];assert(offhand.parts.length===1&&offhand.parts[0].layer===service.describe(offhand.base,true).defaultLayer,'Ctrl+A replaces the shield on its own layer without duplicating it or altering the hammer');
  if(options.capture)captures.push(await options.capture('items-guardian-shield'));
  await choose('2:tier:lv3');const tile=[...host.querySelectorAll('.asset-tile')].find(tile=>tile.title==='Helmet 047 White');assert(tile,'Replacement helmet is available');tile.click();host.querySelector('.character-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));await wait(()=>service.data.profiles[service.data.assignments['2:tier:lv3']]?.parts[0]?.sprite==='Helmet/FA_Helmet_047_White');await paint();assert(service.data.profiles[service.data.assignments['2:tier:lv3']].parts[0].sprite==='Helmet/FA_Helmet_047_White','Ctrl+A replaces the current part for the entire selected tier');
  if(options.capture)captures.push(await options.capture('items-tier-fit'));
 }finally{client.destroy();host.remove();style.remove();}
 const {Store}=require('../lib/store'),store=new Store(root),Units=require('../lib/unit-assets'),assets=service.assets().parts.map(asset=>({name:asset.name,path:asset.image,resource:asset.resource,url:url.pathToFileURL(path.join(root,asset.image)).href}));
 const oldEditor=global.Editor;let panel;
 global.Editor={Panel:{extend:value=>value,open(){throw Error('No external panel opens during verification');}},Ipc:{sendToMain(message,...args){const callback=args.pop(),request=args[0];try{const value=message==='game-data-editor:load'?store.snapshot():message==='game-data-editor:asset-index'?{images:assets}:message==='game-data-editor:unit-preview'?Units.describe(root,{...request,documents:store.snapshot().documents}):message==='game-data-editor:change'?store.change(request):null;if(value===null)throw Error('Unexpected editor operation '+message);callback(null,value);}catch(error){callback(error.message);}}}};
 try{
  const definition=require('../panel').create('equipment');host=document.createElement('div');host.className='equipment-host';host.style.cssText='height:100vh;display:flex';host.innerHTML=definition.template;document.body.appendChild(host);const sheet=document.createElement('style');sheet.textContent=definition.style.replace(/:host/g,'.equipment-host');document.head.appendChild(sheet);
  panel={...definition};for(const [name,selector]of Object.entries(definition.$))panel['$'+name]=host.querySelector(selector);panel.ready();await wait(()=>panel._previewClient&&panel._previewClient.getState().loaded);
  assert(panel._rows().length===16,'Equipment exposes shared gear and all twelve weapon upgrade tracks');
  panel._selected='2';panel._level=24;panel._render();await wait(()=>panel._previewClient.getState().loaded);await paint();assert(host.querySelector('[aria-label="Preview Helmet"]').value==='25','Hero preview follows selected upgrade 25');assert(![...host.querySelectorAll('.gt-field>span')].some(node=>node.textContent==='Icon'),'Manual legacy Icon field is absent');
  if(options.capture)captures.push(await options.capture('equipment-upgrade-25'));
  panel._selected='4:guardian';panel._level=5;panel._render();await wait(()=>panel._previewClient.getState().loaded);await paint();assert(host.querySelector('[aria-label="Preview Hammer"]').value==='6','Guardian preview follows its selected weapon upgrade');
  if(options.capture)captures.push(await options.capture('equipment-guardian'));
  assert(store.changes().length===0,'Equipment browsing never writes drafts or progression');sheet.remove();
 }finally{if(panel)panel.close();if(host)host.remove();global.Editor=oldEditor;}
 for(let i=0;i<files.length;i++)assert(fs.readFileSync(path.join(root,files[i])).equals(before[i]),files[i]+' remains byte-for-byte unchanged');
 return {checks,captures};
}
module.exports={verify};
