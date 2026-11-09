'use strict';
const UnitRecords=require('../lib/unit-records');
const MapCatalog=require('../lib/map-catalog');
const fs=require('fs'),path=require('path');
const Schema=require('../lib/schema');
const Buildings=require('../buildings/client');
const IconPicker=require('./icon-picker');
const TITLES={stages:'Stages & Waves',perks:'Battle Perks',buildings:'Buildings',equipment:'Equipment',relics:'Relics',talents:'Talents',units:'Units & Attack Timing','unit-types':'Unit Types & Pictograms',maps:'Maps',settings:'Battle Settings',testing:'Testing · Managed Test Player'};
const clone=Schema.clone;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function ipc(message,payload){return new Promise((resolve,reject)=>{
  const args=['game-data-editor:'+message];if(payload!==undefined)args.push(payload);args.push((error,value)=>error?reject(new Error(String(error))):resolve(value));
  Editor.Ipc.sendToMain.apply(Editor.Ipc,args);
});}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(label,action,cls){const n=node('button',label,cls);n.type='button';n.onclick=action;return n;}
function openPanel(kind){return Promise.resolve().then(()=>{if(!own(TITLES,kind))throw Error('Unknown tool panel');if(Editor.Panel&&typeof Editor.Panel.open==='function')return Editor.Panel.open('hkd-'+kind);return ipc('open-panel',kind);});}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
function stripRich(text){return String(text||'').replace(/<[^>]*>/g,'');}
function get(obj,keys){return keys.reduce((v,key)=>v==null?undefined:v[key],obj);}
function display(value){if(value===undefined)return '(not set)';if(value===null)return 'None';if(Array.isArray(value))return value.length>8?'['+value.length+' values]':value.map(display).join(', ');if(value&&typeof value==='object')return Object.keys(value).slice(0,6).map(k=>Schema.human(k)+': '+display(value[k])).join(' · ');return String(value);}

