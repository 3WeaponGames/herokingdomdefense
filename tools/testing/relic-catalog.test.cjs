'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const files=['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'];
const primary=read(files[0]),mirror=read(files[1]);
const enums=require('../../assets/_script/KinghtFallEnum');

test('the fifty-relic catalog has the approved rarity totals and collision-free goods bindings in both copies',()=>{
  for(const data of [primary,mirror]){
    assert.equal(data.TreasureCfg.length,50);
    assert.deepEqual(data.TreasureCfg.map(row=>row.ID),Array.from({length:50},(_,index)=>120001+index));
    assert.deepEqual(data.TreasureCfg.reduce((counts,row)=>(counts[row.Quality]=(counts[row.Quality]||0)+1,counts),{}),{1:8,2:10,3:14,4:18});
    const goods=new Set();
    for(const relic of data.TreasureCfg){
      assert(!goods.has(relic.goodID),'duplicate relic goods '+relic.goodID);goods.add(relic.goodID);
      const item=data.GoodsCfg[relic.goodID];assert(item);assert.equal(item.itemID,relic.ID);assert.equal(item.type,2);assert.equal(item.enumValue,relic.goodID);
    }
    assert(!goods.has(2033),'Energy consumable ID must remain separate from relic copies');
    assert.equal(data.GoodsCfg[2033].type,1);assert.equal(data.GoodsCfg[2033].enumKey,'EnergyItem');
    assert.deepEqual(data.TreasureCfg.slice(27).map(row=>row.goodID),Array.from({length:23},(_,index)=>2034+index));
  }
  assert.deepEqual(primary.TreasureCfg,mirror.TreasureCfg);
  for(const relic of primary.TreasureCfg)assert.deepEqual(primary.GoodsCfg[relic.goodID],mirror.GoodsCfg[relic.goodID]);
});

test('every relic requires three then five fragments and has no fourth-level upgrade cost',()=>{
  for(const data of [primary,mirror])for(const relic of data.TreasureCfg){
    assert.equal(relic.levelInfo.length,3);
    assert.deepEqual(relic.levelInfo.map(level=>level.Level),[1,2,3]);
    assert.equal(relic.levelInfo[0].PieceCost,3);assert.equal(relic.levelInfo[1].PieceCost,5);
    assert(!Object.hasOwn(relic.levelInfo[2],'PieceCost'));
    assert(!Object.hasOwn(relic.levelInfo[2],'GoldCost'));
    for(const level of relic.levelInfo){assert.equal(level.id,relic.ID);assert(level.param.every(Number.isFinite));}
  }
});

test('the new rarity assignments and promoted Epic magnitudes match the approved expansion',()=>{
  const assigned={1:[28,50],2:[32,33,37,41,48],3:[29,30,40,42,46,49],4:[31,34,35,36,38,39,43,44,45,47]};
  for(const [quality,numbers] of Object.entries(assigned))assert.deepEqual(primary.TreasureCfg.filter(row=>row.ID>=120028&&row.Quality===Number(quality)).map(row=>row.ID-120000),numbers);
  const epicValues={32:[.1,.15,.2],33:[.06,.09,.12],37:[.4,.6,.8],41:[.06,.09,.12],48:[2,3,4]};
  for(const [number,values] of Object.entries(epicValues))assert.deepEqual(primary.TreasureCfg[Number(number)-1].levelInfo.map(row=>row.param[0]),values);
  assert.deepEqual(primary.TreasureCfg[41].levelInfo.map(row=>row.param[0]),[.005,.0075,.01],'fractional Vampire Fang healing remains authored precisely');
  for(const relic of primary.TreasureCfg.slice(27)){
    assert.deepEqual(relic.levelInfo.slice(0,2).map(row=>row.GoldCost),[1000,6000]);
    const percentage=[120037,120048,120050].includes(relic.ID)?0:1;
    for(const level of relic.levelInfo){assert.equal(level.param.length,1);assert.deepEqual(level.vaulePercentage,[percentage]);}
  }
});

test('each new relic has matching runtime enum IDs and an imported icon with its own number',()=>{
  const Assets=require('../../packages/game-data-editor/lib/asset-validation');
  for(const relic of primary.TreasureCfg.slice(27)){
    const item=primary.GoodsCfg[relic.goodID],number=relic.ID-120000;
    assert.equal(enums.KinghtFallEnumGoodsCfg[item.enumKey],relic.goodID);
    assert.equal(enums.KinghtFallEnumTreasureEnum[item.enumKey],relic.ID);
    assert.equal(enums.KinghtFallEnumTreasureEnum[relic.ID],item.enumKey);
    assert(item.icon.startsWith('@icon/Relic Icons/'+number+'-'));
    assert.doesNotThrow(()=>Assets.imported(root,'KinghtFallIconGood',item.icon,'sprite'));
    const template=primary.TreasureCfg.find(row=>row.ID<120028&&row.Quality===relic.Quality);
    assert.deepEqual(relic.Conversion,template.Conversion);
    assert.equal(item.sprBg,primary.GoodsCfg[template.goodID].sprBg);
  }
});

