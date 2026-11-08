'use strict';

const PACK_ORDER=['2D Minimal Icon Pack','Minimal Hero Equipment','GUI Pro Kit','Monster Portraits','Original Game Icons','Other Assets'];
const STATS_COLLECTION='Stats Icons';
const RELIC_COLLECTION='Relic Icons';
const GAME_FOLDERS={KinghtFallIconBuild:'Buildings',KinghtFallIconBuff:'Battle Perks',KinghtFallIconCharacter:'Characters',KinghtFallIconGood:'Goods',KinghtFallIconTalent:'Talents',KinghtFallIconMap:'Maps'};
const readable=name=>String(name).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function folders(asset){
  const parts=String(asset.path||'').replace(/\\/g,'/').split('/').filter(Boolean),directory=parts.slice(0,-1);
  if(parts[0]==='assets'&&parts[1]==='resources'&&[STATS_COLLECTION,RELIC_COLLECTION].includes(parts[2]))return [parts[2]].concat(directory.slice(3));
  if(parts[0]==='assets'&&parts[1]==='resources'&&parts[2]==='icons'){
    const pack=parts[3],rest=directory.slice(4);
    if(pack==='2d-minimal')return ['2D Minimal Icon Pack'].concat(rest);
    if(pack==='2d-minimal-hero-equipment')return ['Minimal Hero Equipment'].concat(rest);
    if(pack==='GUI-Pro')return ['GUI Pro Kit'].concat(rest);
    if(pack==='Pictograms')return ['GUI Pro Kit','Pictograms'].concat(rest);
    if(pack==='monster-roster')return ['Monster Portraits'].concat(rest.map(n=>n==='monster1'?'Monster Pack 1':n==='monster2'?'Monster Pack 2':n));
    if(pack==='enemy-heads')return ['Monster Portraits','Campaign Enemies'].concat(rest);
    if(parts.length>4)return [readable(pack)].concat(rest);
    return ['Original Game Icons','Interface'];
  }
  if(GAME_FOLDERS[parts[1]])return ['Original Game Icons',GAME_FOLDERS[parts[1]]].concat(directory.slice(2));
  return ['Other Assets'].concat(directory.slice(parts[0]==='assets'?1:0));
}
function createLibrary(images){
  const root={name:'All packs',path:[],children:[],assets:[],count:0},records=[];
  for(const asset of images||[]){
    if(!asset.reference)continue;
    const route=folders(asset),record={asset,folders:route,search:([asset.name,asset.path].concat(route)).join(' ').toLowerCase()};
    records.push(record);let current=root;current.count++;
    for(const name of route){let child=current.children.find(c=>c.name===name);if(!child){child={name,path:current.path.concat(name),children:[],assets:[],count:0};current.children.push(child);}current=child;current.count++;}
    current.assets.push(record);
  }
  const compare=(a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'});
  function sort(folder){folder.children.sort((a,b)=>{if(folder===root){const tail=[STATS_COLLECTION,RELIC_COLLECTION],at=tail.indexOf(a.name),bt=tail.indexOf(b.name);if(at>=0||bt>=0)return (at<0?-1:at)-(bt<0?-1:bt);const ai=PACK_ORDER.indexOf(a.name),bi=PACK_ORDER.indexOf(b.name);if(ai!==bi&&(ai>=0||bi>=0))return (ai<0?999:ai)-(bi<0?999:bi);}return compare(a.name,b.name);});folder.assets.sort((a,b)=>compare(a.asset.name||'',b.asset.name||'')||compare(a.asset.path||'',b.asset.path||''));folder.children.forEach(sort);}
  sort(root);records.sort((a,b)=>compare(a.asset.name||'',b.asset.name||'')||compare(a.asset.path||'',b.asset.path||''));
  return {root,records,search(query){const terms=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);return records.filter(r=>terms.every(t=>r.search.includes(t)));}};
}