function create(kind){
  return Editor.Panel.extend({
    template:fs.readFileSync(path.join(__dirname,'panel.html'),'utf8'),style:fs.readFileSync(path.join(__dirname,'panel.css'),'utf8')+(kind==='buildings'?Buildings.style:''),
    $:{root:'#root',title:'#title',toolbar:'#toolbar',variant:'#variant',language:'#language',status:'#status',workspace:'#workspace',sidebar:'#sidebar',unitPack:'#unitPack',search:'#search',count:'#count',list:'#list',detail:'#detail',preview:'#preview',undo:'#undo',redo:'#redo',reload:'#reload',discard:'#discard',review:'#review',save:'#save',issues:'#issues',footer:'#footer',modal:'#modal',modalTitle:'#modalTitle',modalBody:'#modalBody',modalActions:'#modalActions'},
    ready(){
      this._kind=kind;this._selected=null;this._wave=0;this._level=0;this._talentLevel=0;this._unitPack='all';this._variant='A';this._language='en';this._queue=Promise.resolve();this._assets={images:[],prefabs:[],animations:[]};this._closed=false;
      this.$title.textContent=TITLES[kind]||kind;
      if(kind==='maps'||kind==='stages'){
        this.$toolbar.style.display='none';this.$sidebar.style.display='none';this.$preview.style.display='none';this.$issues.hidden=true;this.$root.querySelector('.gt-header').style.display='none';this.$status.style.display='none';this.$footer.style.display='none';
        this.$detail.className='gt-world-host';this.$detail.style.cssText='flex:1;min-width:0;padding:0;overflow:hidden;display:flex';
        this._worldClient=require('../worlds/client').mount(this.$detail,{ipc,kind});return;
      }
      if(kind==='unit-types')this.$toolbar.appendChild(button('New type',()=>this._newUnitType(),'gt-primary'));
      if(kind==='testing'){
        this.$toolbar.style.display='none';this.$sidebar.style.display='none';this.$preview.style.display='none';this.$issues.hidden=true;
        this.$detail.className='gt-testing-host';this.$detail.style.flex='1';this.$detail.style.minWidth='0';this.$detail.style.overflow='auto';
        this._status('Testing actions change the managed test player immediately. Game configuration Save is separate.');
        this.$footer.textContent='Managed test player only · persistent isolated profile · previews are muted before launch.';
        this._testingClient=require('../testing/client').mount(this.$detail,{ipc});return;
      }
      this.$variant.disabled=kind!=='stages';this.$variant.title=kind==='stages'?'B and D replace the entire stage table; other settings are shared from A.':'Shared settings come from A for every variant.';
      this.$variant.onchange=()=>{this._variant=this.$variant.value;this._selected=null;this._wave=0;this._render();};
      this.$language.onchange=()=>{this._language=this.$language.value;this._render();};
      this.$search.oninput=()=>this._renderList();
      this.$unitPack.hidden=kind!=='units';this.$unitPack.onchange=()=>{this._unitPack=this.$unitPack.value;this._selected=null;this._render();};
      this.$undo.onclick=()=>this._action('undo');this.$redo.onclick=()=>this._action('redo');
      this.$reload.onclick=()=>this._load(true);this.$review.onclick=()=>this._review(false);this.$save.onclick=()=>this._review(true);
      this.$discard.onclick=()=>this._confirm('Discard all panel drafts?','This discards unsaved edits shared by every game-tools panel. Saved game files remain unchanged.',()=>this._action('discard'),'Discard drafts');
      this._load();
      ipc('asset-index',{refresh:true}).then(assets=>{if(this._closed)return;this._assets=assets||this._assets;if(this._iconPicker)this._iconPicker.setImages(this._assets.images||[]);this._render();}).catch(()=>{});
    },
    close(){this._closed=true;if(this._iconPicker)this._iconPicker.destroy();if(this._worldClient)this._worldClient.destroy();if(this._previewClient)this._previewClient.destroy();if(this._mapsClient)this._mapsClient.destroy();if(this._testingClient)this._testingClient.destroy();if(this._refreshTimer)clearTimeout(this._refreshTimer);},
    messages:{'hkd-characters:published'(){if(!this._closed&&this._previewClient)this._previewClient.refreshAppearance();},'game-data-editor:world-changed'(){if(this._worldClient)this._worldClient.changed();},'game-data-editor:world-focus-map'(event,id){if(this._worldClient&&kind==='maps')this._worldClient.focusMap(id);},'game-data-editor:changed'(){if(this._closed||kind==='testing'||this._worldClient)return;if(this._refreshTimer)clearTimeout(this._refreshTimer);this._refreshTimer=setTimeout(()=>this._load(false),80);}},
    _status(message,error){this.$status.textContent=message;this.$status.className='gt-status'+(error?' error':'');},
    async _load(explicit){try{const snapshot=await ipc(explicit?'refresh':'load');if(this._closed)return;if(explicit){const assets=await ipc('asset-index',{refresh:true});if(this._closed)return;this._assets=assets||this._assets;if(this._iconPicker)this._iconPicker.setImages(this._assets.images||[]);}if(!this._snapshot||snapshot.version!==this._snapshot.version||explicit)this._apply(snapshot);else this._toolbar();}catch(error){this._status(error.message,true);}},
    _apply(snapshot){if(!snapshot||this._closed)return;if(snapshot.result)this._lastResult=snapshot.result;else if(this._snapshot&&snapshot.version!==this._snapshot.version)this._lastResult=null;this._snapshot=snapshot;this._render();},
    _action(action){this._queue=this._queue.catch(()=>{}).then(async()=>{try{const snap=await ipc(action,{version:this._snapshot.version});this._apply(snap);return snap;}catch(error){this._status(error.message,true);throw error;}});return this._queue.catch(()=>null);},
    _change(edits){
      this._queue=this._queue.catch(()=>{}).then(async()=>{
        try{const snapshot=await ipc('change',{version:this._snapshot.version,edits:typeof edits==='function'?edits():edits});this._apply(snapshot);return snapshot;}
        catch(error){this._status(error.message,true);throw error;}
      });return this._queue;
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
      this.$footer.textContent=kind==='stages'?'Editing variant '+this._variant+'. B/D replace complete stage tables; common stats and settings remain shared from A.':'Edits stay in a shared draft. All previews are silent. Save changes explicitly to update the game.';
    },
    _render(){
      if(!this._snapshot)return;this._toolbar();
      if(kind==='maps'){this._renderMaps();return;}
      this._renderList();const scroll=this.$detail.scrollTop;clear(this.$detail);
      const row=this._rows().find(r=>r.key===this._selected);
      if(!row){this.$detail.appendChild(node('div','Choose an item to inspect its settings.','gt-empty'));return;}
      this.$detail.appendChild(node('h2',row.label));this.$detail.appendChild(node('p',row.subtitle||'Changes are drafts until saved.','gt-subtitle'));
      if(kind==='stages')this._stage(row);else if(kind==='perks')this._perk(row);else if(kind==='buildings')this._building(row);else if(kind==='equipment')this._equipment(row);else if(kind==='talents')this._talent(row);else if(kind==='relics')this._relic(row);else if(kind==='units')this._unit(row);else if(kind==='unit-types')this._unitType(row);else if(kind==='settings')this._setting(row);
      this.$detail.scrollTop=scroll;this._renderPreview(row);
    },
    _rows(){
      const data=this._data('A'),rows=[];
      const add=(key,label,subtitle,record,keys,extra)=>rows.push(Object.assign({key:String(key),label,subtitle,record,path:keys,doc:'A'},extra||{}));
      if(kind==='stages')(this._data(this._variant).LevelCfg||[]).forEach((r,i)=>{const name=this._text(r.Name),label=/^\s*\d+[.)]\s*/.test(name)?name:r.Level+'. '+name;add(i,label,r.prefab+' · '+r.WaveCfg.length+' waves',r,['LevelCfg',i],{doc:this._variant,icon:r.Map});});
      if(kind==='perks')(data.BuffCfg||[]).forEach((r,i)=>add(r.ID,this._text(r.Name),r.ID+' · '+Schema.RARITIES[r.Quality-1],r,['BuffCfg',i],{icon:r.Image}));
      if(kind==='buildings')rows.push(...Buildings.rows(this));
      if(kind==='equipment')(data.EquipCfg||[]).forEach((r,i)=>add(r.id,Schema.EQUIPMENT[i],r.levelInfo.length+' levels',r,['EquipCfg',i],{icon:r.levelInfo[0].Image}));
      if(kind==='relics')(data.TreasureCfg||[]).forEach((r,i)=>{const good=(data.GoodsCfg||{})[r.goodID]||{};add(r.ID,this._text(good.name)||String(r.ID),r.ID+' · '+Schema.RARITIES[r.Quality-1]+' · '+r.levelInfo.length+' levels',r,['TreasureCfg',i],{icon:good.icon});});
      if(kind==='talents')Object.keys(data.TalentCfg||{}).forEach(id=>{const r=data.TalentCfg[id],count=(data.TalentLevelCfg||[]).filter(l=>l.kindID===Number(id)).length;add(id,this._text(r.Name),id+' · '+count+' progression records',r,['TalentCfg',id],{icon:r.Image});});
      if(kind==='units'){
        add('hero','Hero','Base stats are linked to Equipment',{},[],{unitType:'hero'});
        Object.keys(data.SoldierCfg||{}).forEach(id=>{const r=data.SoldierCfg[id],pack=r.MonsterPack==='monster1'?'Monster Pack 1':r.MonsterPack==='monster2'?'Monster Pack 2':r.CampaignBaseUnit?'Campaign profile':r.prefab?'Enemy':'Boss form',role=this._unitRole('enemy',id);add('enemy:'+id,this._text(r.Name),pack+(role?' · '+role:'')+' · '+id,r,['SoldierCfg',id],{icon:r.loadIcon,unitType:'enemy',unitID:id});});
        Object.keys(data.SoldierCfg||{}).filter(id=>Number(id)>=90001&&Number(id)<=90004).forEach(id=>{const r=(data.AllyCfg||data.SoldierCfg)[id];add('ally:'+id,this._text(r.Name)+' · Ally','Allied unit - independent stats',r,[data.AllyCfg?'AllyCfg':'SoldierCfg',id],{icon:r.loadIcon,unitType:'ally',unitID:id});});
      }
      if(kind==='unit-types')Object.keys(this._data('overrides').unitTypes||{}).forEach(id=>{const type=this._data('overrides').unitTypes[id],assigned=Object.values(this._data('overrides').unitTypeAssignments||{}).filter(value=>value===id).length;add(id,type.name,id+' - '+assigned+' unit assignment(s)',type,['unitTypes',id],{doc:'overrides',icon:type.icon});});
      if(kind==='settings'){
        Object.keys(data.ParameterCfg||{}).forEach(id=>{const r=data.ParameterCfg[id];add(id,Schema.human(r.enumKey),'Shared across every stage and variant',r,['ParameterCfg',id]);});
        add('buildStandTime','Build standing time','Optional override · current default 1.5 seconds',{},[],{override:true});
      }
      return rows;
    },
    _renderList(){
      const all=this._rows(),pack=this._unitPack||'all',scoped=kind!=='units'||pack==='all'?all:all.filter(r=>pack==='allies'?r.unitType!=='enemy':r.unitType==='enemy'&&(pack==='campaign'?!r.record.MonsterPack:r.record.MonsterPack===pack)),query=this.$search.value.trim().toLowerCase(),rows=scoped.filter(r=>(r.label+' '+r.subtitle+' '+(r.record.MonsterSource||'')).toLowerCase().indexOf(query)>=0);
      if(!scoped.some(r=>r.key===this._selected))this._selected=rows.length?rows[0].key:null;
      clear(this.$list);this.$count.textContent=rows.length+' / '+all.length+' items';
      rows.forEach(row=>{const b=button('',()=>{this._selected=row.key;this._wave=0;this._level=0;this._talentLevel=0;this.$detail.scrollTop=0;this._render();},'gt-record'+(row.key===this._selected?' active':''));
        const asset=this._image(row.icon);if(asset){const image=node('img');image.src=asset.url;image.alt='';b.appendChild(image);}else b.appendChild(node('span',row.label.slice(0,2),'gt-initial'));
        const text=node('div');text.appendChild(node('strong',stripRich(row.label)));text.appendChild(node('small',row.subtitle));b.appendChild(text);this.$list.appendChild(b);
      });
    },
    _image(name){if(!name)return null;return (this._assets.images||[]).find(x=>x.reference===name||x.name===name)||null;},
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
        if(next!==value)onchange(next);
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
      let usages=0;['A','B','D'].forEach(id=>{const text=JSON.stringify(this._data(id));usages+=(text.split(value).length-1);});
      wrap.appendChild(node('div',usages>1?'Shared wording used by '+usages+' records. Saving this text updates every usage.':'Localized wording. Numbered placeholders must remain intact.','gt-shared'));
      container.appendChild(wrap);
    },
    _properties(parent,doc,keys,record,context,exclude){
      const container=node('div',undefined,'gt-fields');parent.appendChild(container);exclude=exclude||[];
      Object.keys(record||{}).forEach(key=>{if(exclude.indexOf(key)>=0)return;this._value(container,doc,keys.concat(key),record[key],key,context||{},record);});return container;
    },
    _value(container,doc,keys,value,key,context,record){
      const meta=Schema.descriptor(key,context);
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
    _unitOptions(forms,side){const data=this._data('A'),units=(side==='ally'&&data.AllyCfg)||data.SoldierCfg||{};return [{value:-1,label:'Wait (spawn ticks)'}].concat(Object.keys(units).filter(id=>forms||units[id].prefab).map(id=>{const role=this._unitRole(side,id),pack=units[id].MonsterPack==='monster1'?'Pack 1':units[id].MonsterPack==='monster2'?'Pack 2':units[id].CampaignBaseUnit?'Campaign profile '+units[id].CampaignBaseUnit:'';return {value:Number(id),label:this._text(units[id].Name)+(role?' · '+role:'')+(pack?' · '+pack:'')+' · '+id};}));},
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
      Buildings.render(this,row);
    },
    _equipment(row){
      const r=row.record,p=row.path;this._properties(this._section('Equipment category'),'A',p,r,{table:'EquipCfg',equipment:r.id},['levelInfo']);
      const levels=this._section('Level progression');levels.className='';
      this._level=Math.min(this._level,r.levelInfo.length-1);const select=this._field(levels,'Edit level',this._level,v=>{this._level=v;this._render();},{options:r.levelInfo.map((l,i)=>({value:i,label:'Level '+l.Level+' · '+l.Parameters+' · '+l.GoldCost+' gold'}))});
      select.title='Select a level to edit its stat, cost and appearance.';
      const table=node('table',undefined,'gt-grid-table'),head=node('tr');['Level','Stat','Gold cost','Appearance'].forEach(t=>head.appendChild(node('th',t)));table.appendChild(head);
      r.levelInfo.forEach((level,i)=>{const tr=node('tr',undefined,i===this._level?'selected':'');tr.setAttribute('data-click','true');tr.onclick=()=>{this._level=i;this._render();};[level.Level,level.Parameters,level.GoldCost,level.EquipSkin].forEach(v=>tr.appendChild(node('td',v)));table.appendChild(tr);});const scroll=node('div');scroll.style.maxHeight='220px';scroll.style.overflow='auto';scroll.appendChild(table);levels.appendChild(scroll);
      const level=r.levelInfo[this._level];this._note('Level '+level.Level+' · '+stripRich(this._text(r.Describe).replace(/\{0\}/g,String(level.Parameters))));this._properties(this._section('Level '+level.Level+' settings'),'A',p.concat('levelInfo',this._level),level,{table:'EquipCfg',equipment:r.id});
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
      if(row.unitType==='hero'){
        this._note('The hero combines equipment stats and layered animated equipment. Choose levels in the silent preview; those choices never change player progression.');
        const fields=this._section('Base stats from equipment');
        (this._data('A').EquipCfg||[]).forEach((equipment,i)=>{const r=equipment.levelInfo[0];this._field(fields,Schema.EQUIPMENT[i]+' · level 1',r.Parameters,value=>this._set('A',['EquipCfg',i,'levelInfo',0,'Parameters'],value),{min:0,help:'Shared source: Equipment. Open Equipment for every upgrade level.'});});
        fields.appendChild(button('Open Equipment panel',()=>openPanel('equipment').catch(e=>this._status(e.message,true))));return;
      }
      const id=Number(row.unitID);this._note(row.unitType==='ally'?'Allied unit: its name, model, stats, equipment and timing are independent of enemies.':'Enemy unit: its name, model, stats and timing are independent of allies.');
      if(row.record.MonsterSource)this._note('Imported source: '+row.record.MonsterSource+' · Behavior controller: '+row.record.BehaviorTemplate+'. Names, stats, roles, model transforms and attack timing are editable independently for this unit.');
      if(row.record.CampaignBaseUnit)this._note('Campaign profile: controller '+row.record.CampaignBaseUnit+' · Appearance source unit '+row.record.AppearanceSourceUnit+'. Its initial combat settings preserve the original campaign profile; editing this record changes this profile independently of the source-roster monster.');
      this._unitGuide(row);
      if(!row.record.prefab)this._note('This is a boss transformation form. It is reached through the boss’s behavior and is not a directly spawnable unit.');
      const typeKey=row.unitType+':'+row.unitID+':'+UnitRecords.form(row.unitType,id),types=this._data('overrides').unitTypes||{},assignments=this._data('overrides').unitTypeAssignments||{},typeFields=this._section('Unit type & map pictogram');
      this._field(typeFields,'Unit type',assignments[typeKey]||'',value=>{const next=Object.assign({},assignments);if(value)next[typeKey]=value;else delete next[typeKey];return this._set('overrides',['unitTypeAssignments'],next);},{options:[{value:'',label:'Original battle icon'},...Object.keys(types).map(key=>({value:key,label:types[key].name}))],help:'Combat role used for counter bonuses. The Battle icon below overrides the type pictogram for this unit.'});
      this._field(typeFields,'Countered unit type',row.record.CounterType===undefined?'__legacy':row.record.CounterType,value=>this._set('A',row.path.concat('CounterType'),value),{options:[...(row.record.CounterType===undefined?[{value:'__legacy',label:'Original matchup (legacy)'}]:[]),{value:'',label:'None'},...Object.keys(types).map(key=>({value:key,label:types[key].name}))],help:'Applies the configured damage multiplier to every opposing unit assigned to this type. Does not affect target priority.'});
      typeFields.appendChild(button('Manage types & pictograms',()=>openPanel('unit-types').catch(error=>this._status(error.message,true))));
      const visualFields=this._section('Model transform'),visuals=this._data('overrides').visuals||{},visual=visuals[typeKey]||{};
      const setVisual=(field,value)=>{const next=Object.assign({},this._data('overrides').visuals||{});next[typeKey]=Object.assign({},next[typeKey],{[field]:value});return this._set('overrides',['visuals'],next);};
      for(const [key,label,initial,min,max]of [['x','Offset X',0,-4096,4096],['y','Offset Y',0,-4096,4096],['scaleX','Scale X',1,.01,20],['scaleY','Scale Y',1,.01,20],['rotation','Rotation',0,-3600,3600]])this._field(visualFields,label,visual[key]===undefined?initial:visual[key],value=>setVisual(key,value),{min,max});
      this._field(visualFields,'Model tint',visual.tint||'#ffffff',value=>setVisual('tint',value),{color:true});
      visualFields.appendChild(button('Edit rider, horse & parts',()=>ipc('open-characters').catch(error=>this._status(error.message,true))));
      this._properties(this._section('Stats & behavior'),'A',row.path,row.record,{table:'SoldierCfg',id:row.unitID,side:row.unitType},['Suppressed','CounterType','MonsterSource','MonsterPack','BehaviorTemplate','CampaignBaseUnit','AppearanceSourceUnit','Guide']);
      this._note('Attack rate controls how often attacks begin. The preview timeline controls the release or effect moment inside a selected attack. Existing behavior stays unchanged until an override is saved.');
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
    _unitType(row){
      const fields=this._section('Type & pictogram'),p=['unitTypes',row.key];
      this._field(fields,'Name',row.record.name,value=>this._set('overrides',p.concat('name'),value));
      this._field(fields,'Pictogram',row.record.icon,value=>this._set('overrides',p.concat('icon'),value),{asset:'images',bundle:'KinghtFallEnemy',wide:true,help:'Choose an imported monster part, an existing battle icon, or another Resources image.'});
      this._field(fields,'Pictogram tint',row.record.tint||'#ffffff',value=>this._set('overrides',p.concat('tint'),value),{color:true});
      this._note('Select this type in Units. Types group units for counter bonuses and supply a fallback pictogram. Changing a role does not change attack behavior, stats, wave IDs, or player progress.');
      const assigned=Object.entries(this._data('overrides').unitTypeAssignments||{}).filter(([key,value])=>value===row.key);this._note(assigned.length?'Assigned to: '+assigned.map(([key])=>key).join(', '):'No units use this type yet.');
      const remove=button('Delete type',()=>{if(assigned.length||['SoldierCfg','AllyCfg'].some(table=>Object.values(this._data('A')[table]||{}).some(unit=>unit.CounterType===row.key)))return this._status('Remove unit assignments and counter references before deleting this type.',true);const types=clone(this._data('overrides').unitTypes);delete types[row.key];return this._set('overrides',['unitTypes'],types);},'gt-danger');remove.disabled=assigned.length>0;fields.appendChild(remove);
    },
    _setting(row){
      if(row.override){
        const parameters=this._data('overrides').parameters||{},has=own(parameters,'buildStandTime');
        this._note('Current fallback: 1.5 seconds. An override is created only by changing this field and saving.');
        const section=this._section('Construction');this._field(section,'Standing time (seconds)',has?parameters.buildStandTime:1.5,v=>this._set('overrides',['parameters','buildStandTime'],v),{min:0.001,help:'Shared across buildings. Testing-mode instant-build remains a separate testing control.'});
        if(has)section.appendChild(button('Reset to game default',()=>this._change([{doc:'overrides',path:['parameters','buildStandTime'],remove:true}]).catch(()=>{})));return;
      }
      const r=row.record,p=row.path;this._note('This setting is global. Saving it affects every stage and configuration variant.');
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
        if(!this._previewClient){clear(this.$preview);try{this._previewClient=require('../preview/client').mount(this.$preview,{ipc,onChange:edits=>this._change(edits)});}catch(error){this.$preview.appendChild(node('div','Animation preview is loading. '+error.message,'gt-note'));}}
        if(this._previewClient){const input={documents:this._snapshot.documents,version:this._snapshot.version};try{
          if(kind==='units')this._previewClient.setUnit(Object.assign(input,{type:row.unitType,id:row.unitID||'hero',record:row.record}));
          else if(kind==='buildings')this._previewClient.setBuilding(Object.assign(input,{id:row.key,record:row.record,levelIndex:this._level}));
          else this._previewClient.setUnit(Object.assign(input,{type:'hero',id:'hero',record:{},heroLevels:{[row.record.id]:this._level+1}}));
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