test('new relic names and effect descriptions resolve in English and Chinese without missing magnitude placeholders',()=>{
  const catalog=read('assets/resources/localization/catalog.json').entries;
  const resolve=value=>{const match=/^\[\[loc:([^\]]+)\]\]$/.exec(value);assert(match,value);const entry=catalog[match[1]];assert(entry,match[1]);return entry;};
  for(const relic of primary.TreasureCfg.slice(27)){
    const name=resolve(primary.GoodsCfg[relic.goodID].name),description=resolve(relic.Describe);
    for(const language of ['en','zh']){
      assert(name[language]&&name[language].trim());assert(description[language]&&description[language].trim());
      assert.deepEqual([...description[language].matchAll(/\{(\d+)\}/g)].map(match=>Number(match[1])),[0]);
      assert(!description[language].includes('[[loc:'));
    }
  }
  assert.match(resolve(primary.TreasureCfg[46].Describe).en,/production \+\{0\}/,'Acorn uses existing wave production, not a new production timer');
  assert.match(resolve(primary.TreasureCfg[47].Describe).en,/every third cleared combat wave/);
});

test('normal and guaranteed legacy chest pools include every eligible relic while retaining their original rarity odds',()=>{
  const expectedTotals={81001:{1:9,2:75,3:400,4:800},81002:{1:12,2:250}};
  for(const data of [primary,mirror]){
    const byId=new Map(data.TreasureCfg.map(row=>[row.ID,row]));
    assert.equal(new Set(data.BannerCfg.map(row=>row.ID)).size,data.BannerCfg.length);
    for(const library of [81001,81002]){
      const rows=data.BannerCfg.filter(row=>row.LibraryID===library),eligible=data.TreasureCfg.filter(row=>library===81001||row.Quality<=2);
      assert.equal(rows.length,library===81001?50:18);
      assert.deepEqual(rows.map(row=>row.RewardID).sort((a,b)=>a-b),eligible.map(row=>row.ID).sort((a,b)=>a-b));
      const totals={};
      for(const row of rows){
        const relic=byId.get(row.RewardID);assert(relic);assert(row.Weight>0&&Number.isFinite(row.Weight));
        if(library===81002)assert(relic.Quality<=2,'guaranteed draws must remain Epic or Legendary');
        totals[relic.Quality]=(totals[relic.Quality]||0)+row.Weight;
        const count=eligible.filter(candidate=>candidate.Quality===relic.Quality).length;
        assert(Math.abs(row.Weight-expectedTotals[library][relic.Quality]/count)<1e-12,'uniform weight within each rarity');
        if(relic.ID>=120028)assert(row.ID>80001038,'new banner rows use fresh IDs');
      }
      for(const[quality,total]of Object.entries(expectedTotals[library]))assert(Math.abs(totals[quality]-total)<1e-9,'preserved rarity weight '+library+'/'+quality);
    }
    assert.equal(data.ShopCfg[80001].Banner,81001);assert.equal(data.ShopCfg[80001].GuarantBanner,81002);assert.equal(data.ShopCfg[80001].GuarantNumber,10);
  }
});

test('the actual legacy chest draw grants every new relic, including new Epics and Legendaries at the guarantee boundary',()=>{
  const {harness}=require('./persistence-harness.cjs');
  for(const relic of primary.TreasureCfg.slice(27)){
    const h=harness();h.state.selected=relic.ID;
    const result=h.player.drawTreasures(primary.ShopCfg[80001],1,[]);
    assert(result&&!result.pending,'normal chest draw completed for '+relic.ID);
    assert.equal(result.rewards[0].item.id,relic.goodID);
    assert.deepEqual(JSON.parse(JSON.stringify(h.player.udata.getTreasureLevel(relic.ID))),{id:relic.ID,level:1,frame:0});
    if(relic.Quality<=2){
      const guaranteed=harness();guaranteed.state.selected=relic.ID;guaranteed.player.udata.setShopInfo({id:80001,time:9,video:0});
      const reward=guaranteed.player.drawTreasures(primary.ShopCfg[80001],1,[]);
      assert.equal(reward.rewards[0].item.id,relic.goodID,'guaranteed draw grants '+relic.ID);
      assert.equal(guaranteed.player.udata.getShopInfo(80001).time,0);
    }
  }
});
