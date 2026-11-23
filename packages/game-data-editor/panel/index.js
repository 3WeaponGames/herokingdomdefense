'use strict';
const UnitRecords=require('../lib/unit-records');
const UnitPacks=require('../../hkd-characters/lib/unit-packs');
const UnitLevelStats=require('../../../assets/_script/UnitLevelStats');
const AllyAwareness=require('../../../assets/_script/AllyAwareness');
const AttackRate=require('./attack-rate');
const MapCatalog=require('../lib/map-catalog');
const fs=require('fs'),path=require('path');
const Schema=require('../lib/schema');
const HeroEquipmentStats=require('../../../assets/_script/HeroEquipmentStats');
const HeroDamage=require('./hero-damage');
const EquipmentCurve=require('./equipment-curve');
const Buildings=require('../buildings/client');
const IconPicker=require('./icon-picker');
const UnitProfiles=require('../units/panel-profiles');
const UnitSidebar=require('../units/sidebar');
const UnitCatalog=require('../worlds/unit-catalog');
const EnemyClasses=require('../lib/enemy-classes');
const EnemyBalance=require('./enemy-balance');
const FightingTypeDamage=require('../../../assets/_script/FightingTypeDamage');
const UnitAttack=require('../../../assets/_script/UnitAttackRules');
const EnemyTargeting=require('../../../assets/_script/EnemyTargeting');
const Skills=require('../units/skills');
const EquipmentTiers=require('../../../assets/_script/EquipmentTiers'),HeroWeapons=require('../../../assets/_script/HeroWeapons');
const ItemAppearance=require('../../hkd-items/appearance');
const TITLES={stages:'Stages & Waves',perks:'Battle Perks',buildings:'Buildings','wall-adjustments':'Wall adjustments',equipment:'Equipment',relics:'Relics',talents:'Talents',units:'Units & Attack Timing','unit-types':'Fighting Types & Pictograms',maps:'Maps',settings:'Battle Settings',testing:'Testing · Managed Test Player'};
const clone=Schema.clone;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function ipc(message,payload){return new Promise((resolve,reject)=>{
  const args=['game-data-editor:'+message];if(payload!==undefined)args.push(payload);args.push((error,value)=>error?reject(new Error(String(error))):resolve(value));
  Editor.Ipc.sendToMain.apply(Editor.Ipc,args);
});}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(label,action,cls){const n=node('button',label,cls);n.type='button';n.onclick=action;return n;}
function openPanel(kind){return Promise.resolve().then(()=>{if(!own(TITLES,kind))throw Error('Unknown tool panel');if(kind==='maps'||kind==='stages')return ipc('open-world',{view:kind});if(Editor.Panel&&typeof Editor.Panel.open==='function')return Editor.Panel.open('hkd-'+kind);return ipc('open-panel',kind);});}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
function stripRich(text){return String(text||'').replace(/<[^>]*>/g,'');}
function get(obj,keys){return keys.reduce((v,key)=>v==null?undefined:v[key],obj);}
function display(value){if(value===undefined)return '(not set)';if(value===null)return 'None';if(Array.isArray(value))return value.length>8?'['+value.length+' values]':value.map(display).join(', ');if(value&&typeof value==='object')return Object.keys(value).slice(0,6).map(k=>Schema.human(k)+': '+display(value[k])).join(' · ');return String(value);}

