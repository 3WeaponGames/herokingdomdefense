'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Picker=require('../panel/icon-picker');
const image=(name,file,reference)=>({name,path:file,reference:reference||'@icon/'+file.replace(/^assets\/resources\//,'').replace(/\.png$/,''),url:'file:///'+file});
const find=(root,...parts)=>parts.reduce((folder,name)=>folder.children.find(f=>f.name===name),root);

test('icon folders group packs before categories and retain the exact resource references',()=>{
  const icons=[image('Helmet','assets/resources/icons/2d-minimal-hero-equipment/Armor/Helmet.png'),image('Gold','assets/resources/icons/2d-minimal/Economy/Gold.png'),image('Sword','assets/resources/icons/Pictograms/Sword.png'),image('Chest','assets/resources/icons/GUI-Pro/Icons/Chest.png'),image('Star','assets/resources/icons/GUI-Pro/Buttons/Star.png'),image('Wolf','assets/resources/icons/monster-roster/monster1/Wolf.png'),image('Bear','assets/resources/icons/enemy-heads/Bear.png'),image('Castle','assets/KinghtFallIconBuild/Castle.png','@sprite/KinghtFallIconBuild/Castle'),image('Bow','assets/resources/character-parts/Parts/Bow.png')],before=JSON.stringify(icons),library=Picker.createLibrary(icons),root=library.root;
  assert.deepEqual(root.children.map(f=>f.name),['2D Minimal Icon Pack','Minimal Hero Equipment','GUI Pro Kit','Monster Portraits','Original Game Icons','Other Assets']);
  assert.equal(root.assets.length,0);assert.equal(root.count,9);
  assert.equal(find(root,'GUI Pro Kit').count,3);assert.deepEqual(find(root,'GUI Pro Kit').children.map(f=>f.name),['Buttons','Icons','Pictograms']);
  assert.equal(find(root,'2D Minimal Icon Pack','Economy').assets[0].asset,icons[1]);
  assert.equal(find(root,'Monster Portraits','Monster Pack 1').assets[0].asset.reference,icons[5].reference);
  assert.equal(find(root,'Original Game Icons','Buildings').assets[0].asset.reference,'@sprite/KinghtFallIconBuild/Castle');
  assert.equal(JSON.stringify(icons),before,'browsing cannot normalize or mutate source records');
});

test('global icon search includes pack display names, folders, names and uncataloged bundle assets',()=>{
  const library=Picker.createLibrary([image('Hat','assets/resources/icons/2d-minimal-hero-equipment/Armor/Hat.png'),image('Coin','assets/resources/icons/2d-minimal/Economy/Coin.png'),image('Sword','assets/resources/icons/Pictograms/Sword.png'),image('Future','assets/NewBundle/deep/Future.png','@sprite/NewBundle/deep/Future')]);
  assert.equal(library.search('minimal hero armor')[0].asset.name,'Hat');assert.equal(library.search('gui pro sword')[0].asset.name,'Sword');assert.equal(library.search('newbundle deep')[0].asset.name,'Future');assert.equal(library.search(' COIN ')[0].asset.name,'Coin');assert.equal(library.search('no matching asset').length,0);
});

test('new icon packs become their own folders, loose game icons stay accessible, and unusable images are excluded',()=>{
  const icons=[image('Potion','assets/resources/icons/new-consumables/Red/Potion.png'),image('Follow','assets/resources/icons/Follow_Boot_Blue.png'),{name:'Raw texture',path:'assets/raw.png',reference:null}],root=Picker.createLibrary(icons).root;
  assert.equal(root.count,2);assert.equal(find(root,'New Consumables','Red').count,1);assert.equal(find(root,'Original Game Icons','Interface').count,1);
  assert.equal(Picker.createLibrary([]).root.children.length,0);
});

test('all 80 Stats Icons appear in their own final root collection after built-in and custom packs',()=>{
  const stats=Array.from({length:80},(_,index)=>image('Stat '+index,'assets/resources/Stats Icons/stat-'+String(index).padStart(2,'0')+'.png'));
  const packs=[image('Custom A','assets/resources/icons/a-custom-pack/Custom A.png'),image('Custom Z','assets/resources/icons/z-custom-pack/Custom Z.png'),image('Other','assets/resources/character-parts/Other.png'),image('Tower','assets/KinghtFallIconBuild/Tower.png','@sprite/KinghtFallIconBuild/Tower'),image('Wolf','assets/resources/icons/monster-roster/monster1/Wolf.png'),image('Potion','assets/resources/icons/GUI-Pro/Icons/Potion.png'),image('Sword','assets/resources/icons/2d-minimal-hero-equipment/Weapons/Sword.png'),image('Gold','assets/resources/icons/2d-minimal/Economy/Gold.png')];
  const icons=stats.concat(packs),before=JSON.stringify(icons),library=Picker.createLibrary(icons),root=library.root,collection=find(root,'Stats Icons');
  assert.equal(root.children.at(-1).name,'Stats Icons');
  assert.deepEqual(root.children.slice(0,-1).map(folder=>folder.name),['2D Minimal Icon Pack','Minimal Hero Equipment','GUI Pro Kit','Monster Portraits','Original Game Icons','Other Assets','A Custom Pack','Z Custom Pack']);
  assert.equal(collection.count,80);assert.equal(collection.assets.length,80);assert.equal(collection.children.length,0);
  assert.equal(root.count,88);assert.equal(library.records.length,88);
  assert.deepEqual(collection.assets.map(record=>record.asset.reference).sort(),stats.map(asset=>asset.reference).sort());
  assert.equal(library.search('stats icons stat-79')[0].asset.reference,'@icon/Stats Icons/stat-79');
  assert.equal(JSON.stringify(icons),before,'foldering and searching must not change draft assets or references');
  const withRelics=Picker.createLibrary(icons.concat(image('Relic','assets/resources/Relic Icons/relic.png'))).root;
  assert.deepEqual(withRelics.children.slice(-2).map(folder=>folder.name),['Stats Icons','Relic Icons'],'both new collections stay below the original and custom packs');
});

test('Stats Icons preserves exact spaced resource paths and optional subfolders',()=>{
  const icon=image('Critical Damage','assets/resources/Stats Icons/Combat/critical-damage.png'),windows=image('Health','assets\\resources\\Stats Icons\\health.png','@icon/Stats Icons/health');
  assert.deepEqual(Picker.folders(icon),['Stats Icons','Combat']);
  assert.deepEqual(Picker.folders(windows),['Stats Icons']);
  const library=Picker.createLibrary([icon,windows]);
  assert.equal(find(library.root,'Stats Icons').count,2);
  assert.equal(find(library.root,'Stats Icons','Combat').assets[0].asset.reference,'@icon/Stats Icons/Combat/critical-damage');
  assert.equal(library.search('stats combat critical damage')[0].asset,icon);
});

test('the installed packs and all previously selectable runtime images remain available exactly once',()=>{
  const root=path.resolve(__dirname,'../../..'),assets=require('../lib/assets').index(root).images,valid=assets.filter(a=>a.reference),library=Picker.createLibrary(assets),folder=library.root;
  assert.equal(find(folder,'2D Minimal Icon Pack').count,900);assert.equal(find(folder,'Minimal Hero Equipment').count,60);assert.equal(find(folder,'GUI Pro Kit','Pictograms').count,320);assert.equal(find(folder,'GUI Pro Kit','Icons').count,90);assert.equal(find(folder,'Monster Portraits').count,112);
  assert.equal(library.records.length,valid.length);assert.deepEqual(library.records.map(r=>r.asset.reference).sort(),valid.map(a=>a.reference).sort());
});
