'use strict';

// This function is serialized into the editor-owned test window. It has no
// dependencies on the editor process and never targets another game window.
function run(request, host) {
    host = host || window;
    const action = request.action;
    const allowed = ['status', 'start', 'grant', 'grant-all', 'equipment', 'equipment-all', 'talent', 'talents-all', 'unlock', 'snapshot', 'prepare-reset', 'cancel-reset'];
    if (allowed.indexOf(action) < 0) throw Error('Unknown testing action');
    // Do not make quick-compile import gameplay modules during bootstrap: the
    // game's own preloader owns initialization until Main is the active scene.
    const scene=host.cc&&host.cc.director&&host.cc.director.getScene();
    if(!scene||scene.name!=='Main')return {ready:false,message:'The managed game is loading its Main scene.'};
    const loader = host.__quick_compile_project__;
    if (!loader || typeof loader.require !== 'function') return {ready:false, message:'The managed game is loading.'};
    const req = loader.require.bind(loader);
    const player = req('KinghtFallPlayerMgr').KinghtFallPlayerMgr.getInstance();
    const config = req('KinghtFallDataMgr').KinghtFallDataMgr.getInstance().data;
    const user = player.getUserData();
    if (!config || !user || !user.data || !player.getMissionData() || !player.getGuideData()) return {ready:false, message:'The managed player is loading.'};
    const server = req('ServerDataMgr').ServerdataMgr;
    if (server.curServer || (server.getNeedSaveServer && server.getNeedSaveServer())) throw Error('Testing commands require a local managed player without a remote save connection.');
    const testMode = req('TestMode').TestMode.getInstance();
    const events = req('EventMgr').EventMgr.getInstance();
    const eventNames = req('KinghtFallConfig').KinghtFallEventName;
    const goods = Object.keys(config.GoodsCfg || {}).map(key=>Object.assign({ID:Number(key)},config.GoodsCfg[key])), equips = config.EquipCfg || [], talents = config.TalentLevelCfg || [];
    const clone = value => JSON.parse(JSON.stringify(value));
    const number = (value, name, min, max) => {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw Error(name+' must be an integer from '+min+' to '+max+'.');
        return value;
    };
    const find = (rows, value, name) => {
        const id = number(value, name+' ID', 1, 10000000);
        const row = rows.find(r => Number(r.ID == null ? r.id : r.ID) === id);
        if (!row) throw Error('Unknown '+name+' ID '+id+'.');
        return row;
    };
    const emit = (name, value) => { if (eventNames[name]) events.emit(eventNames[name], value); };
    const uiGame = req('KinghtFallUIGame').default.instance;
    const battle = uiGame && uiGame.node && uiGame.node.activeInHierarchy && host.cc.isValid(uiGame.node) && uiGame.ctrGame && uiGame.ctrGame.gameData ? uiGame.ctrGame : null;
    function state() {
        return {
            currencies:{gold:user.getGoldNum(),gems:user.getDiamondNum(),diamonds:user.getDiamondNum(),stamina:user.getPowerNum(),passPoints:player.getMissionData().getAchPoint(),silver:battle?battle.gameData.coin:null},
            equipment:equips.map(e=>({id:e.id,level:user.getPersonLevel(e.id)})),
            talents:clone(user.getTalent()),
            relics:clone(user.data.treasureInfo || []),
            progression:{currentStage:user.getStage(),maxStage:user.getMaxStage(),maxWave:user.getMaxOrder(),maxOrder:user.getMaxOrder()},
            battle:battle?{stage:battle.gameData.levelCfg.Level,wave:battle.gameData.round,silver:battle.gameData.coin}:null,
            testMode:testMode.isEnabled(),time:new Date().toISOString()
        };
    }
    if (action === 'status') return {ready:true,state:state()};
    function snapshot() {
        const storage={};
        for(let i=0;i<host.localStorage.length;i++){const key=host.localStorage.key(i);storage[key]=host.localStorage.getItem(key);}
        return {ready:true,storage,state:state()};
    }
    if (action === 'snapshot') return snapshot();
    if (!testMode.isAvailable() || !testMode.setEnabled(true)) throw Error('Development Test Mode is unavailable in this preview.');
    if (action === 'start') return {ready:true,state:state(),message:'Managed test player is ready. Audio remains muted.'};
    if (action === 'prepare-reset') {
        // Pause every BaseData writer before the editor navigates away and
        // clears this window's isolated persistent session.
        host.__hkdTestingResetGuard={serverPaused:!!server.isPause,gamePaused:host.cc.game.isPaused?host.cc.game.isPaused():false};
        events.emit('CLEARDATA',true);
        server.isPause=true;
        host.cc.game.pause();
        return Object.assign(snapshot(),{prepared:true});
    }
    if (action === 'cancel-reset') {
        const guard=host.__hkdTestingResetGuard;
        if(guard){events.emit('CLEARDATA',false);server.isPause=guard.serverPaused;if(!guard.gamePaused)host.cc.game.resume();delete host.__hkdTestingResetGuard;}
        return {ready:true,state:state(),message:'Reset cancelled; the managed player was preserved.'};
    }
    const results=[], skipped=[];
    function grant(item, amount) {
        const id=Number(item.ID);
        if (item.type===1) {
            if (id===2003) {
                if (!battle) throw Error('Battle silver requires an active battle in the managed test window.');
                battle.gameData.coin += amount;
                battle.saveGame();
            } else {
                if ([2001,2002,2004,2005].indexOf(id)<0) throw Error('This currency has no supported reward API.');
                player.addRewards([{id,num:amount}]);
            }
            results.push({id,granted:amount});
            return;
        }
        if (item.type!==2) throw Error('This item type has no supported reward API.');
        const relic=(config.TreasureCfg||[]).find(t=>Number(t.goodID)===id);
        if (!relic) throw Error('The relic definition is missing.');
        // Same first-copy/fragments/excess conversion as UITreasureReward,
        // batched so a 99,999 grant does not perform 99,999 storage writes.
        let record=user.getTreasureLevel(relic.ID), remaining=amount, isNew=!record;
        record=record?clone(record):{id:relic.ID,level:1,frame:0};
        if(isNew)remaining--;
        const capacity=relic.levelInfo.slice(record.level-1).reduce((sum,l)=>sum+Number(l.PieceCost),0);
        // The current authored last levels omit PieceCost. The original loop
        // then produces NaN and never converts duplicates; retain that behavior.
        const fragments=Number.isFinite(capacity)?Math.min(remaining,Math.max(0,capacity-record.frame)):remaining;
        record.frame+=fragments;
        remaining-=fragments;
        user.setTreasureLevel(record);
        let conversion=null;
        if(remaining>0){conversion={id:relic.Conversion[0],num:remaining*relic.Conversion[1]};player.addRewards([conversion]);}
        results.push({id,granted:amount,unlocked:isNew,fragments,convertedCopies:remaining,conversion});
    }
    function equipment(row, level) {
        number(level,'Equipment level',1,row.levelInfo.length);
        user.setPersonLevel(row.id,level);
        results.push({id:row.id,level});
    }
    function unlockTalent(row) {
        const old=user.getTalentLevel(row.ID);
        if(old&&old.isLock)return;
        if(row.Level>1&&!talents.some(t=>t.Level===row.Level-1&&user.getTalentLevel(t.ID)&&user.getTalentLevel(t.ID).isLock))throw Error('Unlock the previous talent level first.');
        user.setTalentLevel(Object.assign({},old||{id:row.ID,video:0},{isLock:true}));
        results.push({id:row.ID,unlocked:true});
    }
    if(action==='grant'||action==='grant-all') {
        const amount=number(request.amount,'Amount',1,999999);
        const list=action==='grant'?[find(goods,request.itemId,'item')]:goods;
        // Validate the whole bulk operation before the first write.
        list.forEach(item=>{if(item.type!==1&&item.type!==2)throw Error('Unsupported item type '+item.type);if(item.type===1&&[2001,2002,2003,2004,2005].indexOf(Number(item.ID))<0)throw Error('Unsupported currency '+item.ID);if(item.type===2&&!(config.TreasureCfg||[]).some(t=>Number(t.goodID)===Number(item.ID)))throw Error('Missing relic definition '+item.ID);});
        list.forEach(item=>{if(action==='grant-all'&&Number(item.ID)===2003&&!battle)skipped.push({id:2003,reason:'Battle silver requires an active battle.'});else grant(item,amount);});
        emit('TreasureUpdate');emit('UpdateRedPoint',31);
    } else if(action==='equipment') equipment(find(equips,request.id,'equipment'),request.level);
    else if(action==='equipment-all') {
        if(request.level!=='max')throw Error('Bulk equipment level must be max.');
        equips.forEach(row=>equipment(row,row.levelInfo.length));
    } else if(action==='talent'||action==='talents-all') {
        if(request.enabled!==true)throw Error('Testing supports unlocking talents. Reset the managed player to remove progression.');
        if(action==='talent')unlockTalent(find(talents,request.id,'talent'));
        // Other branches are also attainable through the game's ad-unlock
        // route. Preserve all owned records and unlock every remaining record.
        else talents.slice().sort((a,b)=>a.Level-b.Level||a.ID-b.ID).forEach(unlockTalent);
        emit('TalentUpdate');emit('UpdateRedPoint',31);
    } else if(action==='unlock') {
        if(battle)throw Error('Return to the home screen before changing stage progression.');
        const row=(config.LevelCfg||[]).find(l=>Number(l.Level)===request.stage);
        if(!row)throw Error('Unknown stage.');
        number(request.wave,'Best completed wave',0,row.WaveCfg.length);
        if(request.stage<user.getMaxStage()||request.stage===user.getMaxStage()&&request.wave<user.getMaxOrder())throw Error('Unlock cannot remove progress. Use Reset to start again.');
        // setMaxStage/passOrder are the same saved progression APIs used by play.
        // Advance through existing stage API so maxOrder resets correctly.
        while(user.getMaxStage()<request.stage)user.passStage(user.getMaxStage(),0);
        user.passOrder(request.stage,request.wave);
        user.setStage(request.stage);
        emit('UpBattView');emit('UpdateRedPoint',31);
        results.push({stage:request.stage,wave:request.wave});
    }
    return {ready:true,state:state(),results,skipped,message:(action.indexOf('equipment')===0?'Equipment saved; reopen the equipment tab or start the next battle to refresh its model.':action.indexOf('talent')===0?'Talent progression saved.':'Managed test player updated.')+(skipped.length?' Battle silver was skipped because no battle is active.':'')+(results.some(r=>r.convertedCopies)?' Excess relic copies converted to gold using the game reward rules.':'')};
}

function source(request) {
    return '('+run.toString()+')('+JSON.stringify(request).replace(/</g,'\\u003c')+')';
}
module.exports={run,source};