function create(kind){
  return Editor.Panel.extend({
    template:fs.readFileSync(path.join(__dirname,'panel.html'),'utf8'),style:require('./control-theme')(fs.readFileSync(path.join(__dirname,'panel.css'),'utf8')+(kind==='buildings'?Buildings.style:kind==='units'?fs.readFileSync(path.join(__dirname,'../units/sidebar.css'),'utf8'):'')),
    $:{root:'#root',title:'#title',toolbar:'#toolbar',language:'#language',status:'#status',workspace:'#workspace',sidebar:'#sidebar',unitPack:'#unitPack',searchLabel:'#searchLabel',search:'#search',count:'#count',list:'#list',detail:'#detail',preview:'#preview',undo:'#undo',redo:'#redo',reload:'#reload',discard:'#discard',review:'#review',save:'#save',issues:'#issues',footer:'#footer',modal:'#modal',modalTitle:'#modalTitle',modalBody:'#modalBody',modalActions:'#modalActions'},
    ready(){
      this._kind=kind;this._selected=null;this._wave=0;this._level=0;this._talentLevel=0;this._unitLevel=0;this._unitPack='all';this._language='en';this._queue=Promise.resolve();this._assets={images:[],prefabs:[],animations:[]};this._closed=false;
      this.$title.textContent=TITLES[kind]||kind;
      if(kind==='maps'||kind==='stages'){
        this.$toolbar.style.display='none';this.$sidebar.style.display='none';this.$preview.style.display='none';this.$issues.hidden=true;this.$root.querySelector('.gt-header').style.display='none';this.$status.style.display='none';this.$footer.style.display='none';
        this.$detail.className='gt-world-host';this.$detail.style.cssText='flex:1;min-width:0;padding:0;overflow:hidden;display:flex';
        this._worldClient=require('../worlds/workspace').mount(this.$detail,{ipc,kind,autoStart:false});return;
      }
      if(kind==='unit-types')this.$toolbar.appendChild(button('New type',()=>this._newUnitType(),'gt-primary'));
      if(kind==='testing'){
        this.$toolbar.style.display='none';this.$sidebar.style.display='none';this.$preview.style.display='none';this.$issues.hidden=true;
        this.$detail.className='gt-testing-host';this.$detail.style.flex='1';this.$detail.style.minWidth='0';this.$detail.style.overflow='auto';
        this._status('Testing actions change the managed test player immediately. Game configuration Save is separate.');
        this.$footer.textContent='Managed test player only · persistent isolated profile · previews are muted before launch.';
        this._testingClient=require('../testing/client').mount(this.$detail,{ipc});return;
      }
      this.$language.onchange=()=>{this._language=this.$language.value;this._render();};
      this.$search.oninput=()=>{if(this._snapshot){if(kind==='units')this.$list.scrollTop=0;this._renderList();}};
      if(kind==='units'){
        this._unitSidebar=UnitSidebar.mount({workspace:this.$workspace,sidebar:this.$sidebar,detail:this.$detail,list:this.$list,
          select:key=>this._selectRow(key),describe:async key=>{
            const [type,id='hero']=key.split(':'),level=type==='ally'?UnitRecords.levels(this._data('A'),type,id)[0]:undefined;
            const data=await ipc('unit-preview',{type,id,level,noShared:true});
            return {...data,visual:(this._data('overrides').visuals||{})[data.key]||{}};
          }});
        this.$searchLabel.hidden=false;
        this.$search.placeholder='Name or ID…';
        this.$search.removeAttribute('aria-label');
        this.$search.onkeydown=event=>{
          if(event.key!=='Enter'||event.isComposing||!this.$search.value.trim())return;
          const match=this.$list.querySelector('.gt-record');
          if(match){event.preventDefault();match.click();}
        };
      }
      this.$unitPack.hidden=kind!=='units';this.$unitPack.onchange=()=>{this._unitPack=this.$unitPack.value;this._selected=null;this.$list.scrollTop=0;this._render();};
      this.$undo.onclick=()=>this._action('undo');this.$redo.onclick=()=>this._action('redo');
      this.$reload.onclick=()=>this._load(true);this.$review.onclick=()=>this._review(false);this.$save.onclick=()=>this._review(true);
      this.$discard.onclick=()=>this._confirm('Discard all panel drafts?','This discards unsaved edits shared by every game-tools panel. Saved game files remain unchanged.',()=>this._action('discard'),'Discard drafts');
      if(kind==='units')this._installUnitKeys();
      this._profileIpc=ipc;
      this._load();
      ipc('asset-index',{refresh:true}).then(assets=>{if(this._closed)return;this._assets=assets||this._assets;if(this._iconPicker)this._iconPicker.setImages(this._assets.images||[]);this._render();}).catch(()=>{});
    },
    async run(argv){
      if(this._worldClient)return this._worldClient.open(Object.assign({view:kind},argv||{})).then(opened=>{if(opened)return this._worldClient.focus();}).catch(()=>{});
      if(kind!=='units'||!argv||!argv.unitKey)return;
      await this._queue.catch(()=>{});
      if(this._closed)return;
      await this._load(false);
      if(this._closed)return;
      if(!this._rows().some(row=>row.key===argv.unitKey)){this._status('The selected unit is no longer available.',true);return;}
      this.$search.value='';this._unitPack='all';this.$unitPack.value='all';
      this.$list.scrollTop=0;this._selectRow(argv.unitKey);
    },
    close(){this._closed=true;if(this._profilePopup)this._profilePopup.close();if(this._unitSidebar)this._unitSidebar.destroy();if(this._blockerClient)this._blockerClient.destroy();if(this._purchaseClient)this._purchaseClient.destroy();if(this._unitKeyHandler)this.$root.removeEventListener('keydown',this._unitKeyHandler,true);if(this._unitPointerHandler)this.$root.removeEventListener('pointerdown',this._unitPointerHandler);if(this._iconPicker)this._iconPicker.destroy();if(this._worldClient)this._worldClient.destroy();if(this._previewClient)this._previewClient.destroy();if(this._mapsClient)this._mapsClient.destroy();if(this._testingClient)this._testingClient.destroy();if(this._refreshTimer)clearTimeout(this._refreshTimer);},
    messages:{'hkd-characters:published'(){if(this._closed)return;if(kind==='units'||kind==='buildings')AttackRate.reload(this,ipc);if(kind==='equipment'){this._itemAssets=null;this._renderList();}if(this._unitSidebar&&this._snapshot){this._unitSidebar.invalidate();this._renderList();}if(this._previewClient)this._previewClient.refreshAppearance();},'game-data-editor:world-changed'(){if(this._worldClient)this._worldClient.changed();},'game-data-editor:world-focus-map'(event,id){if(this._worldClient&&kind==='maps')this._worldClient.focusMap(id);},'game-data-editor:changed'(){if(this._closed||kind==='testing'||this._worldClient)return;if(this._refreshTimer)clearTimeout(this._refreshTimer);this._refreshTimer=setTimeout(()=>this._load(false),80);}},
    _status(message,error){this.$status.textContent=message;this.$status.className='gt-status'+(error?' error':'');},
    async _load(explicit){try{const snapshot=await ipc(explicit?'refresh':'load');if(this._closed)return;if(explicit){if(kind==='units'||kind==='buildings'){AttackRate.invalidate(this);if(this._previewClient){this._previewClient.destroy();this._previewClient=null;}}const assets=await ipc('asset-index',{refresh:true});if(this._closed)return;this._assets=assets||this._assets;if(this._iconPicker)this._iconPicker.setImages(this._assets.images||[]);if(this._unitSidebar)this._unitSidebar.invalidate();}if(!this._snapshot||snapshot.version!==this._snapshot.version||explicit)this._apply(snapshot);else this._toolbar();}catch(error){this._status(error.message,true);}},
    _apply(snapshot){if(!snapshot||this._closed)return;if(snapshot.result)this._lastResult=snapshot.result;else if(this._snapshot&&snapshot.version!==this._snapshot.version)this._lastResult=null;this._snapshot=snapshot;this._render();},
    _action(action){this._queue=this._queue.catch(()=>{}).then(async()=>{try{const snap=await ipc(action,{version:this._snapshot.version});this._apply(snap);return snap;}catch(error){this._status(error.message,true);throw error;}});return this._queue.catch(()=>null);},
    _change(edits,options){
      this._queue=this._queue.catch(()=>{}).then(async()=>{
        try{const changes=typeof edits==='function'?await edits():edits;if(options&&options.skipEmpty&&!changes.length)return this._snapshot;const snapshot=await ipc('change',{version:this._snapshot.version,edits:changes});if(options&&options.keepDetail===this._selected+':'+this._level){this._snapshot=snapshot;this._lastResult=null;this._toolbar();if(!options.skipPreview){const row=this._rows().find(r=>r.key===this._selected);if(row)this._renderPreview(row);}}else this._apply(snapshot);return snapshot;}
        catch(error){this._status(error.message,true);throw error;}
      });return this._queue;
    },
    _previewChange(edits){
      return this._change(()=>{
        const result=[],created=new Map(),settings=this._data('overrides');
        for(const edit of edits){
          const table=edit.path&&edit.path[0];
          if(edit.doc!=='overrides'||edit.path.length!==2||!['animationSpeeds','timings'].includes(table)){result.push(edit);continue;}
          const existing=settings[table];
          if(existing!==undefined){
            if(!existing||typeof existing!=='object'||Array.isArray(existing))throw Error('The '+table+' table has an invalid format. Refresh before editing.');
            result.push(edit);continue;
          }
          if(edit.remove)continue;
          if(!created.has(table))created.set(table,{});
          created.get(table)[edit.path[1]]=edit.value;
        }
        for(const [table,value]of created)result.push({doc:'overrides',path:[table],value});
        return result;
      }).catch(()=>{});
    },
    _set(doc,keys,value){return this._change([{doc,path:keys,value}]).catch(()=>{});},
    _data(doc){const d=this._snapshot&&this._snapshot.documents[doc||'A'];return d?d.data:{};},
    _text(value){return Schema.resolve(value,this._data('catalog'),this._language);},
    _toolbar(){
      const s=this._snapshot;if(!s)return;
      const recoveries=s.recoveries||[];
      this.$undo.disabled=!s.canUndo;this.$redo.disabled=!s.canRedo;this.$discard.disabled=!s.dirty;this.$review.disabled=!s.dirty;this.$save.disabled=!s.dirty||recoveries.length>0;
      const changes=s.changes||[];this._status(s.dirty?changes.length+' unsaved change'+(changes.length===1?'':'s')+' · shared across all panels. Save to update the game.':'Current game data · no unsaved changes. Browsing and previews do not modify the game.');
      if(this._lastResult){if(this._lastResult.warning)this._status(this._lastResult.warning,true);else if(this._lastResult.recovered)this._status('Interrupted save recovered. Reload existing previews to use the restored data.');else if(this._lastResult.saved)this._status('Saved. Reload existing previews to use the updated data. Backup: '+this._lastResult.backup);}
      if(recoveries.length){this._status('An interrupted save needs review before further saves. '+(s.dirty?'Discard drafts before recovery.':''),true);recoveries.forEach(recovery=>{const recover=button('Review interrupted save',()=>this._recover(recovery),'gt-mini');recover.disabled=s.dirty;recover.style.marginLeft='10px';this.$status.appendChild(recover);});}
      const issues=s.issues||[],errors=issues.filter(i=>i.severity==='error');this.$issues.hidden=!issues.length;clear(this.$issues);
      if(issues.length){const details=node('details');details.open=errors.length>0;details.appendChild(node('summary',errors.length?errors.length+' issue(s) to resolve before saving':issues.length+' existing / advisory issue(s) · expand to inspect'));issues.slice(0,15).forEach(i=>details.appendChild(node('p',i.doc+' · '+(i.path||[]).join(' / ')+': '+i.message,i.severity)));if(issues.length>15)details.appendChild(node('p',(issues.length-15)+' additional findings are included in the review.'));this.$issues.appendChild(details);}
      this.$footer.textContent='Edits stay in a shared draft. All previews are silent. Save changes explicitly to update the game.';
    },
    _render(){
      if(!this._snapshot)return;this._toolbar();
      if(kind==='maps'){this._renderMaps();return;}
      let scroll=this.$detail.scrollTop;
      if(kind==='buildings'&&this._renderedBuildingFamily)this._buildingDetailScroll=scroll;
      if(this._purchaseClient){this._purchaseClient.destroy();this._purchaseClient=null;}
      if(this._blockerClient){this._blockerClient.destroy();this._blockerClient=null;}
      this._renderList();clear(this.$detail);AttackRate.begin(this);
      const row=this._rows().find(r=>r.key===this._selected);
      if(!row){this.$detail.appendChild(node('div','Choose an item to inspect its settings.','gt-empty'));return;}
      if(kind==='buildings'){this._renderedBuildingFamily=!!row.family;if(row.family&&Number.isFinite(this._buildingDetailScroll))scroll=this._buildingDetailScroll;}
      const heading=kind==='buildings'&&row.family?this.$detail.appendChild(node('div',undefined,'bld-sticky-heading')):this.$detail;
      heading.appendChild(node('h2',row.label));if(kind==='units'&&row.unitType==='ally')this._unitLevelTabs(row);if(kind==='buildings')Buildings.levelTabs(this,row,heading);heading.appendChild(node('p',row.subtitle||'Changes are drafts until saved.','gt-subtitle'));
      if(kind==='stages')this._stage(row);else if(kind==='perks')this._perk(row);else if(kind==='buildings')this._building(row);else if(kind==='equipment')this._equipment(row);else if(kind==='talents')this._talent(row);else if(kind==='relics')this._relic(row);else if(kind==='units')this._unit(row);else if(kind==='unit-types')this._unitType(row);else if(kind==='settings')this._setting(row);
      this.$detail.scrollTop=scroll;this._renderPreview(row);
      if(kind==='buildings'&&this._blockerClient&&this._blockerClient.ready){
        const client=this._blockerClient,detail=this.$detail;let moved=false;const cancel=()=>{moved=true;};
        if(detail.addEventListener)for(const event of ['wheel','pointerdown','keydown'])detail.addEventListener(event,cancel,true);
        const clean=()=>{if(detail.removeEventListener)for(const event of ['wheel','pointerdown','keydown'])detail.removeEventListener(event,cancel,true);};
        Promise.all([client.ready,this._purchaseClient&&this._purchaseClient.ready]).then(()=>{
          const frame=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>setTimeout(fn,0);
          frame(()=>frame(()=>{if(!this._closed&&this._blockerClient===client&&!moved)detail.scrollTop=scroll;clean();}));
        },clean);
      }
    },
    _rows(){
      const data=this._data('A'),rows=[];
      const add=(key,label,subtitle,record,keys,extra)=>rows.push(Object.assign({key:String(key),label,subtitle,record,path:keys,doc:'A'},extra||{}));
      if(kind==='stages')(this._data("A").LevelCfg||[]).forEach((r,i)=>{const name=this._text(r.Name),label=/^\s*\d+[.)]\s*/.test(name)?name:r.Level+'. '+name;add(i,label,r.prefab+' · '+r.WaveCfg.length+' waves',r,['LevelCfg',i],{doc:"A",icon:r.Map});});
      if(kind==='perks')(data.BuffCfg||[]).forEach((r,i)=>add(r.ID,this._text(r.Name),r.ID+' · '+Schema.RARITIES[r.Quality-1],r,['BuffCfg',i],{icon:r.Image}));
      if(kind==='buildings')rows.push(...Buildings.rows(this));
      if(kind==='equipment'){
        const equipment=data.EquipCfg||[],shared={1:'Chest · HP',2:'Helmet · HP regeneration',5:'Cloak · Attack speed',6:'Mount · Movement speed'};
        for(const id of [1,2,5,6]){const index=equipment.findIndex(row=>row.id===id),r=equipment[index];if(r)add(id,shared[id],EquipmentTiers.tiers(r).length+' tiers · '+r.levelInfo.length+' upgrades',r,['EquipCfg',index]);}
        for(const style of HeroWeapons.styles)for(const id of [4,3]){const index=equipment.findIndex(row=>row.id===id),r=equipment[index];if(r)add(id+':'+style.id,style.name+' · '+HeroWeapons.gear(style.id,id,'upgrade').name,EquipmentTiers.tiers(r).length+' tiers · '+r.levelInfo.length+' upgrades',r,['EquipCfg',index],{heroStyle:style.id});}
      }
      if(kind==='relics')(data.TreasureCfg||[]).forEach((r,i)=>{const good=(data.GoodsCfg||{})[r.goodID]||{};add(r.ID,this._text(good.name)||String(r.ID),r.ID+' · '+Schema.RARITIES[r.Quality-1]+' · '+r.levelInfo.length+' levels',r,['TreasureCfg',i],{icon:good.icon});});
      if(kind==='talents')Object.keys(data.TalentCfg||{}).forEach(id=>{const r=data.TalentCfg[id],count=(data.TalentLevelCfg||[]).filter(l=>l.kindID===Number(id)).length;add(id,this._text(r.Name),id+' · '+count+' progression records',r,['TalentCfg',id],{icon:r.Image});});
      if(kind==='units'){
        add('hero','Hero','Base stats are linked to Equipment',{},[],{unitType:'hero'});
        Object.keys(data.SoldierCfg||{}).forEach(id=>{const profileTable=this._data('overrides').unitProfiles;if(profileTable&&profileTable.families&&(profileTable.aliases&&profileTable.aliases[id]||profileTable.bossForms&&profileTable.bossForms[id]||[90011,90012].includes(Number(id))))return;const r=data.SoldierCfg[id],info=UnitPacks.info(r.MonsterPack),pack=info?info.label:r.CampaignBaseUnit?'Campaign profile':r.prefab?'Enemy':'Boss form',role=this._unitRole('enemy',id);add('enemy:'+id,this._text(r.Name),pack+(role?' · '+role:'')+(((this._data('overrides').unitProfiles||{}).entries||{})[id]?' · '+this._data('overrides').unitProfiles.entries[id].name:'')+' · '+id,r,['SoldierCfg',id],{icon:r.loadIcon,unitType:'enemy',unitID:id});});
        Object.keys(data.SoldierCfg||{}).filter(id=>Number(id)>=90001&&Number(id)<=90004).forEach(id=>{const r=(data.AllyCfg||data.SoldierCfg)[id];add('ally:'+id,this._text(r.Name)+' · Ally','Allied unit - independent stats',r,[data.AllyCfg?'AllyCfg':'SoldierCfg',id],{icon:r.loadIcon,unitType:'ally',unitID:id});});
      }
      if(kind==='unit-types')Object.keys(this._data('overrides').unitTypes||{}).forEach(id=>{const type=this._data('overrides').unitTypes[id],assigned=Object.values(this._data('overrides').unitTypeAssignments||{}).filter(value=>value===id).length;add(id,type.name,id+' - '+assigned+' unit assignment(s)',type,['unitTypes',id],{doc:'overrides',icon:type.icon});});
      if(kind==='settings'){
        Object.keys(data.ParameterCfg||{}).forEach(id=>{const r=data.ParameterCfg[id];add(id,Schema.human(r.enumKey),'Shared across every stage',r,['ParameterCfg',id]);});
        add('buildStandTime','Build standing time','Optional override · current default 1.5 seconds',{},[],{override:true});
      }
      return rows;
    },
    _selectRow(key){this._selected=key;this._wave=0;this._level=0;this._talentLevel=0;this._unitLevel=0;if(kind!=='buildings')this.$detail.scrollTop=0;this._render();},
    _renderList(){
      const all=this._rows();
      let pack=this._unitPack||'all';
      if(kind==='units'){
        const available=new Set(all.map(row=>row.record.MonsterPack));
        for(const option of this.$unitPack.children){
          if(UnitPacks.info(option.value))option.hidden=option.disabled=!available.has(option.value);
        }
        if(UnitPacks.info(pack)&&!available.has(pack)){
          pack=this._unitPack='all';
          this.$unitPack.value=pack;
        }
      }
      const scoped=kind!=='units'||pack==='all'?all:all.filter(r=>pack==='allies'?r.unitType!=='enemy':r.unitType==='enemy'&&(pack==='campaign'?!r.record.MonsterPack:r.record.MonsterPack===pack));
      const query=this.$search.value.trim().toLowerCase();
      const rows=query?scoped.filter(row=>{
        const details=row.subtitle+' '+(row.record.MonsterSource||'');
        return kind==='units'?UnitCatalog.matches({name:stripRich(row.label),description:details},query):(row.label+' '+details).toLowerCase().includes(query);
      }):scoped;
      if(kind==='units'&&query){
        const exactName=row=>Number(stripRich(row.label).toLowerCase()===query);
        rows.sort((left,right)=>exactName(right)-exactName(left));
      }
      if(!scoped.some(r=>r.key===this._selected))this._selected=rows.length?rows[0].key:null;
      const shown=kind==='units'?UnitProfiles.list(this,rows):rows;this.$count.textContent=kind==='units'?shown.length+' models · '+rows.length+' profiles':rows.length+' / '+all.length+' items';
      if(this._unitSidebar){
        const settings=this._data('overrides');
        this._unitSidebar.render(shown.map(row=>({key:row.key,label:stripRich(row.label),subtitle:row.subtitle,
          enemyClass:row.unitType==='enemy'?EnemyClasses.resolve(settings,row.unitID):null})),this._selected,this._snapshot.version);
        return;
      }
      clear(this.$list);
      if(kind==='units'&&query&&!shown.length)this.$list.appendChild(node('div','No units match your search.','gt-empty'));
      shown.forEach(row=>{const b=button('',()=>this._selectRow(row.key),'gt-record'+(row.key===this._selected?' active':'')+(kind==='buildings'&&row.indented?' bld-child':'')+(kind==='buildings'&&row.category?' bld-category':''));
        const asset=kind==='equipment'?this._equipmentIcon(row):this._image(row.icon);if(asset){const image=node('img');image.src=asset.url;image.alt='';b.appendChild(image);}else if(kind!=='equipment')b.appendChild(node('span',row.label.slice(0,2),'gt-initial'));
        const text=node('div');text.appendChild(node('strong',stripRich(row.label)));text.appendChild(node('small',row.subtitle));b.appendChild(text);this.$list.appendChild(b);
      });
    },
    _image(name){if(!name)return null;return (this._assets.images||[]).find(x=>x.reference===name||x.name===name)||null;},
    _equipmentIcon(row){
      const root=this._snapshot&&this._snapshot.root;if(!root)return null;
      if(!this._itemAssets)this._itemAssets=new (require('../../hkd-items/service').ItemsService)(root).assets().parts;
      const level=row.key===this._selected?row.record.levelInfo[Math.min(this._level,row.record.levelInfo.length-1)].Level:row.record.levelInfo[0].Level,icon=ItemAppearance.icon(root,this._data('A').EquipCfg,row.record.id,level,row.heroStyle,this._itemAssets);
      if(!icon)return null;const image=(this._assets.images||[]).find(image=>image.resource===icon.resource||image.path===icon.image);return image?{...image,tint:icon.tint}:icon.image?{url:require('url').pathToFileURL(path.join(root,icon.image)).href}:null;
    },
    _note(text,warning,parent){const n=node('div',text,'gt-note'+(warning?' warn':''));(parent||this.$detail).appendChild(n);return n;},
    _section(title,parent,collapsed){const wrap=node('details',undefined,'gt-section');wrap.open=!collapsed;wrap.appendChild(node('summary',title));const fields=node('div',undefined,'gt-fields');wrap.appendChild(fields);(parent||this.$detail).appendChild(wrap);return fields;},
    _field(container,label,value,onchange,options){
      options=options||{};const wrap=node('label',undefined,'gt-field'+(options.wide?' wide':''));wrap.appendChild(node('span',label));let input;
      if(options.options){input=node('select');options.options.forEach(item=>{const o=node('option',item.label);o.value=String(item.value);input.appendChild(o);});if(!options.options.some(o=>String(o.value)===String(value))){const o=node('option',display(value));o.value=String(value);input.appendChild(o);}input.value=String(value);}
      else if(options.color){input=node('input');input.type='color';input.value=value||'#ffffff';}
      else if(options.boolean){input=node('input');input.type='checkbox';input.checked=!!value;}
      else if(options.multiline){input=node('textarea');input.value=value==null?'':String(value);}
      else {input=node('input');input.type=typeof value==='number'||options.numeric?'number':'text';input.value=value==null?'':String(options.percent?Math.round(value*1e10)/1e8:value);if(input.type==='number'){input.step=options.integer?'1':'any';if(options.min!==undefined)input.min=options.percent?options.min*100:options.min;if(options.max!==undefined)input.max=options.max;}}
      input.disabled=!!options.readOnly;input.title=options.help||'';
      const commit=()=>{
        let next=options.boolean?input.checked:input.value;
        if(typeof value==='number'||options.numeric){if(String(next).trim()===''||!Number.isFinite(Number(next))){input.value=options.percent?value*100:value;this._status('Enter a valid number for '+label+'.',true);return;}next=Number(next);if(options.percent)next/=100;if(options.integer&&!Number.isInteger(next)){this._status(label+' must be a whole number.',true);return;}if(options.min!==undefined&&next<options.min){this._status(label+' must be at least '+options.min+'.',true);return;}if(typeof value==='string')next=String(next);}
        if(options.options&&typeof value==='number')next=Number(next);
        if(next!==value||options.commitUnchanged)onchange(next);
      };
      input.onchange=commit;
      if(options.asset){const line=node('div',undefined,'gt-asset-row'),list=node('datalist');list.id='asset-'+Math.random().toString(36).slice(2);(this._assets[options.asset]||[]).filter(a=>options.asset!=='images'||a.reference).slice(0,300).forEach(a=>{const o=node('option');o.value=a.reference||a.name;o.label=a.name;list.appendChild(o);});input.setAttribute('list',list.id);line.appendChild(input);const icon=this._image(value);if(icon){const image=node('img');image.src=icon.url;image.alt='';image.className='gt-thumb';line.appendChild(image);}if(options.asset==='images'&&!options.readOnly)line.appendChild(button('Choose icon…',event=>{if(event&&event.preventDefault)event.preventDefault();this._pickIcon(value,onchange,options);},'gt-mini'));wrap.appendChild(line);wrap.appendChild(list);}else wrap.appendChild(input);
      if(options.help)wrap.appendChild(node('small',options.help));container.appendChild(wrap);return input;
    },
    _pickIcon(value,onchange,options){
      const focus=document.activeElement,body=this._modal('Choose icon · draft only');
      const close=()=>{if(this._iconPicker)this._iconPicker.destroy();this._iconPicker=null;this.$modal.hidden=true;if(focus&&focus.isConnected)focus.focus();};
      this._iconPicker=IconPicker.mount(body,{images:this._assets.images||[],value,onCancel:close,onSelect:reference=>{close();onchange(reference);}});
      this.$modalActions.appendChild(button('Cancel',close));
    },
    _localized(container,doc,keys,value,label,options){
      const fieldOptions=Object.assign({wide:true,multiline:/description/i.test(label)},options),key=Schema.token(value);if(!key){this._field(container,label,value,v=>this._set(doc,keys,v),fieldOptions);return;}
      const catalog=this._data('catalog'),entry=(catalog.entries||{})[key]||{},language=this._language;
      const wrap=node('div',undefined,'gt-localized');this._field(wrap,label+' · '+language,entry[language]||'',v=>this._set('catalog',['entries',key,language],v),fieldOptions);
      const usages=JSON.stringify(this._data('A')).split(value).length-1;
      wrap.appendChild(node('div',usages>1?'Shared wording used by '+usages+' records. Saving this text updates every usage.':'Localized wording. Numbered placeholders must remain intact.','gt-shared'));
      container.appendChild(wrap);
    },
    _properties(parent,doc,keys,record,context,exclude){
      const container=node('div',undefined,'gt-fields');parent.appendChild(container);exclude=exclude||[];
      Object.keys(record||{}).forEach(key=>{if(exclude.indexOf(key)>=0||context&&context.table==='EquipCfg'&&key==='Image')return;this._value(container,doc,keys.concat(key),record[key],key,context||{},record);});return container;
    },
    _value(container,doc,keys,value,key,context,record){
      const meta=Schema.descriptor(key,context);
      if(key==='AttackInterval'&&context.table==='SoldierCfg'&&context.side==='enemy'){
        this._attackRateField(container,{unitType:'enemy',unitID:String(context.id),record,path:keys.slice(0,-1)},0,next=>this._change(()=>[{doc,path:keys,value:typeof next==='function'?next():next}]));return;
      }
      if(typeof value==='string'&&Schema.token(value)){this._localized(container,doc,keys,value,meta.label);return;}
      if(value===null){this._field(container,meta.label,'Not set',()=>{},{readOnly:true});return;}
      if(Array.isArray(value)){
        const block=node('div',undefined,'gt-field wide');block.appendChild(node('span',meta.label));container.appendChild(block);
        if(key==='Pamer'||key==='EffectNumber'||key==='param'){
          const flags=record[key==='Pamer'?'isPerecentage':'vaulePercentage']||[],names=key==='Pamer'?Schema.PERK_LABELS[record.ID]||[]:[];
          const fields=node('div',undefined,'gt-fields');block.appendChild(fields);value.forEach((v,i)=>this._field(fields,(names[i]||'Effect '+(i+1))+(flags[i]?' (%)':''),v,n=>this._set(doc,keys.concat(i),n),{percent:!!flags[i],min:0,readOnly:key==='Pamer'&&record.ID===50024,help:key==='Pamer'&&record.ID===50024?'Reserved by the existing effect; this perk always uses its scripted upgrade behavior.':undefined}));return;
        }
        if(key==='Data'){
          const fields=node('div',undefined,'gt-fields');block.appendChild(fields);value.forEach((v,i)=>{
            const d=Schema.dataDescriptor(Object.assign({},context,{unit:record}),i);
            if(context.table==='BuildEnum'&&Number(context.id)===3&&i===1)d.options=this._unitOptions(false,'ally').filter(o=>o.value>=90001&&o.value<=90004);
            if(context.table==='SoldierCfg'&&[90010,90011].indexOf(Number(context.id))>=0&&i===2)d.options=this._unitOptions(true).filter(o=>o.value!==-1);
            this._field(fields,d.label,v,n=>this._set(doc,keys.concat(i),n),d);
          });return;
        }
        if(key==='Excursion'||key==='Unlock'&&context.table==='EquipCfg'){
          const fields=node('div',undefined,'gt-fields');block.appendChild(fields);value.forEach((v,i)=>this._field(fields,key==='Excursion'?(i?'Y offset':'X offset'):(i?'Wave':'Stage'),v,n=>this._set(doc,keys.concat(i),n),{integer:key==='Unlock'}));return;
        }
        if(key==='HomeLevel1Unlock'||key==='HomeLevel2Unlock'||key==='HomeLevel3Unlock'){
          value.forEach((pair,i)=>{const row=node('div',undefined,'gt-array-row');block.appendChild(row);this._field(row,'Building',pair[0],n=>this._set(doc,keys.concat(i,0),n),{options:Object.keys(Schema.BUILDINGS).map(id=>({value:Number(id),label:Schema.BUILDINGS[id]}))});this._field(row,'Map slot',pair[1],n=>this._set(doc,keys.concat(i,1),n),{integer:true,min:1});row.appendChild(button('Remove',()=>{const next=clone(value);next.splice(i,1);this._set(doc,keys,next);},'gt-mini'));});block.appendChild(button('Add building slot',()=>this._set(doc,keys,value.concat([[2,1]])),'gt-mini'));return;
        }
        if(key==='BranchBuild'){
          const levels=context.building.levelList||[];value.forEach((v,i)=>{const row=node('div',undefined,'gt-array-row');block.appendChild(row);this._field(row,'Next branch',v,n=>this._set(doc,keys.concat(i),n),{options:levels.map(l=>({value:l.index,label:'#'+l.index+' · '+this._text(l.Name)}))});row.appendChild(button('Remove',()=>{const next=value.slice();next.splice(i,1);if(next.length)this._set(doc,keys,next);else this._change([{doc,path:keys,remove:true}]).catch(()=>{});},'gt-mini'));});block.appendChild(button('Add branch',()=>{const next=levels.find(l=>l.index!==context.levelIndex+1&&value.indexOf(l.index)<0);if(next)this._set(doc,keys,value.concat(next.index));},'gt-mini'));return;
        }
        if(key==='AttackPriority'){
          this._note('Legacy authored metadata: the current runtime does not use these priority values. Targets are selected by nearest eligible target.',false,block);value.forEach((v,i)=>this._field(block,'Stored priority '+(i+1),v,()=>{},{readOnly:true}));return;
        }
        if(key==='WaveReward'||key==='Award'){this._rewardRows(block,doc,keys,value);return;}
        if(key==='ChallengeReward'){value.forEach((rewards,i)=>{const section=this._section('Challenge '+(i+1),block);this._rewardRows(section,doc,keys.concat(i),rewards);});return;}
        if(key==='MissionID'){
          value.forEach((v,i)=>{const row=node('div',undefined,'gt-array-row');block.appendChild(row);const definitions=this._data('A').InGameTaskEnum||{};this._field(row,'Mission '+(i+1),v,n=>this._set(doc,keys.concat(i),n),{options:Object.keys(definitions).map(k=>({value:Number(k),label:this._text(definitions[k].Name)}))});row.appendChild(button('Remove',()=>{const next=value.slice();next.splice(i,1);this._set(doc,keys,next);},'gt-mini'));});block.appendChild(button('Add mission',()=>this._set(doc,keys,value.concat(1)),'gt-mini'));return;
        }
        value.forEach((v,i)=>{if(v&&typeof v==='object'){const child=this._section('Item '+(i+1),block,true);this._properties(child,doc,keys.concat(i),v,context);}else this._field(block,Array.isArray(v)?'Item '+(i+1):meta.label+' '+(i+1),v,n=>this._set(doc,keys.concat(i),n),meta);});return;
      }
      if(typeof value==='object'){const block=this._section(meta.label,container,true);this._properties(block,doc,keys,value,context);return;}
      if(key==='kindID')meta.options=Object.keys(this._data('A').TalentCfg||{}).map(id=>({value:Number(id),label:this._text(this._data('A').TalentCfg[id].Name)}));
      if(key==='Suppressed')meta.options=this._unitOptions(true).filter(x=>x.value!==-1);
      if(key==='CounterType')meta.options=[{value:'',label:'None'},...Object.entries(this._data('overrides').unitTypes||{}).map(([value,type])=>({value,label:type.name}))];
      this._field(container,meta.label,value,v=>this._set(doc,keys,v),meta);
    },
    _unitRole(side,id){const tools=this._data('overrides'),key=(side||'enemy')+':'+id+':'+UnitRecords.form(side||'enemy',id),role=(tools.unitTypeAssignments||{})[key];return ((tools.unitTypes||{})[role]||{}).name||'';},
    _unitOptions(forms,side){
      const data=this._data('A'),units=(side==='ally'&&data.AllyCfg)||data.SoldierCfg||{};
      const chooseEnemy=!forms&&side!=='ally',profiles=this._data('overrides').unitProfiles||{};
      const options=Object.keys(units).filter(id=>forms||units[id].prefab&&!(chooseEnemy&&profiles.aliases?.[id])).map(id=>{
        const unit=units[id],role=this._unitRole(side,id),info=UnitPacks.info(unit.MonsterPack);
        const pack=info?info.label.replace('Monster Pack','Pack'):'';
        const boss=chooseEnemy&&UnitRecords.behavior(unit,id)===90010?' · '+EnemyClasses.label('boss'):'';
        return {value:Number(id),label:this._text(unit.Name)+boss+(role?' · '+role:'')+(pack?' · '+pack:'')+' · '+id};
      });
      return [{value:-1,label:'Wait (spawn ticks)'}].concat(options);
    },
    _rewardRows(parent,doc,keys,rewards){
      const goods=this._data('A').GoodsCfg||{},options=Object.keys(goods).map(id=>({value:Number(id),label:this._text(goods[id].Name||goods[id].name||id)+' · '+id}));
      rewards.forEach((reward,i)=>{const row=node('div',undefined,'gt-array-row');parent.appendChild(row);this._field(row,'Reward item',reward[0],v=>this._set(doc,keys.concat(i,0),v),{options});this._field(row,'Amount',reward[1],v=>this._set(doc,keys.concat(i,1),v),{integer:true,min:0});row.appendChild(button('Remove',()=>{const next=clone(rewards);next.splice(i,1);this._set(doc,keys,next);},'gt-mini'));});parent.appendChild(button('Add reward',()=>this._set(doc,keys,rewards.concat([[2001,1]])),'gt-mini'));
    },
    _stage(row){
      const stage=row.record,p=row.path,doc=row.doc;
      this._note('Variant '+doc+' owns this complete stage table. Unit stats, perks, missions and global settings are shared from A.');
      const section=this._section('Stage settings');this._properties(section,doc,p,stage,{table:'LevelCfg'},['WaveCfg','HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock','ChallengeReward','Challenge']);
      const waves=this._section('Waves');waves.className='';const bar=node('div',undefined,'gt-wavebar');waves.appendChild(bar);
      this._wave=Math.min(this._wave,stage.WaveCfg.length-1);
      stage.WaveCfg.forEach((wave,i)=>bar.appendChild(button(String(i+1),()=>{this._wave=i;this._render();},i===this._wave?'active':'')));
      const w=stage.WaveCfg[this._wave],wp=p.concat('WaveCfg',this._wave);
      if(w){
        let units=0,wait=0;(w.RefreshSoldierKind||[]).forEach(text=>{try{Schema.parseSpawn(text).groups.forEach(g=>g.unit===-1?wait+=g.count:units+=g.count);}catch(ignore){}});
        const kpi=node('div',undefined,'gt-kpi');[[units,'Units'],[(w.RefreshSoldierKind||[]).length,'Spawn lanes'],[wait,'Wait ticks'],[w.StartSliver,'Starting silver']].forEach(pair=>{const d=node('div');d.appendChild(node('strong',pair[0]));d.appendChild(node('span',pair[1]));kpi.appendChild(d);});waves.appendChild(kpi);
        this._properties(waves,doc,wp,w,{table:'WaveCfg'},['RefreshSoldierKind','WaveReward']);
        const spawn=node('div');waves.appendChild(spawn);this._spawns(spawn,doc,wp.concat('RefreshSoldierKind'),w.RefreshSoldierKind,stage.prefab);
        const rewardSection=this._section('Wave rewards',waves,true);this._rewardRows(rewardSection,doc,wp.concat('WaveReward'),w.WaveReward||[]);
        const actions=node('div',undefined,'gt-actions left');waves.appendChild(actions);
        const move=direction=>{const next=clone(stage.WaveCfg),from=this._wave,to=from+direction;if(to<0||to>=next.length)return;const item=next[from];next[from]=next[to];next[to]=item;next.forEach((wave,i)=>wave.Wave=i+1);this._wave=to;this._set(doc,p.concat('WaveCfg'),next);};
        const earlier=button('Move earlier',()=>move(-1));earlier.disabled=this._wave===0;actions.appendChild(earlier);
        const later=button('Move later',()=>move(1));later.disabled=this._wave===stage.WaveCfg.length-1;actions.appendChild(later);
        actions.appendChild(button('Duplicate wave at end',()=>{const next=clone(stage.WaveCfg),duplicate=clone(w);duplicate.Wave=next.length+1;next.push(duplicate);this._wave=next.length-1;this._set(doc,p.concat('WaveCfg'),next);}));
        if(stage.WaveCfg.length>1)actions.appendChild(button('Remove selected wave',()=>this._confirm('Remove wave '+w.Wave+'?','Later waves will move up one position. Existing progression and unlock references must remain valid.',()=>{const next=clone(stage.WaveCfg);next.splice(this._wave,1);next.forEach((wave,i)=>wave.Wave=i+1);this._wave=Math.max(0,this._wave-1);this._set(doc,p.concat('WaveCfg'),next);},'Remove wave'),'gt-danger'));
      }
      const unlocks=this._section('Building unlocks by castle level',undefined,true);['HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock'].forEach(key=>this._value(unlocks,doc,p.concat(key),stage[key]||[],key,{table:'LevelCfg'},stage));
      const challenges=this._section('Challenges & rewards',undefined,true);['Challenge','ChallengeReward'].forEach(key=>this._value(challenges,doc,p.concat(key),stage[key]||[],key,{table:'LevelCfg'},stage));
      const missionIndex=stage.Level===1?0:1,mission=(this._data('A').InGameTaskCfg||[])[missionIndex];
      if(mission){const missions=this._section('Linked battle missions',undefined,true);this._note(stage.Level===1?'Shared mission set used by stage 1.':'Shared mission set used by every stage after stage 1.',false,missions);this._properties(missions,'A',['InGameTaskCfg',missionIndex],mission,{table:'InGameTaskCfg'});}
      const globals=this._section('Shared spawn timing',undefined,true),setting=this._data('A').ParameterCfg['60018'];
      this._field(globals,'Spawn interval (seconds)',setting.Value,value=>this._set('A',['ParameterCfg','60018','Value'],value),{numeric:true,min:0.000001,help:'Shared by all lanes, stages and variants. A wait group consumes this many seconds per tick (subject to game updates).'});
    },
    _spawns(parent,doc,keys,encoded,map){
      const title=node('h3','Spawn lanes & ordered groups');title.style.marginTop='18px';parent.appendChild(title);
      const maxLane=MapCatalog.lanes(map)||15,options=this._unitOptions(false);
      encoded.forEach((text,i)=>{
        let data;try{data=Schema.parseSpawn(text);}catch(error){this._note('Unrecognized spawn record '+(i+1)+': '+error.message,true,parent);return;}
        const lane=node('div',undefined,'gt-spawn-lane'),head=node('div',undefined,'gt-lane-header');lane.appendChild(head);parent.appendChild(lane);
        const write=next=>this._set(doc,keys.concat(i),Schema.encodeSpawn(next));
        this._field(head,'Map spawn lane',data.lane,v=>{const next=clone(data);next.lane=v;write(next);},{options:Array.from({length:maxLane},(_,n)=>({value:n+1,label:'Lane '+(n+1)}))});
        head.appendChild(button('Remove lane',()=>{const next=encoded.slice();next.splice(i,1);this._set(doc,keys,next);},'gt-mini gt-danger'));
        data.groups.forEach((group,gi)=>{
          const row=node('div',undefined,'gt-array-row');lane.appendChild(row);
          this._field(row,'Group '+(gi+1),group.unit,v=>{const next=clone(data);next.groups[gi].unit=v;write(next);},{options});
          this._field(row,group.unit===-1?'Wait ticks':'Quantity',group.count,v=>{const next=clone(data);next.groups[gi].count=v;write(next);},{integer:true,min:1});
          if(gi>0)row.appendChild(button('↑',()=>{const next=clone(data),a=next.groups[gi-1];next.groups[gi-1]=next.groups[gi];next.groups[gi]=a;write(next);},'gt-mini'));
          if(data.groups.length>1)row.appendChild(button('×',()=>{const next=clone(data);next.groups.splice(gi,1);write(next);},'gt-mini'));
        });
        const action=node('div',undefined,'gt-actions left');lane.appendChild(action);action.appendChild(button('Add unit group',()=>{const next=clone(data);next.groups.push({unit:90001,count:1});write(next);},'gt-mini'));action.appendChild(button('Add wait',()=>{const next=clone(data);next.groups.push({unit:-1,count:1});write(next);},'gt-mini'));
      });
      parent.appendChild(button('Add spawn lane',()=>{const used=encoded.map(x=>{try{return Schema.parseSpawn(x).lane;}catch(ignore){return 0;}}),free=Array.from({length:maxLane},(_,i)=>i+1).find(i=>used.indexOf(i)<0);if(!free)return this._status('Every spawn lane is already used. Add groups inside an existing lane.',true);this._set(doc,keys,encoded.concat(Schema.encodeSpawn({lane:free,groups:[{unit:90001,count:1}]})));},'gt-mini'));
    },
    _perk(row){
      const r=row.record,p=row.path,overrides=this._data('overrides'),entry=(overrides.perks||{})[r.ID],enabled=!entry||entry.enabled!==false;
      const chips=node('div',undefined,'gt-chips');chips.appendChild(node('span',Schema.RARITIES[r.Quality-1],'gt-chip '+Schema.RARITIES[r.Quality-1].toLowerCase()));chips.appendChild(node('span',enabled?(r.Unlock?'Talent-gated':'Available without talent'):'Disabled by saved/draft override','gt-chip'));this.$detail.appendChild(chips);
      const properties=this._section('Perk properties');this._properties(properties,'A',p,r,{table:'BuffCfg'},['Pamer','isPerecentage','Unlock']);
      const controls=this._section('Availability');this._field(controls,'Enabled',enabled,v=>this._change(v?[{doc:'overrides',path:['perks',String(r.ID)],remove:true}]:[{doc:'overrides',path:['perks',String(r.ID)],value:{enabled:false}}]).catch(()=>{}),{boolean:true,help:'Default is enabled. Unchecking creates an explicit override only when you save.'});
      const talents=this._data('A').TalentCfg||{};this._field(controls,'Required talent',r.Unlock||0,v=>this._change(v?[{doc:'A',path:p.concat('Unlock'),value:v}]:[{doc:'A',path:p.concat('Unlock'),remove:true}]).catch(()=>{}),{options:[{value:0,label:'No talent requirement'}].concat(Object.keys(talents).map(id=>({value:Number(id),label:this._text(talents[id].Name)+' · '+id})))});
      const effects=this._section('Effect values');this._value(effects,'A',p.concat('Pamer'),r.Pamer,'Pamer',{table:'BuffCfg'},r);
      this._note('Percent inputs change existing effect values. Fixed conditions described in the text (such as a 3-second duration) stay as implemented unless the game already exposes that value.');
      this._note('Selection weight is relative, not a guaranteed percentage. Unlocks, acquired perks, rarity rules and disabled perks change the available pool.');
    },
    _building(row){
      Buildings.render(this,row,{ipc});
    },
    _equipment(row){
      const r=row.record,p=row.path,config=this._data('A'),secondary=r.id===3&&HeroEquipmentStats.enabled(config),context={table:'EquipCfg',equipment:r.id,weaponStats:HeroEquipmentStats.enabled(config),baseDamage:r.id===4&&HeroEquipmentStats.enabled(config)};
      this._properties(this._section('Equipment category'),'A',p,r,context,['levelInfo',...(context.weaponStats&&(r.id===3||r.id===4)?['Describe']:[])]);
      if(row.heroStyle)this._note(secondary?'These bonuses apply only while '+HeroWeapons.find(row.heroStyle).name+' is equipped. Each style has its own secondary values and upgrade progress.':'Main weapons provide attack damage. Each style keeps its own upgrade progress.');
      if(secondary&&row.heroStyle==='bruiser')this._note('Critical damage improves critical hits. Critical chance comes from your perks and relics.');
      if(HeroEquipmentStats.enabled(config)&&(r.id===3||r.id===4)){const defaults=this._section('Weapon combat defaults');this._heroAttackRateField(defaults,row.heroStyle);this._field(defaults,'Base attack range',config.HeroEquipment.baseRange,v=>this._set('A',['HeroEquipment','baseRange'],v),{min:1});if(row.heroStyle==='mystic'&&secondary)this._field(defaults,'Splash radius',config.HeroEquipment.splashRadius,v=>this._set('A',['HeroEquipment','splashRadius'],v),{min:1});}
      const damage=context.baseDamage&&HeroWeapons.find(row.heroStyle);
      if(damage)HeroDamage.render(this,row.heroStyle,node,button);
      const curves=HeroEquipmentStats.enabled(config);
      if(curves)EquipmentCurve.render(this,row,node,button);
      const stat=l=>curves?EquipmentCurve.summary(config,row,l.Level):String(l.Parameters);
      const levels=this._section('Level progression');levels.className='';
      this._level=Math.min(this._level,r.levelInfo.length-1);const select=this._field(levels,'Edit level',this._level,v=>{this._level=v;this._render();},{options:r.levelInfo.map((l,i)=>({value:i,label:EquipmentTiers.label(r,l.Level)+' · Upgrade '+l.Level+' · '+stat(l)+' · '+l.GoldCost+' gold'}))});
      select.title='Tier and level within that tier. Upgrade is the existing overall progression level.';
      const table=node('table',undefined,'gt-grid-table'),head=node('tr');['Tier / Level','Upgrade',curves?'Total upgrade bonuses':'Stat','Gold cost'].forEach(t=>head.appendChild(node('th',t)));table.appendChild(head);
      r.levelInfo.forEach((level,i)=>{const tr=node('tr',undefined,i===this._level?'selected':'');tr.setAttribute('data-click','true');tr.onclick=()=>{this._level=i;this._render();};[EquipmentTiers.label(r,level.Level),level.Level,stat(level),level.GoldCost].forEach(v=>tr.appendChild(node('td',v)));table.appendChild(tr);});const scroll=node('div');scroll.style.maxHeight='220px';scroll.style.overflow='auto';scroll.appendChild(table);levels.appendChild(scroll);
      const level=r.levelInfo[this._level],settings=this._section(EquipmentTiers.label(r,level.Level)+' settings');this._note(EquipmentTiers.label(r,level.Level)+' · '+stat(level));this._properties(settings,'A',p.concat('levelInfo',this._level),level,context,['Level','EquipSkin','SecondaryStats',...(curves?['Parameters']:[])]);
      if(curves)EquipmentCurve.levelFields(this,settings,row);
      this._note('The item supplies its icon automatically. Edit a tier’s fitted appearance in Items; every upgrade in that tier uses it.');
      this.$detail.appendChild(button('Edit tier appearance in Items',()=>Editor.Panel.open('hkd-items')));
      this._note('These values also supply the hero’s base stats. The Units panel reads the same equipment data; it does not create a separate copy.');
    },
    _relic(row){
      const r=row.record,p=row.path,goods=this._data('A').GoodsCfg||{},good=goods[r.goodID];
      this._properties(this._section('Relic effect'),'A',p,r,{table:'TreasureCfg'},['levelInfo','Conversion']);
      if(good){this._localized(this._section('Display name'),'A',['GoodsCfg',String(r.goodID),'name'],good.name,'Relic name');const icons=this._section('Icons');['icon','sprBg'].forEach(key=>this._value(icons,'A',['GoodsCfg',String(r.goodID),key],good[key],key,{table:'TreasureCfg'},good));}
      const reward=this._section('Conversion reward');this._field(reward,'Goods ID',r.Conversion[0],v=>this._set('A',p.concat('Conversion',0),v),{options:Object.keys(goods).map(id=>({value:Number(id),label:this._text(goods[id].name)+' · '+id}))});this._field(reward,'Amount',r.Conversion[1],v=>this._set('A',p.concat('Conversion',1),v),{integer:true,min:0});
      this._level=Math.min(this._level,r.levelInfo.length-1);const levels=this._section('Progression');this._field(levels,'Edit level',this._level,v=>{this._level=v;this._render();},{options:r.levelInfo.map((l,i)=>({value:i,label:'Level '+l.Level}))});
      const level=r.levelInfo[this._level];if(level)this._properties(this._section('Level '+level.Level),'A',p.concat('levelInfo',this._level),level,{table:'TreasureCfg'},['vaulePercentage']);
      this._note('Relic IDs, goods bindings and implemented talent effects stay fixed. Costs and effect values use the existing progression; icons do not change equipped hero artwork.');
    },
    _talent(row){
      const r=row.record,p=row.path;this._properties(this._section('Talent effect'),'A',p,r,{table:'TalentCfg'});
      const list=(this._data('A').TalentLevelCfg||[]).map((r,i)=>({record:r,index:i})).filter(x=>x.record.kindID===Number(row.key));
      const levels=this._section('Progression records');levels.className='';
      if(!list.length){this._note('This effect has no progression records.',false,levels);return;}
      this._talentLevel=Math.min(this._talentLevel,list.length-1);const bar=node('div',undefined,'gt-talent-progress');levels.appendChild(bar);list.forEach((x,i)=>bar.appendChild(button('Level '+x.record.Level+' · #'+x.record.ID,()=>{this._talentLevel=i;this._render();},i===this._talentLevel?'active':'')));
      const selected=list[this._talentLevel];this._properties(this._section('Progression level '+selected.record.Level),'A',['TalentLevelCfg',selected.index],selected.record,{table:'TalentLevelCfg'},['vaulePercentage']);
      const all=this._section('Complete progression overview',undefined,true),table=node('table',undefined,'gt-grid-table');const heading=node('tr');['Row','Effect','Gold','Record'].forEach(x=>heading.appendChild(node('th',x)));table.appendChild(heading);
      const definitions=this._data('A').TalentCfg;
      (this._data('A').TalentLevelCfg||[]).forEach(t=>{const tr=node('tr');tr.setAttribute('data-click','true');tr.onclick=()=>{this._selected=String(t.kindID);const ownRows=this._data('A').TalentLevelCfg.filter(x=>x.kindID===t.kindID);this._talentLevel=ownRows.indexOf(t);this._render();};[t.Level,this._text(definitions[t.kindID].Name),t.GoldCost,t.ID].forEach(v=>tr.appendChild(node('td',v)));table.appendChild(tr);});all.appendChild(table);
      this._note('Progression follows ordered rows. Existing IDs and effect types stay stable; an arbitrary new skill requires its gameplay implementation.');
    },
    _unit(row){
      UnitProfiles.bar(this,row,node);
      if(row.unitType==='hero'){
        this._note('The hero combines equipment stats and layered animated equipment. Choose levels in the silent preview; those choices never change player progression.');
        this._unitProjectileSpeedField(row);
        const fields=this._section('Base stats from equipment');
        (this._data('A').EquipCfg||[]).forEach((equipment,i)=>{const current=HeroEquipmentStats.enabled(this._data('A'));if((equipment.id===3||equipment.id===4)&&current)return;const r=equipment.levelInfo[0];this._field(fields,Schema.EQUIPMENT[i]+' · level 1',r.Parameters,value=>current?EquipmentCurve.baseChange(this,{record:equipment,path:['EquipCfg',i]},value):this._set('A',['EquipCfg',i,'levelInfo',0,'Parameters'],value),{min:0,commitUnchanged:current,help:'Starting stat from Equipment. Edits preserve upgrade increases; use Equipment to shape the upgrade curve.'});});
        if(HeroEquipmentStats.enabled(this._data('A'))){const damage=this._section('Starting damage by fighting style');HeroWeapons.styles.forEach(style=>HeroDamage.startingField(this,damage,style.id,style.name+' · Starting damage'));}
        fields.appendChild(button('Open Equipment panel',()=>openPanel('equipment').catch(e=>this._status(e.message,true))));return;
      }
      const id=Number(row.unitID);this._note(row.unitType==='ally'?'Allied unit: Barracks uses the selected level’s stats and the matching appearance from Characters. Changes apply after Save.':'Enemy unit: its name, model, stats and timing are independent of allies.');
      if(row.unitType==='ally')this._unitLevelStats(row);
      if(row.unitType==='enemy'&&Skills.supported(row.record,this._data('overrides')))this._enemySkillFields(row);
      else this._unitAttackFields(row);
      if(row.record.MonsterSource)this._note('Imported source: '+row.record.MonsterSource+' · Behavior controller: '+row.record.BehaviorTemplate+'. Names, stats, roles and attack timing are editable independently for this unit.');
      if(row.record.CampaignBaseUnit)this._note('Campaign profile: controller '+row.record.CampaignBaseUnit+' · Appearance source unit '+row.record.AppearanceSourceUnit+'. Its initial combat settings preserve the original campaign profile; editing this record changes this profile independently of the source-roster monster.');
      this._unitGuide(row);
      if(!row.record.prefab)this._note('This is a boss transformation form. It is reached through the boss’s behavior and is not a directly spawnable unit.');
      const typeKey=row.unitType+':'+row.unitID+':'+UnitRecords.form(row.unitType,id),types=this._data('overrides').unitTypes||{},assignments=this._data('overrides').unitTypeAssignments||{},typeFields=this._section('Fighting type & map pictogram');
      if(row.unitType==='enemy')this._field(typeFields,'Enemy class',EnemyClasses.resolve(this._data('overrides'),id),value=>this._change(()=>{if(!EnemyClasses.CHOICES.some(choice=>choice.value===value))throw Error('Choose Normal, Elite or Boss.');const settings=this._data('overrides');if(EnemyClasses.resolve(settings,id)===value)return [];return [{doc:'overrides',path:['enemyClasses'],value:Object.assign({},settings.enemyClasses||{},{[typeKey]:value})}];}),{options:EnemyClasses.CHOICES,help:'Normal, Elite or Boss classification for this enemy profile. Stats, abilities and combat-role counters are edited separately.'});
      this._field(typeFields,'Fighting type',assignments[typeKey]||'',value=>{const next=Object.assign({},assignments);if(value)next[typeKey]=value;else delete next[typeKey];return this._set('overrides',['unitTypeAssignments'],next);},{options:[{value:'',label:'Original battle icon'},...Object.keys(types).map(key=>({value:key,label:types[key].name}))],readOnly:row.unitType==='enemy'&&!!require('../lib/fighting-profiles').familyFor(this._data('overrides'),id),help:'Combat role used for counter bonuses and global damage taken. The Battle icon below overrides the type pictogram for this unit.'});
      const counterType=FightingTypeDamage.counterType(types,assignments[typeKey]);
      if(counterType!==undefined){
        this._field(typeFields,'Countered fighting type',types[counterType].name,null,{readOnly:true,help:'Inherited from this unit’s fighting type.'});
      }else{
        this._field(typeFields,'Countered fighting type',row.record.CounterType===undefined?'__legacy':row.record.CounterType,value=>this._set('A',row.path.concat('CounterType'),value),{options:[...(row.record.CounterType===undefined?[{value:'__legacy',label:'Original matchup (legacy)'}]:[]),{value:'',label:'None'},...Object.keys(types).map(key=>({value:key,label:types[key].name}))],help:'Applies the configured damage multiplier to every opposing unit assigned to this type. Does not affect target priority.'});
      }
      typeFields.appendChild(button('Manage types & pictograms',()=>openPanel('unit-types').catch(error=>this._status(error.message,true))));
      if(row.unitType==='ally'){
        const visualFields=this._section('Model transform'),visuals=this._data('overrides').visuals||{},visual=visuals[typeKey]||{};
        const setVisual=(field,value)=>{const next=Object.assign({},this._data('overrides').visuals||{});next[typeKey]=Object.assign({},next[typeKey],{[field]:value});return this._set('overrides',['visuals'],next);};
        for(const [key,label,initial,min,max]of [['x','Offset X',0,-4096,4096],['y','Offset Y',0,-4096,4096],['scaleX','Scale X',1,.01,20],['scaleY','Scale Y',1,.01,20],['rotation','Rotation',0,-3600,3600]])this._field(visualFields,label,visual[key]===undefined?initial:visual[key],value=>setVisual(key,value),{min,max});
        this._field(visualFields,'Model tint',visual.tint||'#ffffff',value=>setVisual('tint',value),{color:true});
        visualFields.appendChild(button('Edit rider, horse & parts',()=>ipc('open-characters').catch(error=>this._status(error.message,true))));
      }
      const excluded=['Suppressed','CounterType','AttackType','UnitAttack','MonsterSource','MonsterPack','BehaviorTemplate','CampaignBaseUnit','AppearanceSourceUnit','Guide'];
      const stats=this._section(row.unitType==='ally'?'Shared unit settings':'Stats & behavior');
      if(row.unitType==='enemy'){
        excluded.push('prefab','loadIcon','BuildingCross','AttackPriority','EnemyTargeting','TransformSkill','EnemySkills');
        const entries=(this._data('overrides').unitProfiles||{}).entries;
        if(entries?.[row.unitID]?.created)excluded.push('Name');
      }
      const fields=this._properties(stats,'A',row.path,row.record,{table:'SoldierCfg',id:row.unitID,side:row.unitType},excluded.concat(row.unitType==='ally'?UnitLevelStats.FIELDS:[]));
      if(row.unitType==='enemy'){
        const iconField=node('div',undefined,'gt-field'),line=node('div',undefined,'gt-asset-row');
        iconField.appendChild(node('span','Battle icon'));
        const icon=this._image(row.record.loadIcon);
        if(icon){const image=node('img',undefined,'gt-thumb');image.src=icon.url;image.alt='';line.appendChild(image);}
        line.appendChild(button('Choose icon…',()=>this._pickIcon(row.record.loadIcon,value=>this._set('A',row.path.concat('loadIcon'),value),Schema.descriptor('loadIcon',{table:'SoldierCfg'})),'gt-mini'));
        iconField.appendChild(line);
        fields.appendChild(iconField);
        this._field(fields,'Ground or flight unit',row.record.BuildingCross?1:0,value=>this._set('A',row.path.concat('BuildingCross'),value),{
          options:[{value:1,label:'Ground'},{value:0,label:'Flight'}],
          help:'Ground units respect blockers. Flight units can travel over them.'
        });
        this._enemyTargetFields(row);
      }
      if(row.unitType==='ally'){
        const base=this._section('Shared base stats',undefined,true);
        this._note('These values supply every level until you customize that level. Perks, talents and relic bonuses are applied afterward in battle.',false,base).style.gridColumn='1 / -1';
        for(const field of UnitLevelStats.FIELDS){
          if(field==='AttackInterval')this._field(base,'Base attack cooldown (seconds)',1/row.record[field],value=>this._set('A',row.path.concat(field),1/value),{min:0.000001,help:'Shared waiting time after the hit. Each level’s Attacks per second also includes its windup and animation duration.'});
          else if(field==='SightRange')this._unitSightRangeField(base,row);
          else this._value(base,'A',row.path.concat(field),row.record[field],field,{table:'SoldierCfg',id:row.unitID,side:'ally'},row.record);
        }
      }
      this._note('Attacks per second includes the cooldown, hit windup and full attack animation. Changing the selected level’s animation speed or hit timing recalculates its rate. Perks, movement and interruptions can change the rate during battle.');
    },
    _enemySkillFields(row){
      const fields=this._section('Skills');
      for(const control of Skills.fields(this._data('A'),this._data('overrides'),this._data('catalog'),row.record)){
        const path=row.path.concat(control.property);
        const change=value=>this._change(()=>{
          const units=this._data('A').SoldierCfg,unit=units[row.unitID];
          const next=control.update(unit[control.property],value);
          const problem=Skills.issue(unit,control.property,next,units,this._data('overrides'));
          if(problem)throw Error(problem);
          return [next===undefined?{doc:'A',path,remove:true}:{doc:'A',path,value:next}];
        }).catch(()=>{});
        this._field(fields,control.label,control.value,change,control);
      }
      this._unitAttackFields(row,fields);
    },
    _enemyTargetFields(row){
      const fields=this._section('Target priority'),key=row.path.concat('EnemyTargeting'),stored=row.record.EnemyTargeting;
      const rule=EnemyTargeting.issue(stored)?{mode:'nearest'}:stored;
      if(UnitAttack.attackType(row.record)===3){
        this._note('Choose Melee or Ranged in Attack to set targets for this support unit.',false,fields).style.gridColumn='1 / -1';
        return;
      }
      const defaultOrder=EnemyTargeting.targets.map(target=>target.value);
      const change=update=>this._change(()=>{
        const value=get(this._data('A'),key),current=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
        const next=update(current),issue=EnemyTargeting.issue(next);
        if(issue)throw Error(issue);
        return JSON.stringify(current)===JSON.stringify(next)?[]:[{doc:'A',path:key,value:next}];
      },{skipEmpty:true}).catch(()=>{});
      const help={
        nearest:'Selects the nearest eligible target in search range.',
        priority:'The first available group in search range wins. Omitted groups are ignored.',
        castle:'Heads straight for the castle. Ground units break walls in the shortest route to it.',
        hero:'Follows the spawn path until the hero enters search range. Ground units breach walls in the way.'
      };
      this._field(fields,'Targeting rule',rule.mode,mode=>change(current=>({
        ...current,mode,...(mode==='priority'&&!current.order?{order:defaultOrder}:{})
      })),{options:EnemyTargeting.modes,help:help[rule.mode]});
      if(rule.mode!=='priority')return;
      const order=rule.order;
      for(let index=0;index<Math.min(order.length+1,defaultOrder.length);index++){
        const adding=index===order.length,options=adding?EnemyTargeting.targets.filter(target=>!order.includes(target.value)):EnemyTargeting.targets;
        const empty=adding||order.length>1?[{value:'',label:adding?'Choose a group…':'Remove this group'}]:[];
        this._field(fields,'Priority '+(index+1),order[index]||'',value=>change(current=>{
          const next=current.order.slice(),other=next.indexOf(value);
          if(!value)next.splice(index,1);
          else if(other<0)next[index]=value;
          else [next[index],next[other]]=[next[other],next[index]];
          return {...current,order:next};
        }),{options:empty.concat(options)});
      }
    },
    _attackRateField(container,row,level,write,options){return AttackRate.field(this,container,row,level,write,options,ipc);},
    _unitAttackFields(row,parent){
      const fields=this._section('Attack',parent),attack=UnitAttack.settings(row.record),ranged=UnitAttack.attackType(row.record)===2;
      if(parent)fields.parentNode.style.gridColumn='1 / -1';
      const original=UnitRecords.behavior(row.record,row.unitID)===90007?'Melee splash':({1:'Melee',2:'Ranged',3:'Support'})[row.record.AttackType];
      const edit=(field,value)=>this._unitAttackEdit(row,field,value).catch(()=>{});
      this._field(fields,'Attack delivery',attack?attack.delivery:'original',value=>edit('delivery',value),{options:[
        {value:'original',label:original?'Original ('+original+')':'Original'}, {value:'melee',label:'Melee'}, {value:'ranged',label:'Ranged'}
      ]});
      if(ranged){
        const key=row.unitType+':'+row.unitID;
        fields.appendChild(button('Open Projectile editor',()=>ipc('open-projectiles',{key}).catch(error=>this._status(error.message,true))));
      }
      if(attack){
        const labels={single:'Single target',splash:'Splash',volley:'Multiple projectiles',piercing:'Piercing',chain:'Chain hits'};
        this._field(fields,'Attack pattern',attack.pattern,value=>edit('pattern',value),{
          options:UnitAttack.patterns[attack.delivery].map(value=>({value,label:labels[value]}))
        });
        const numeric=(key,label,help,percent=false)=>{
          const rule=UnitAttack.fields[key];
          this._field(fields,label,attack[key],value=>edit(key,value),{min:rule.min,max:percent?rule.max*100:rule.max,integer:rule.integer,percent,help});
        };
        if(attack.pattern==='splash'){
          numeric('splashRadius','Splash radius','Distance from the impact point in world units.');
          numeric('splashFalloff','Damage at splash edge (%)','Damage scales linearly from full damage at the center to this percentage at the edge.',true);
        }else if(attack.pattern==='volley'){
          numeric('shotsPerVolley','Projectiles per attack','Fires one projectile at each available target within attack range, up to this count.');
        }else if(attack.pattern==='piercing'){
          numeric('pierceTargets','Targets per projectile','Maximum number of targets struck along the projectile’s path, including the first.');
        }else if(attack.pattern==='chain'){
          numeric('chainHits','Maximum chain hits','Total number of hits, including the first.');
          numeric('chainRange','Chain jump range','Maximum distance to the next target in world units.');
          numeric('chainDamageLoss','Damage lost per jump (%)','Each jump loses this percentage of the previous hit’s base damage. Zero keeps full damage.',true);
        }
        if(row.record.AttackDamage===undefined)numeric('attackDamage','Attack damage','Base damage for this attack.');
        if(row.record.AttackRange===undefined)numeric('attackRange','Attack range','Distance at which this unit can start an attack.');
      }
      if(ranged)this._unitProjectileSpeedField(row,fields);
    },
    _unitAttackEdit(row,field,value){
      return this._change(()=>{
        const record=UnitRecords.record(this._data('A'),row.unitType,row.unitID);
        if(!record)throw Error('Choose an existing unit.');
        const saved=record.UnitAttack;
        if(saved===undefined&&field==='delivery'&&value==='original')return [];
        const next=Object.assign({},saved,{[field]:value});
        if(field==='delivery'&&value!=='original'&&!UnitAttack.allowed(value,next.pattern))next.pattern='single';
        const error=UnitAttack.issues(next)[0];
        if(error)throw Error(error.message);
        if(saved&&saved[field]===value&&saved.pattern===next.pattern)return [];
        return [{doc:'A',path:row.path.concat('UnitAttack'),value:next}];
      },{skipEmpty:true});
    },
    _unitProjectileSpeedField(row,parent){
      const table=this._data('overrides').projectileSpeeds,key=row.unitType==='hero'?'hero:hero:default':row.unitType+':'+row.unitID+':'+UnitRecords.form(row.unitType,row.unitID),malformed=table!==undefined&&(!table||typeof table!=='object'||Array.isArray(table)),custom=!malformed&&own(table,key),value=custom?table[key]:this._unitProjectileSpeedValue(row),fields=parent||this._section('Projectile flight');
      this._field(fields,'Projectile flight speed',value,next=>this._unitProjectileSpeedEdit(row,Number(next)).catch(()=>{}),{numeric:true,min:1,max:20000,commitUnchanged:true,readOnly:malformed,help:'World units per second. Shared across this character’s levels. The hero’s existing projectile-speed bonuses still apply. Reset uses the inherited or authored flight speed.'});
      if(malformed)this._note('The projectile speed table has an invalid format. Refresh or correct that configuration before editing.',true,fields);
      else if(custom)fields.appendChild(button('Reset projectile flight speed',()=>this._unitProjectileSpeedEdit(row,undefined).catch(()=>{}),'gt-mini'));
    },
    _unitProjectileSpeedValue(row){
      const type=row.unitType,settings=this._data('overrides'),table=settings.projectileSpeeds;if(type==='enemy'){
        const record=UnitRecords.record(this._data('A'),type,row.unitID);
        const ids=record&&(record.ID>=100000||record.ProfileBaseID)?require('../../../assets/_script/EnemyStageProfiles').referenceIds(record,settings):[Number(row.unitID)];
        for(const id of ids){const value=table&&table['enemy:'+id+':'+UnitRecords.form('enemy',id)];if(value!==undefined)return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=20000?value:500;}
      }
      return 500;
    },
    _unitProjectileSpeedEdit(row,value){
      return this._change(()=>{
        const type=row.unitType,id=type==='hero'?'hero':String(row.unitID),form=UnitRecords.form(type,id),config=this._data('A'),record=type==='hero'?null:UnitRecords.record(config,type,id);
        if(!UnitRecords.reachable(config,type,id,form)||type!=='hero'&&UnitAttack.attackType(record)!==2)throw Error('Choose an existing ranged unit.');
        const key=type+':'+id+':'+form,table=this._data('overrides').projectileSpeeds,at=['projectileSpeeds'];
        if(table!==undefined&&(!table||typeof table!=='object'||Array.isArray(table)))throw Error('The projectile speed table has an invalid format. Refresh before editing.');
        if(value===undefined)return own(table,key)?[{doc:'overrides',path:Object.keys(table).length===1?at:at.concat(key),remove:true}]:[];
        if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>20000)throw Error('Projectile flight speed must be between 1 and 20000.');
        const current=own(table,key)?table[key]:this._unitProjectileSpeedValue(row);if(current===value)return [];
        return [{doc:'overrides',path:table===undefined?at:at.concat(key),value:table===undefined?{[key]:value}:value}];
      },{skipEmpty:true});
    },
    _attackRateCell(element,row,level){return AttackRate.cell(this,element,row,level,ipc);},
    _attackRateMetrics(value){AttackRate.metrics(this,value);},
    _unitSightRangeField(container,row){
      const fallback=AllyAwareness.defaultSightRange,value=row.record.SightRange===undefined?fallback:row.record.SightRange;
      this._field(container,'Sight range',value,next=>this._unitSightRangeEdit(row,Number(next)).catch(()=>{}),{numeric:true,min:0,commitUnchanged:true,help:'Absolute allied awareness radius in world units, independent of the hero’s weapon. Unconfigured units inherit '+fallback+'. Attack range still allows targets within reach.'});
      if(own(row.record,'SightRange'))container.appendChild(button('Reset sight range',()=>this._unitSightRangeEdit(row).catch(()=>{}),'gt-mini'));
    },
    _unitSightRangeEdit(row,value){
      return this._change(()=>{
        const base=get(this._data('A'),row.path);
        if(row.unitType!=='ally'||!base)throw Error('Choose an existing allied unit.');
        if(value===undefined)return own(base,'SightRange')?[{doc:'A',path:row.path.concat('SightRange'),remove:true}]:[];
        if(!UnitLevelStats.valid('SightRange',value))throw Error('Enter a finite sight range of zero or greater.');
        if(value===(base.SightRange===undefined?AllyAwareness.defaultSightRange:base.SightRange))return [];
        return [{doc:'A',path:row.path.concat('SightRange'),value}];
      },{skipEmpty:true});
    },
    _selectedUnitLevel(row){const levels=UnitRecords.levels(this._data('A'),row.unitType,row.unitID);if(!levels.includes(this._unitLevel))this._unitLevel=levels[0]||0;return this._unitLevel;},
    _previousUnitLevel(row,level){return UnitRecords.levels(this._data('A'),row.unitType,row.unitID).filter(value=>value<level).pop()||0;},
    _selectUnitLevel(row,level){if(!UnitRecords.levels(this._data('A'),row.unitType,row.unitID).includes(level))return;this._unitLevel=level;this._render();if(this.$root.focus)this.$root.focus({preventScroll:true});},
    _unitLevelTabs(row){
      const level=this._selectedUnitLevel(row),tabs=node('div',undefined,'gt-unit-level-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Unit levels');this.$detail.appendChild(tabs);
      const levels=UnitRecords.levels(this._data('A'),row.unitType,row.unitID);
      for(const value of levels){const tab=button('Lvl '+value,()=>this._selectUnitLevel(row,value),value===level?'active':'');tab.setAttribute('role','tab');tab.setAttribute('data-unit-level',value);tab.setAttribute('aria-selected',String(value===level));tab.setAttribute('aria-keyshortcuts','Shift+'+value);tab.title='Level '+value+' · Shift+'+value;tab.onkeydown=event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();event.stopPropagation();const next=(levels.indexOf(value)+(event.key==='ArrowRight'?1:levels.length-1))%levels.length;this._selectUnitLevel(row,levels[next]);};tabs.appendChild(tab);}
    },
    _unitLevelStats(row){
      const level=this._selectedUnitLevel(row),key=UnitLevelStats.key(row.unitID,level),settings=this._data('overrides'),effective=UnitLevelStats.resolve(row.record,settings,level),custom=(settings.unitLevels||{})[key]||{},fields=this._section('Level '+level+' stats'),previous=this._previousUnitLevel(row,level),restoreLabel=previous?'Use Lvl '+previous:'Use base',previousStats=previous?UnitLevelStats.resolve(row.record,settings,previous):row.record;
      fields.classList.add('gt-unit-level-fields');
      this._note('Uses Barracks level '+level+' and Characters → '+this._text(row.record.Name)+' → Level '+level+'. Adjusting a value customizes only this level.',false,fields).style.gridColumn='1 / -1';
      for(const field of ['Health','AttackDamage','AttackRange','AttackInterval','SightRange','SearchRange','Speed']){
        const meta=Schema.descriptor(field,{table:'SoldierCfg',side:'ally'}),overridden=own(custom,field);
        const inherited=field==='SightRange'&&row.record[field]===undefined?AllyAwareness.defaultSightRange:row.record[field],value=field==='SightRange'&&effective[field]===undefined?AllyAwareness.defaultSightRange:effective[field];
        const input=field==='AttackInterval'?this._attackRateField(fields,row,level,value=>this._unitLevelEdit(row,level,field,value),{help:overridden?'Custom cooldown for this level.':'Uses the shared base cooldown.'}):this._field(fields,meta.label,value,value=>this._unitLevelEdit(row,level,field,field==='SightRange'?Number(value):value).catch(()=>{}),Object.assign({},meta,{numeric:field==='SightRange'||meta.numeric,commitUnchanged:field==='SightRange',help:(overridden?'Custom for this level.':'Uses shared base '+inherited+'.')+(meta.help?' '+meta.help:'')}));
        input.setAttribute('aria-label','Level '+level+' '+meta.label);
        const previousValue=field==='SightRange'&&previousStats[field]===undefined?AllyAwareness.defaultSightRange:previousStats[field];
        if(overridden||previous&&value!==previousValue){const reset=button(restoreLabel,()=>this._unitLevelEdit(row,level,field,undefined,true).catch(()=>{}),'gt-mini');reset.title='Copy '+meta.label+' from '+(previous?'Level '+previous:'the shared base');reset.setAttribute('aria-label',restoreLabel+' '+meta.label);input.parentNode.appendChild(reset);}
      }
      const actions=node('div',undefined,'gt-unit-level-actions');fields.appendChild(actions);
      const reset=button(previous?restoreLabel+' stats':'Reset Level '+level+' stats',()=>this._unitLevelEdit(row,level,null,undefined,true).catch(()=>{}),'gt-mini');reset.disabled=previous?UnitLevelStats.FIELDS.every(field=>effective[field]===previousStats[field]):!UnitLevelStats.FIELDS.some(field=>own(custom,field));actions.appendChild(reset);
      actions.appendChild(button('Edit level appearance in Characters',()=>ipc('open-characters',{type:'ally',id:String(row.unitID),level}).catch(error=>this._status(error.message,true)),'gt-mini'));
      const overview=this._section('All level stats',undefined,true),table=node('table',undefined,'gt-grid-table'),head=node('tr');['Level','HP','Damage','Attacks/sec','Range','Sight','Speed'].forEach(label=>head.appendChild(node('th',label)));table.appendChild(head);
      for(const value of UnitRecords.levels(this._data('A'),'ally',row.unitID)){const stats=UnitLevelStats.resolve(row.record,settings,value),tr=node('tr',undefined,value===level?'selected':'');tr.setAttribute('data-click','true');tr.onclick=()=>this._selectUnitLevel(row,value);[value,stats.Health,stats.AttackDamage,stats.AttackInterval,stats.AttackRange,stats.SightRange===undefined?AllyAwareness.defaultSightRange:stats.SightRange,stats.Speed].forEach((item,index)=>{const cell=node('td',index===3?'…':item);tr.appendChild(cell);if(index===3)this._attackRateCell(cell,row,value);});table.appendChild(tr);}overview.appendChild(table);
    },
    _unitLevelEdit(row,level,field,value,usePrevious){
      return this._change(()=>{
        const resolved=typeof value==='function'?value():value;
        if(!UnitRecords.levels(this._data('A'),row.unitType,row.unitID).includes(level))throw Error('This unit level changed. Refresh before editing.');
        if(field!==null&&(!UnitLevelStats.FIELDS.includes(field)||resolved!==undefined&&!UnitLevelStats.valid(field,resolved)))throw Error('Enter a supported level stat value.');
        const settings=this._data('overrides'),original=settings.unitLevels;
        if(original!==undefined&&(!original||typeof original!=='object'||Array.isArray(original)))throw Error('The unit level table has an invalid format.');
        const table=clone(original||{}),key=UnitLevelStats.key(row.unitID,level),existing=table[key];
        if(existing!==undefined&&(!existing||typeof existing!=='object'||Array.isArray(existing)))throw Error('The unit level stats have an invalid format.');
        const next=Object.assign({},existing),base=get(this._data('A'),row.path),previous=usePrevious?this._previousUnitLevel(row,level):0,source=previous?UnitLevelStats.resolve(base,settings,previous):base;
        for(const name of field===null?UnitLevelStats.FIELDS:[field]){
          const inherited=name==='SightRange'&&base[name]===undefined?AllyAwareness.defaultSightRange:base[name],nextValue=usePrevious?source[name]:resolved;
          if(nextValue===undefined||!usePrevious&&field===null||nextValue===inherited)delete next[name];else next[name]=nextValue;
        }
        if(Object.keys(next).length)table[key]=next;else delete table[key];
        if(JSON.stringify(original||{})===JSON.stringify(table))return [];
        return [Object.keys(table).length?{doc:'overrides',path:['unitLevels'],value:table}:{doc:'overrides',path:['unitLevels'],remove:true}];
      },{skipEmpty:usePrevious||field==='SightRange'});
    },
    _installUnitKeys(){
      this.$root.tabIndex=-1;this.$undo.title='Undo (Ctrl+Z)';this.$redo.title='Redo (Ctrl+Shift+Z)';this.$save.title='Save changes (Ctrl+S)';
      this.$undo.setAttribute('aria-keyshortcuts','Control+z');this.$redo.setAttribute('aria-keyshortcuts','Control+Shift+z');this.$save.setAttribute('aria-keyshortcuts','Control+s');
      this._unitKeyHandler=event=>this._unitKeys(event);this.$root.addEventListener('keydown',this._unitKeyHandler,true);
      this._unitPointerHandler=event=>{const target=event.target;if(target&&target.closest&&target.closest('input,textarea,select,button,a,summary,[contenteditable="true"]'))return;if(this.$root.focus)this.$root.focus({preventScroll:true});};this.$root.addEventListener('pointerdown',this._unitPointerHandler);
    },
    _unitKeys(event){
      if(this._profilePopup)return;
      if(this._closed||event.defaultPrevented||event.isComposing||event.altKey)return;
      const key=String(event.key||'').toLowerCase(),target=event.target,tag=String(target&&target.tagName||'').toLowerCase(),input=!!target&&(target.isContentEditable||['input','textarea','select'].includes(tag)),text=!!target&&(target.isContentEditable||tag==='textarea'||tag==='input'&&!['number','range','color','checkbox','radio','button'].includes(target.type)),command=event.ctrlKey||event.metaKey,modal=this.$modal&&!this.$modal.hidden;
      if(command&&(key==='z'||key==='s'&&!event.shiftKey)){
        event.stopPropagation();if(key==='z'&&text)return;event.preventDefault();if(event.repeat||modal)return;
        if(input&&target&&typeof target.blur==='function')target.blur();if(this.$root.focus)this.$root.focus({preventScroll:true});this._action(key==='s'?'save':event.shiftKey?'redo':'undo');return;
      }
      if(modal||input)return;
      if(event.shiftKey&&!command&&/^(Digit|Numpad)[1-9]$/.test(event.code||'')){
        const row=this._rows().find(row=>row.key===this._selected),level=Number(event.code.slice(-1));if(!row||!UnitRecords.levels(this._data('A'),row.unitType,row.unitID).includes(level))return;
        event.stopPropagation();event.preventDefault();if(!event.repeat)this._selectUnitLevel(row,level);return;
      }
      if(!command&&!event.shiftKey&&(event.code==='Space'||key===' ')&&tag!=='button'&&!(target&&target.closest&&target.closest('button'))){event.stopPropagation();event.preventDefault();if(!event.repeat&&this._previewClient&&this._previewClient.togglePlayback)this._previewClient.togglePlayback();}
    },
    _unitGuide(row){
      const guide=row.record.Guide,fields=this._section('Unit guide');
      this._note('Description and lore shown in the unit guide. Localized entries follow the Language selector. Combat role and statistics are read from this unit’s current settings.',false,fields).style.gridColumn='1 / -1';
      if(guide!==undefined&&(!guide||typeof guide!=='object'||Array.isArray(guide))){this._note('The existing Guide value is not an object. It is preserved; correct its source format before editing guide text.',true,fields).style.gridColumn='1 / -1';return;}
      for(const [key,label]of [['description','Guide description'],['lore','Lore']]){
        const value=guide&&guide[key]!==undefined?guide[key]:'';
        if(typeof value!=='string'){this._field(fields,label,display(value),()=>{},{readOnly:true,wide:true,multiline:true});continue;}
        if(Schema.token(value)){this._localized(fields,'A',row.path.concat('Guide',key),value,label,{multiline:true});continue;}
        this._field(fields,label,value,next=>this._change(()=>{
          const current=get(this._data('A'),row.path.concat('Guide'));
          if(current!==undefined&&(!current||typeof current!=='object'||Array.isArray(current)))throw Error('The guide format changed in another draft. Refresh before editing.');
          return [{doc:'A',path:row.path.concat('Guide'),value:Object.assign({},current,{[key]:next})}];
        }).catch(()=>{}),{wide:true,multiline:true});
      }
    },
    _newUnitType(){const types=clone(this._data('overrides').unitTypes||{});let id='new-type',index=2;while(own(types,id))id='new-type-'+index++;types[id]={name:'New type',icon:'',tint:'#ffffff'};this._selected=id;return this._set('overrides',['unitTypes'],types);},
    _heroAttackRateField(container,style){
      if(!HeroWeapons.find(style))return;
      const config=this._data('A'),settings=config.HeroEquipment,rates=settings&&settings.baseAttackRates,malformed=rates!==undefined&&(!rates||typeof rates!=='object'||Array.isArray(rates));
      this._field(container,'Base attack speed (attacks/sec)',HeroEquipmentStats.baseAttackRate(config,style),value=>this._setHeroAttackRate(style,value),{numeric:true,min:Number.MIN_VALUE,commitUnchanged:true,readOnly:malformed||!HeroEquipmentStats.enabled(config),help:'Hero only. Cloak upgrades, perks and other attack speed bonuses still apply. This sets combat attacks per second, not Spine animation playback.'});
      if(malformed)container.appendChild(node('p','The hero base attack speed settings have an invalid format. Refresh or correct that configuration before editing.','gt-note'));
      else if(!HeroEquipmentStats.enabled(config))container.appendChild(node('p','This legacy configuration uses its existing equipment attack speed. Hero fighting-style defaults require the current hero equipment system.','gt-note'));
      else if(own(rates,style))container.appendChild(button('Reset base attack speed',()=>this._setHeroAttackRate(style,undefined),'gt-mini'));
    },
    _setHeroAttackRate(style,value){
      return this._change(()=>{
        const config=this._data('A'),settings=config.HeroEquipment;
        if(!HeroWeapons.find(style)||!HeroEquipmentStats.enabled(config))throw Error('Choose an implemented hero fighting style with current hero equipment.');
        const rates=settings.baseAttackRates,path=['HeroEquipment','baseAttackRates'];
        if(rates!==undefined&&(!rates||typeof rates!=='object'||Array.isArray(rates)))throw Error('The hero base attack speed settings have an invalid format. Refresh before editing.');
        if(value===undefined)return own(rates,style)?[{doc:'A',path:path.concat(style),remove:true}]:[];
        if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('Base attack speed must be a finite number greater than zero.');
        if(HeroEquipmentStats.baseAttackRate(config,style)===value)return [];
        return [{doc:'A',path:rates===undefined?path:path.concat(style),value:rates===undefined?{[style]:value}:value}];
      },{skipEmpty:true}).catch(()=>{});
    },
    _setUnitTypeDamageTaken(id,field,value){
      return this._change(()=>{
        const type=(this._data('overrides').unitTypes||{})[id],p=['unitTypes',id,'damageTaken'];
        if(!type)throw Error('Choose an existing fighting type.');
        if(!['mode','percent'].includes(field))throw Error('Choose damage taken direction or percentage.');
        const saved=type.damageTaken;
        if(saved!==undefined&&!FightingTypeDamage.valid(saved))throw Error('The damage taken setting has an invalid format. Refresh or correct it before editing.');
        const current=saved||{mode:'more',percent:0},next=Object.assign({},current,{[field]:value});
        // Selecting Less from a small increase starts at its neutral divisor.
        if(field==='mode'&&value==='less'&&next.percent<100)next.percent=100;
        if(!FightingTypeDamage.valid(next))throw Error('Enter a finite percentage: at least 0 for More, or at least 100 for Less.');
        if(current[field]===value)return [];
        return [{doc:'overrides',path:p,value:next}];
      },{skipEmpty:true}).catch(()=>{});
    },
    _unitType(row){
      EnemyBalance.render(this,node);
      const fields=this._section('Type & pictogram'),p=['unitTypes',row.key],types=this._data('overrides').unitTypes||{};
      this._field(fields,'Name',row.record.name,value=>this._set('overrides',p.concat('name'),value));
      this._field(fields,'Pictogram',row.record.icon,value=>this._set('overrides',p.concat('icon'),value),{asset:'images',bundle:'KinghtFallEnemy',wide:true,help:'Choose an imported monster part, an existing battle icon, or another Resources image.'});
      this._field(fields,'Pictogram tint',row.record.tint||'#ffffff',value=>this._set('overrides',p.concat('tint'),value),{color:true});
      const counterType=FightingTypeDamage.counterType(types,row.key);
      if(counterType!==undefined)this._field(fields,'Countered fighting type',types[counterType].name,null,{readOnly:true,help:'All units of this type deal bonus damage against this matchup.'});
      const defense=this._section('Global damage taken'),saved=row.record.damageTaken,invalid=saved!==undefined&&!FightingTypeDamage.valid(saved),damage=FightingTypeDamage.valid(saved)?saved:{mode:'more',percent:0};
      this._field(defense,'Damage taken',damage.mode,value=>this._setUnitTypeDamageTaken(row.key,'mode',value),{options:[{value:'more',label:'More'},{value:'less',label:'Less'}],readOnly:invalid,commitUnchanged:true,help:'More adds the entered percentage. Less divides damage by the entered percentage of standard.'});
      this._field(defense,'Amount (%)',damage.percent,value=>this._setUnitTypeDamageTaken(row.key,'percent',value),{numeric:true,min:0,readOnly:invalid,commitUnchanged:true,help:'More: 10 = 10% more, 100 = double, 400 = 5× damage. Less: 100 = standard, 200 = half, 300 = one-third, 400 = one-quarter damage (minimum 100).'});
      this._note(invalid?'The saved damage taken setting is invalid. Correct it before editing.':'Result: '+Number(FightingTypeDamage.multiplier(damage).toPrecision(6))+'× incoming damage ('+Number((100*FightingTypeDamage.multiplier(damage)).toPrecision(6))+'% of standard).',invalid,defense);
      this._note('Global damage taken applies to heroes, allies and enemies of this fighting type, from every attack. Counter bonuses, damage reduction and shields still apply. The balance table above changes enemy base stats only.');
      if(HeroWeapons.find(row.key)){const defaults=this._section('Hero fighting-style defaults');this._heroAttackRateField(defaults,row.key);HeroDamage.startingField(this,defaults,row.key);}
      const assigned=Object.entries(this._data('overrides').unitTypeAssignments||{}).filter(([key,value])=>value===row.key);this._note(assigned.length?'Assigned to: '+assigned.map(([key])=>key).join(', '):'No units use this type yet.');
      const countered=Object.values(types).some(type=>type.counterType===row.key);
      const remove=button('Delete type',()=>{if(assigned.length||countered||['SoldierCfg','AllyCfg'].some(table=>Object.values(this._data('A')[table]||{}).some(unit=>unit.CounterType===row.key)))return this._status('Remove unit assignments and counter references before deleting this type.',true);const next=clone(types);delete next[row.key];return this._set('overrides',['unitTypes'],next);},'gt-danger');remove.disabled=assigned.length>0||countered;fields.appendChild(remove);
    },
    _setting(row){
      if(row.override){
        const parameters=this._data('overrides').parameters||{},has=own(parameters,'buildStandTime');
        this._note('Current fallback: 1.5 seconds. An override is created only by changing this field and saving.');
        const section=this._section('Construction');this._field(section,'Standing time (seconds)',has?parameters.buildStandTime:1.5,v=>this._set('overrides',['parameters','buildStandTime'],v),{min:0.001,help:'Shared across buildings. Testing-mode instant-build remains a separate testing control.'});
        if(has)section.appendChild(button('Reset to game default',()=>this._change([{doc:'overrides',path:['parameters','buildStandTime'],remove:true}]).catch(()=>{})));return;
      }
      const r=row.record,p=row.path;this._note('This setting is global. Saving it affects every stage.');
      const section=this._section(Schema.human(r.enumKey));
      if(/[;,]/.test(r.Value)){
        const groups=r.Value.split(';').map(x=>x.split(','));
        groups.forEach((group,i)=>{const line=node('div',undefined,'gt-array-row');section.appendChild(line);group.forEach((v,j)=>{
          let label='Value '+(j+1);if(r.enumKey==='ButtonUnlock')label=['Unlock stage','Unlock wave'][j];if(r.enumKey==='AddDesktop')label=['Reward item ID','Amount'][j];if(r.enumKey==='StaminaSupply')label=['Ordinary reward','Ad reward'][j];
          this._field(line,(groups.length>1?'Entry '+(i+1)+' · ':'')+label,v,next=>{const values=clone(groups);values[i][j]=next;this._set('A',p.concat('Value'),values.map(x=>x.join(',')).join(';'));},{numeric:true});
        });});
      }else this._field(section,Schema.human(r.enumKey),r.Value,v=>this._set('A',p.concat('Value'),v),{numeric:true,min:r.enumKey==='RefreshInterval'?0.000001:0});
      this._field(section,'Setting ID',r.enumValue,()=>{},{readOnly:true});
    },
    _renderPreview(row){
      if(kind==='buildings'){try{Buildings.preview(this,row,{ipc});}catch(error){this._status('Preview: '+error.message,true);}return;}
      const hasModel=kind==='units'||kind==='buildings'||kind==='equipment';
      if(hasModel){
        if(!this._previewClient){clear(this.$preview);try{this._previewClient=require('../preview/client').mount(this.$preview,{ipc,onChange:edits=>this._previewChange(edits),onAttackMetrics:value=>this._attackRateMetrics(value)});}catch(error){this.$preview.appendChild(node('div','Animation preview is loading. '+error.message,'gt-note'));}}
        if(this._previewClient){const input={documents:this._snapshot.documents,version:this._snapshot.version};try{
          if(kind==='units'){const level=row.unitType==='ally'?this._selectedUnitLevel(row):undefined;this._previewClient.setUnit(Object.assign(input,{type:row.unitType,id:row.unitID||'hero',level,record:level?UnitLevelStats.resolve(row.record,this._data('overrides'),level):row.record}));}
          else if(kind==='buildings')this._previewClient.setBuilding(Object.assign(input,{id:row.key,record:row.record,levelIndex:this._level}));
          else this._previewClient.setUnit(Object.assign(input,{type:'hero',id:'hero',record:{},heroStyle:row.heroStyle||'skirmisher',heroLevels:{[row.record.id]:row.record.levelInfo[this._level].Level}}));
        }catch(error){this._status('Preview: '+error.message,true);}}return;
      }
      if(this._previewClient){this._previewClient.destroy();this._previewClient=null;}clear(this.$preview);
      if(kind==='unit-types'){
        this.$preview.appendChild(node('h3','Map pictogram preview'));const asset=this._image(row.record.icon);
        if(asset){const img=node('img');img.src=asset.url;img.className='gt-large-icon';img.style.objectFit='contain';this.$preview.appendChild(img);if(row.record.tint&&row.record.tint!=='#ffffff'){const canvas=node('canvas');canvas.width=canvas.height=256;canvas.className='gt-large-icon';this.$preview.appendChild(canvas);img.onload=()=>{if(!canvas.parentNode)return;const ctx=canvas.getContext('2d'),scale=Math.min(256/img.naturalWidth,256/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale,x=(256-w)/2,y=(256-h)/2;ctx.drawImage(img,x,y,w,h);ctx.globalCompositeOperation='multiply';ctx.fillStyle=row.record.tint;ctx.fillRect(0,0,256,256);ctx.globalCompositeOperation='destination-in';ctx.drawImage(img,x,y,w,h);img.hidden=true;};}}
        this.$preview.appendChild(node('h2',row.record.name));this._note('Aspect ratio is preserved in battle. Tint is applied to the icon.',false,this.$preview);
      }else if(kind==='perks'){
        const perk=row.record;this.$preview.appendChild(node('h3','Perk card preview'));const asset=this._image(perk.Image);if(asset){const img=node('img');img.src=asset.url;img.className='gt-large-icon';this.$preview.appendChild(img);}
        this.$preview.appendChild(node('h2',this._text(perk.Name)));this.$preview.appendChild(node('span',Schema.RARITIES[perk.Quality-1],'gt-chip '+Schema.RARITIES[perk.Quality-1].toLowerCase()));
        this.$preview.appendChild(node('p',stripRich(Schema.formatEffect(perk,this._data('catalog'),this._language)),'gt-description'));this._note('Preview uses the current draft values and selected language.',false,this.$preview);
      }else if(kind==='stages'){
        this.$preview.appendChild(node('h3','Stage overview'));const asset=this._image(row.record.Map);if(asset){const img=node('img');img.src=asset.url;img.className='gt-large-icon';this.$preview.appendChild(img);}
        this._note('Playable map: '+row.record.prefab,false,this.$preview);this.$preview.appendChild(button('Open Maps panel',()=>openPanel('maps').catch(e=>this._status(e.message,true))));
        this.$preview.appendChild(node('p','Spawn lanes are authored in the map. Each lane emits its ordered groups in parallel with other lanes. Wait groups delay only their own lane.','gt-subtitle'));
      }else if(kind==='relics'){
        const asset=this._image(row.icon);if(asset){const img=node('img');img.src=asset.url;img.className='gt-large-icon';this.$preview.appendChild(img);}const selected=row.record.levelInfo[this._level]||{};this.$preview.appendChild(node('h3','Level '+selected.Level));this.$preview.appendChild(node('p',stripRich(Schema.formatEffect(Object.assign({},selected,{Describe:row.record.Describe}),this._data('catalog'),this._language,'param','vaulePercentage')),'gt-description'));
      }else if(kind==='talents'){
        const asset=this._image(row.record.Image);if(asset){const img=node('img');img.src=asset.url;img.className='gt-large-icon';this.$preview.appendChild(img);}
        const records=(this._data('A').TalentLevelCfg||[]).filter(x=>x.kindID===Number(row.key)),selected=records[Math.min(this._talentLevel,records.length-1)];
        const view=Object.assign({},selected||{},{Describe:row.record.Describe});
        this.$preview.appendChild(node('h3',selected?'Progression level '+selected.Level:'Talent description'));
        this.$preview.appendChild(node('p',stripRich(Schema.formatEffect(view,this._data('catalog'),this._language,'EffectNumber','vaulePercentage')),'gt-description'));
        const perk=(this._data('A').BuffCfg||[]).find(x=>x.Unlock===Number(row.key));
        if(perk){this._note('Linked perk · '+this._text(perk.Name),false,this.$preview);this.$preview.appendChild(node('p',stripRich(Schema.formatEffect(perk,this._data('catalog'),this._language)),'gt-description'));}
      }
    },
    _renderMaps(){
      this.$sidebar.hidden=true;this.$preview.hidden=true;this.$detail.className='gt-full-map';
      if(!this._mapsClient){clear(this.$detail);try{this._mapsClient=require('../maps/client').mount(this.$detail,{ipc,onChange:edits=>this._change(edits),onSnapshot:snapshot=>this._apply(snapshot)});}catch(error){this._note('Map tools are loading. '+error.message,true);}}
      if(this._mapsClient&&this._mapsClient.update)this._mapsClient.update(this._snapshot);
    },
    _modal(title){if(this._iconPicker){this._iconPicker.destroy();this._iconPicker=null;}this.$modalTitle.textContent=title;clear(this.$modalBody);clear(this.$modalActions);this.$modal.hidden=false;return this.$modalBody;},
    _confirm(title,text,action,label){const body=this._modal(title);body.appendChild(node('p',text));this.$modalActions.appendChild(button('Cancel',()=>this.$modal.hidden=true));this.$modalActions.appendChild(button(label||'Continue',()=>{this.$modal.hidden=true;action();},'gt-danger'));},
    _recover(recovery){
      const snapshot=this._snapshot,body=this._modal('Recover interrupted save');body.appendChild(node('p','This explicit recovery restores these files to their verified contents before the interrupted save. Opening a panel never performs recovery automatically.'));
      const files=node('ul');(recovery.files||[]).forEach(file=>files.appendChild(node('li',file)));body.appendChild(files);this.$modalActions.appendChild(button('Cancel',()=>this.$modal.hidden=true));
      const recover=button('Restore pre-save files',async()=>{recover.disabled=true;try{const next=await ipc('recover',{version:snapshot.version,id:recovery.id});this.$modal.hidden=true;this._apply(next);}catch(error){recover.disabled=false;body.appendChild(node('p',error.message,'gt-diff-before'));}},'gt-danger');this.$modalActions.appendChild(recover);
    },
    async _review(wantSave){
      try{await this._queue;}catch(error){this._status(error.message,true);return;}
      const snapshot=this._snapshot,changes=snapshot.changes||[],body=this._modal(wantSave?'Save these changes to the game?':'Draft changes');
      body.appendChild(node('p',changes.length+' change(s) across the shared panel draft. Existing previews may require reloading after a save.'));
      const table=node('table',undefined,'gt-grid-table'),head=node('tr');['Location','Before','After'].forEach(label=>head.appendChild(node('th',label)));table.appendChild(head);
      changes.forEach(change=>{const tr=node('tr');tr.appendChild(node('td',change.doc+' / '+(change.path||[]).map(Schema.human).join(' / ')));tr.appendChild(node('td',display(change.before),'gt-diff-before'));tr.appendChild(node('td',display(change.after),'gt-diff-after'));table.appendChild(tr);});body.appendChild(table);
      (snapshot.issues||[]).forEach(issue=>body.appendChild(node('p',issue.severity.toUpperCase()+': '+issue.message,issue.severity==='error'?'gt-diff-before':'gt-subtitle')));
      this.$modalActions.appendChild(button('Keep editing',()=>this.$modal.hidden=true));
      if(changes.length){const save=button('Save '+changes.length+' change(s)',async()=>{save.disabled=true;try{const next=await ipc('save',{version:snapshot.version});this.$modal.hidden=true;this._apply(next);}catch(error){save.disabled=false;body.appendChild(node('p',error.message,'gt-diff-before'));}},'gt-primary');save.disabled=(snapshot.issues||[]).some(i=>i.severity==='error')||(snapshot.recoveries||[]).length>0;this.$modalActions.appendChild(save);}
    }
  });
}
module.exports={create,display,stripRich};