function mount(body,options){
  let library=createLibrary(options.images);
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const root=make('div',undefined,'gt-icon-browser'),search=make('input',undefined,'gt-icon-search'),navigation=make('div',undefined,'gt-icon-navigation'),back=make('button','← Back'),crumbs=make('nav',undefined,'gt-icon-breadcrumbs'),summary=make('div',undefined,'gt-icon-summary'),grid=make('div',undefined,'gt-icon-grid');
  search.type='search';search.placeholder='Search names or folders';search.setAttribute('aria-label','Search icons across all packs');crumbs.setAttribute('aria-label','Icon folders');summary.setAttribute('aria-live','polite');grid.setAttribute('aria-label','Icon library');back.type='button';
  navigation.appendChild(back);navigation.appendChild(crumbs);root.appendChild(search);root.appendChild(navigation);root.appendChild(summary);root.appendChild(grid);body.appendChild(root);
  root.appendChild(make('p','Browse a pack and its categories, or search all packs. Choosing an icon changes the draft only; Save applies it to the game.','gt-icon-hint'));
  let current=library.root,page=0,closed=false;
  const button=(label,action,cls)=>{const b=make('button',label,cls);b.type='button';b.onclick=action;return b;};
  const close=()=>{if(closed)return;if(options.onCancel)options.onCancel();};
  function visit(folder){if(closed)return;current=folder;page=0;search.value='';render();grid.scrollTop=0;const first=grid.querySelector('button');if(first)first.focus();else search.focus();}
  function ancestor(depth){let folder=library.root;for(const name of current.path.slice(0,depth))folder=folder.children.find(f=>f.name===name);return folder;}
  function render(){
    grid.textContent='';crumbs.textContent='';const query=search.value.trim();
    back.disabled=!current.path.length&&!query;
    back.onclick=()=>query?visit(current):visit(ancestor(current.path.length-1));
    crumbs.appendChild(button('All packs',()=>visit(library.root)));
    current.path.forEach((name,index)=>{crumbs.appendChild(make('span','›'));const b=button(name,()=>visit(ancestor(index+1)));if(index===current.path.length-1)b.setAttribute('aria-current','page');crumbs.appendChild(b);});
    if(!query)for(const folder of current.children){const b=button(undefined,()=>visit(folder),'gt-icon-folder'),mark=make('span',undefined,'gt-icon-folder-mark');mark.setAttribute('aria-hidden','true');b.appendChild(mark);b.appendChild(make('strong',folder.name));b.appendChild(make('small',folder.count+' icons'+(folder.children.length?' · '+folder.children.length+' folders':'')));b.setAttribute('aria-label',folder.name+' folder');b.title=folder.path.join(' / ');grid.appendChild(b);}
    const records=query?library.search(query):current.assets,slice=records.slice(0,(page+1)*120);
    summary.textContent=query?records.length+' icons found across all packs':current===library.root?library.root.children.length+' packs and collections · '+library.root.count+' icons':current.count+' icons in '+current.name;
    for(const record of slice){const asset=record.asset,b=button(undefined,()=>{if(closed)return;if(asset.reference===options.value||asset.name===options.value){close();return;}options.onSelect(asset.reference);},'gt-icon-choice'),img=make('img');img.src=asset.url;img.alt='';img.loading='lazy';b.title=asset.path;b.appendChild(img);b.appendChild(make('small',asset.name));b.setAttribute('aria-label',asset.name);const selected=asset.reference===options.value||asset.name===options.value;b.setAttribute('aria-pressed',String(selected));if(selected)b.classList.add('selected');if(query)b.appendChild(make('small',record.folders.join(' / '),'gt-icon-location'));grid.appendChild(b);}
    if(slice.length<records.length)grid.appendChild(button('Show more ('+(records.length-slice.length)+' remaining)',()=>{const scroll=grid.scrollTop,index=slice.length;page++;render();grid.scrollTop=scroll;const next=grid.querySelectorAll('.gt-icon-choice')[index];if(next)next.focus();},'gt-icon-more'));
    if(!grid.children.length)grid.appendChild(make('p',query?'No matching icons. Try a different name or pack.':'No icons available in this folder.','gt-icon-empty'));
  }
  const keydown=event=>{if(!closed&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
  document.addEventListener('keydown',keydown,true);
  search.oninput=()=>{page=0;render();grid.scrollTop=0;};render();search.focus();
  return {
    setImages(images){if(closed)return;const route=current.path.slice();library=createLibrary(images);current=library.root;for(const name of route){const child=current.children.find(c=>c.name===name);if(!child)break;current=child;}page=0;render();},
    destroy(){if(closed)return;closed=true;document.removeEventListener('keydown',keydown,true);search.oninput=null;root.remove();}
  };
}
module.exports={createLibrary,folders,mount};
