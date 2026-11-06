/* Temporary Creator preview fixture. Installed only for the live gate audit. */
(function () {
  if (typeof window === 'undefined' || typeof CC_DEBUG === 'undefined' || !CC_DEBUG || !/[?&]live-gates=1(?:&|$)/.test(window.location.search)) return;
  var memory = Object.create(null);
  var storage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; }, setItem: function (k, v) { memory[k] = String(v); }, removeItem: function (k) { delete memory[k]; }, clear: function () { memory = Object.create(null); }, key: function (i) { return Object.keys(memory)[i] || null; } };
  Object.defineProperty(storage, 'length', { get: function () { return Object.keys(memory).length; } });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  cc.sys.localStorage = storage;
  var UI = require('KinghtFallUIGame').default;
  var UIMgr = require('UIMgr').UIMgr;
  var Player = require('KinghtFallPlayerMgr').KinghtFallPlayerMgr;
  var Config = require('KinghtFallConfig');
  var BaseConfig = require('Config');
  var Stage = require('KinghtFallModle').KinghtFallGameStage;
  var Nav = require('KinghtFallNavigation');
  var Grid = require('NavigationGrid').NavigationGrid;
  var results = [], events = [], active = '', busy = false, metrics, game, ui, monitor, desiredArmyCount = 0, environment = null;
  var inside = { x: -300, y: 600 }, outside = { x: -600, y: 940 };
  var panel, status, output, progress, errors = [], geometryEnabled = false, phaseChecks = null, outputVersion = '';
  window.addEventListener('error', function (e) { errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errors.push(String(e.reason && e.reason.stack || e.reason)); });
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function log(message) { events.push({ time: new Date().toISOString(), message: message }); if (events.length > 120) events.shift(); render(); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function isOutside(p) { return (p.x + 450) * -300 + (p.y - 770) * 340 > 0; }
  function units() { return game.gameData.getSoldierList(); }
  function living() { return units().filter(function (s) { return !s.isDead() && s.node.activeInHierarchy; }); }
  function gate() { return game.gameData.bulidPointMap[17]; }
  function fitViewport() {
    var frame = document.getElementById('live-game-viewport');
    if (!frame) { frame = document.createElement('div'); frame.id = 'live-game-viewport'; document.body.appendChild(frame); }
    frame.style.cssText = 'position:fixed;left:470px;top:25px;width:375px;height:667px;margin:0;padding:0;overflow:hidden;z-index:1;background:#111';
    // Creator otherwise treats <html> as the frame and reads window.innerWidth.
    // Offsetting that element moves the whole page, including the centered game.
    var html = document.documentElement;
    html.style.position = ''; html.style.left = ''; html.style.top = ''; html.style.width = ''; html.style.height = '';
    frame.appendChild(cc.game.container); cc.game.frame = frame;
    cc.view.resizeWithBrowserSize(false);
    if (cc.view.enableAutoFullScreen) cc.view.enableAutoFullScreen(false);
    cc.game.container.style.margin = '0'; cc.game.container.style.left = '0'; cc.game.container.style.top = '0';
    cc.view.setFrameSize(375, 667);
    if (exports.default.instance) exports.default.instance.adapt();
  }
  function environmentDiagnostics() {
    var context=cc.game._renderContext,canvas=cc.game.canvas,rect=canvas&&canvas.getBoundingClientRect();
    var result={renderType:cc.game.renderType===cc.game.RENDER_TYPE_WEBGL?'WebGL':cc.game.renderType===cc.game.RENDER_TYPE_CANVAS?'Canvas':cc.game.renderType,userAgent:navigator.userAgent,devicePixelRatio:window.devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,canvas:canvas&&{width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height},detailedEngineCPU:/[?&]profile-engine=1(?:&|$)/.test(window.location.search)};
    if(context&&typeof context.getParameter==='function')try{
      var debug=context.getExtension('WEBGL_debug_renderer_info');
      result.webgl={version:context.getParameter(context.VERSION),shadingLanguage:context.getParameter(context.SHADING_LANGUAGE_VERSION),renderer:context.getParameter(context.RENDERER),vendor:context.getParameter(context.VENDOR),unmaskedRenderer:debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',unmaskedVendor:debug?context.getParameter(debug.UNMASKED_VENDOR_WEBGL):'unavailable',drawingBufferWidth:context.drawingBufferWidth,drawingBufferHeight:context.drawingBufferHeight,contextAttributes:context.getContextAttributes()};
    }catch(error){result.webglError=String(error);}
    return result;
  }
  function frameData() {
    if (!game) return {};
    return { phase: active, wave: game.gameData.round, gameStatus: game.gameStatus, paused: ui.isPauset, desiredAllies: desiredArmyCount, allies: living().length, ownedAllies: units().length, dead: units().length - living().length, enemies: game.gameData.getEnemyList().length, outside: living().filter(function (s) { return isOutside(s.node); }).length, gateLevel: gate().index, gateOpen: gate().isOpen, gateHealth: gate().buildInfo && gate().buildInfo.hp, hero: { x: game.ctrPlay.node.x, y: game.ctrPlay.node.y }, respawnQueue: [7,8].map(function (id) { var b = game.gameData.bulidPointMap[id]; return { id: id, extraOwned: b.VideoTimes, owned: b.enemyList.filter(Boolean).length, waiting: b.waitEnemy.length, time: Object.assign({},b.time) }; }) };
  }
  function render() {
    if (!status) return;
    status.textContent = active || 'Ready';
    var report = metrics ? metrics.report() : null;
    progress.textContent = JSON.stringify({ environment:environment, drawCalls:cc.renderer&&cc.renderer.drawCalls, live: frameData(), checks: phaseChecks && phaseChecks.summary(), metrics: report && report.timingMs ? { elapsedWall:report.elapsedWallMs, elapsedGame:report.elapsedGameMs, frame:report.timingMs.frame, gameCPU:report.timingMs.gameUpdate, physicsCPU:report.timingMs.physics, engineCPU95:{collision:report.timingMs.collision&&report.timingMs.collision.p95,depth:report.timingMs.depthView&&report.timingMs.depthView.p95,depthSnapshot:report.timingMs.depthSnapshot&&report.timingMs.depthSnapshot.p95,spineUpdate:report.timingMs.spineUpdate&&report.timingMs.spineUpdate.p95,spineTransform:report.timingMs.spineTransform&&report.timingMs.spineTransform.p95,spineAssembly:report.timingMs.spineAssembly&&report.timingMs.spineAssembly.p95,spineWorldVertices:report.timingMs.spineWorldVertices&&report.timingMs.spineWorldVertices.p95,rendering:report.timingMs.rendering&&report.timingMs.rendering.p95}, methodCPU95:{formation:report.timingMs.formation&&report.timingMs.formation.p95,enemyFind:report.timingMs.enemyFind&&report.timingMs.enemyFind.p95,soldierFind:report.timingMs.soldierFind&&report.timingMs.soldierFind.p95,movement:report.timingMs.movement&&report.timingMs.movement.p95,buildingFootprints:report.timingMs.buildingFootprints&&report.timingMs.buildingFootprints.p95}, navigation:report.navigation.statsDelta, peaks:report.army, stalls:report.stalls.current.length, geometry:report.geometry && { enabled:report.geometry.enabled, revisions:report.geometry.revisions, changedNodes:report.geometry.nodes.length, top:report.geometry.top5.slice(0,2) } } : report }, null, 2);
    var version=results.length+':'+errors.length+':'+(events.length?events[events.length-1].time:'');
    if(version!==outputVersion){outputVersion=version;output.textContent = JSON.stringify({ environment:environment, results: results, events: events, errors: errors }, null, 2);}
  }
  function button(label, fn, duringRun) {
    var b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'padding:8px;margin:3px;color:#fff;background:#284759;border:1px solid #6c99b3;border-radius:4px;font-size:13px';
    b.onclick = function () { if (busy && !duringRun) return; var ownsBusy = !duringRun; if (ownsBusy) busy = true; Promise.resolve().then(fn).catch(function (e) { errors.push(e.stack || String(e)); log('ERROR ' + e.message); }).then(function () { if (ownsBusy) busy = false; render(); }); };
    panel.appendChild(b);
  }
  async function openBattle() {
    fitViewport();
    var player = Player.getInstance(); player.getGuideData().data.GroupId = 100; player.getGuideData().data.tips = Array(40).fill(1);
    UIMgr.getInstance().closeById(BaseConfig.UIID.UIGuide);
    player.getGameData().setNewGame();
    UIMgr.getInstance().openUIOfCallback(Config.KinghtFallUIID.UIGame, BaseConfig.UIID.UINONE, function () {
      var home = UIMgr.getInstance().getUIById(Config.KinghtFallUIID.UIHome); if (home) home.node.active = false;
    }, 1);
    for (var i = 0; i < 200; i++) { await delay(100); ui = UI.instance; if (ui && ui.ctrGame && ui.ctrGame.ndMain && !ui.isPauset) break; }
    game = ui.ctrGame; environment=environmentDiagnostics();
    // Only suppress scenario-ending UI; unit/physics/combat/respawn code runs normally.
    game.gameData.tryEndGame = function () { if (!this.enemyList.length && !Object.keys(this.enemyQueue).some(function (key) { return this.enemyQueue[key].length; }, this)) this._liveWaveFinished = true; };
    metrics = require('LiveGateMetrics').attach(game, cc, Nav, Grid, {detailedEngineCPU:/[?&]profile-engine=1(?:&|$)/.test(window.location.search)});
    active = 'Battle ready — isolated in-memory save'; log(active);
  }
  function clearCombat() {
    stopHeroDrive(); game.gameStatus = Stage.Prepare; game.clearArmyOrder();
    game.gameData.enemyQueue = {}; game.cleanMap();
    game.gameData.getEnemyList().slice().forEach(function (enemy) { enemy.freeNode(); });
  }
  function preserveArmyOwnership(reinitializeChanged) {
    if (!desiredArmyCount) return;
    [7,8].forEach(function(id) {
      var b=game.gameData.bulidPointMap[id],extra=desiredArmyCount/2-10;
      if(b.VideoTimes!==extra){b.VideoTimes=extra;if(reinitializeChanged&&b.buildInfo&&b.buildInfo.cfg)b.initSoldier();}
    });
  }
  async function awaitArmyCount() {
    // First activation runs Barracks.start(), which resets VideoTimes. Allow it
    // to finish, then restore ownership through the normal soldier initializer.
    await delay(800);
    var stable=0;
    for(var tries=0;tries<100;tries++) {
      preserveArmyOwnership(true);
      var valid=living().length===desiredArmyCount&&units().length===desiredArmyCount&&[7,8].every(function(id){return game.gameData.bulidPointMap[id].enemyList.filter(Boolean).length===desiredArmyCount/2;});
      stable=valid?stable+1:0;
      if(stable>=5)return;
      await delay(100);
    }
    throw new Error('Expected '+desiredArmyCount+' owned, living barracks soldiers; found '+units().length+' owned / '+living().length+' living');
  }
  async function build(count) {
    count = count || 30; desiredArmyCount=count; clearCombat();preserveArmyOwnership(false);
    game.clearArmyOrder(); game.gameStatus = Stage.Prepare; ui.isPauset = false;
    game.gameData.baseBuild.setLevel(3); game.gameData.upMap();
    game.gameData.getBulidList().forEach(function (b) { if (b.ID !== 1 && b.ID !== 7 && b.ID !== 8) b.setLevel(Math.min(3, b.buildCfg.levelList.length)); b.isDestroyed = false; b.upHpView(); });
    [7,8].forEach(function (id, index) { var b = game.gameData.bulidPointMap[id]; b.VideoTimes = count / 2 - 10; b.setLevel(index ? 7 : 4); });
    game.gameData.coin = 0; // Prevent the stationary test hero buying upgrades.
    ui.initView(); ui.btnAgg.active = true;
    await awaitArmyCount();active = 'Built gate variant 3, ' + living().length + ' real barracks soldiers'; log(active);
  }
  async function restoreBuildings() {
    if(!desiredArmyCount)desiredArmyCount=units().length||20;
    preserveArmyOwnership(false);
    game.gameData.getBulidList().forEach(function(b){b.isDestroyed=false;b.setLevel(b.index||3);b.upHpView();});
    gate().setLevel(3);gate().setLight(false);
    await awaitArmyCount();
  }
  function stopHeroDrive() { if (heroDrive) cc.director.off(cc.Director.EVENT_AFTER_UPDATE,heroDrive); heroDrive=null; game.moveFun(null); }
  function placeHero(p) { stopHeroDrive(); game.ctrPlay.node.setPosition(p.x, p.y); game.ctrPlay.rigidBody.linearVelocity=cc.Vec2.ZERO; game.ctrPlay.rigidBody.syncPosition(); }
  function order(mode, p) {
    placeHero(p); ui.changeFollowMode(mode === 'rally' ? 1 : 2);
    if (mode === 'follow' && game.isAgg) game.clearArmyOrder();
    game.changeAge();
  }
  var heroDrive = null;
  function walkHero(goal) {
    var fakeFriendly = { navigationTeam:'friendly' }, grid = Nav.get(game).gridFor(fakeFriendly);
    var route = grid.findPath(game.ctrPlay.node.position, goal, 20);
    if (!route) throw new Error('No safe joystick route for test hero');
    if (heroDrive) cc.director.off(cc.Director.EVENT_AFTER_UPDATE,heroDrive);
    var index = 0;
    heroDrive = function () {
      while (index < route.points.length && dist(game.ctrPlay.node,route.points[index]) < 12) index++;
      if (index >= route.points.length) { game.moveFun(null); cc.director.off(cc.Director.EVENT_AFTER_UPDATE,heroDrive); heroDrive=null; return; }
      var p=route.points[index]; game.moveFun(cc.v2(p.x-game.ctrPlay.node.x,p.y-game.ctrPlay.node.y));
    };
    cc.director.on(cc.Director.EVENT_AFTER_UPDATE,heroDrive);
  }
  function placeArmy(p) {
    var army = living(), grid = Nav.get(game).gridFor(army[0]), candidates = [];
    for (var y = p.y - 400; y <= p.y + 400; y += 30) for (var x = p.x - 400; x <= p.x + 400; x += 30) {
      var q = { x:x, y:y }; if (isOutside(q) === isOutside(p) && grid.isWalkable(q, 20)) candidates.push(q);
    }
    candidates.sort(function (a,b) { return dist(a,p) - dist(b,p); });
    if (candidates.length < army.length) throw new Error('Insufficient clear spawn positions');
    army.forEach(function (s,i) { s.node.setPosition(candidates[i].x, candidates[i].y); s.rigidBody.syncPosition(); Nav.reset(s); });
  }
  function watchCombat() {
    var started = performance.now(), victims = [], victimMap = new Map(), bindings = [], requested = 0;
    var ground = new Map(), flyers = new Set(), nearbyOpen = new Set(), violations = [];
    var openFrames = 0, openGroundFrames = 0, destroyedAt = null, breach = null, breachUnits = new Map();
    var shapes = gate().getNavigationGateShapes(), polygon = shapes.length ? shapes[0].points.map(function(p){return game.ndMain.convertToNodeSpaceAR(p);}) : [];
    var dx=inside.x-outside.x,dy=inside.y-outside.y,length=Math.hypot(dx,dy),axis={x:dx/length,y:dy/length};
    function along(p) { return p.x*axis.x+p.y*axis.y; }
    function across(p) { return -p.x*axis.y+p.y*axis.x; }
    var min=Infinity,max=-Infinity,tmin=Infinity,tmax=-Infinity;
    polygon.forEach(function(p){min=Math.min(min,along(p));max=Math.max(max,along(p));tmin=Math.min(tmin,across(p));tmax=Math.max(tmax,across(p));});
    function elapsed() { return Math.round(performance.now()-started); }
    function key(unit) { return unit.uuid+':'+unit.node._combatGeneration; }
    function bind(object, name, factory) {
      var own=Object.prototype.hasOwnProperty.call(object,name),original=object[name],replacement=factory(original);
      object[name]=replacement;bindings.push(function(){if(object[name]===replacement){if(own)object[name]=original;else delete object[name];}});
    }
    function orderGoal(unit) {
      var formation=game._armyFormation,slot=formation&&formation.slots&&formation.slots.get(unit);
      return slot&&slot.pos || unit.rallyPoint&&unit.rallyPoint.pos || unit.isAgg&&game.ctrPlay.node.position || null;
    }
    function recordAttack(unit, type, target) {
      var record=victimMap.get(unit);
      if(!record || unit.isDead() || unit.node._combatGeneration<=record.beforeGeneration)return;
      var goal=orderGoal(unit),remaining=goal?dist(unit.node,goal):0;
      var enRoute=!!goal && remaining>(unit.isAgg?Config.KinghtFallParameter.FollowRange/2+10:48) && !unit._settledPoint;
      if(type==='attack') { record.attackEvents++; if(enRoute)record.enRouteAttackEvents++; }
      if(type==='projectile')record.projectiles++;
      if(type==='damage')record.damageHits++;
      if(record.events.length<40)record.events.push({atMs:elapsed(),type:type,generation:unit.node._combatGeneration,enRoute:enRoute,remaining:Math.round(remaining),position:{x:unit.node.x,y:unit.node.y},target:target&&target.uuid});
    }
    units().forEach(function(unit){
      bind(unit,'doAttack',function(original){return function(){
        var record=victimMap.get(unit),target=null,beforeHp=0;
        if(record && unit.node._combatGeneration>record.beforeGeneration) {
          game.gameData.getEnemyList().forEach(function(enemy){if(!enemy.isDead() && dist(unit.node,enemy.node)<=unit.attackRange && (!target||dist(unit.node,enemy.node)<dist(unit.node,target.node)))target=enemy;});
          if(target){beforeHp=target.hp;recordAttack(unit,'attack',target);}
        }
        var value=original.apply(this,arguments);
        if(target&&target.hp<beforeHp)recordAttack(unit,'damage',target);
        return value;
      };});
    });
    bind(game,'onShotSoldier',function(original){return function(unit){var value=original.apply(this,arguments);recordAttack(unit,'projectile',unit._orderTarget);return value;};});
    function sample() {
      if(ui.isPauset)return;
      victims.forEach(function(record){var unit=record.unit;
        if(!unit.isDead()&&unit.node.activeInHierarchy&&unit.node._combatGeneration>record.beforeGeneration&&!record.respawnedAtMs){
          record.respawnedAtMs=elapsed();record.respawnGeneration=unit.node._combatGeneration;
          record.inheritedOrder=game.rallyPoint?unit.rallyPoint===game.rallyPoint:game.isAgg?unit.isAgg:!unit.rallyPoint&&!unit.isAgg;
          record.orderAtRespawn={follow:unit.isAgg,rally:unit.rallyPoint&&{x:unit.rallyPoint.pos.x,y:unit.rallyPoint.pos.y}};
        }
      });
      var intact=gate().getIsWork();
      if(!intact&&destroyedAt===null)destroyedAt=elapsed();
      if(!polygon.length)return;
      var open=intact&&!!gate().isOpen,nearCount=0;
      if(open)openFrames++;
      game.gameData.getEnemyList().forEach(function(enemy){
        if(enemy.isDead()||!enemy.node.activeInHierarchy)return;
        var id=key(enemy);
        if(enemy.cfg.BuildingCross===0){flyers.add(id);return;}
        var n=along(enemy.node),t=across(enemy.node),record=ground.get(id);
        if(!record){record={seenExterior:n<min-2,violated:false};ground.set(id,record);}
        if(n<min-2)record.seenExterior=true;
        if(open&&n>=min-180&&n<=max+40&&t>=tmin-120&&t<=tmax+120){nearCount++;nearbyOpen.add(id);}
        // All authored lanes1..3 start outside this gate. A ground center beyond
        // the inner face while the gate is intact is an actual admission failure.
        if(intact&&record.seenExterior&&!record.violated&&n>max+12){
          record.violated=true;violations.push({unit:id,kind:enemy.cfg.ID,atMs:elapsed(),gateOpen:open,position:{x:enemy.node.x,y:enemy.node.y},pastInnerFace:n-max});
        }
        var released=breachUnits.get(enemy);
        if(released&&released.generation===enemy.node._combatGeneration){released.maxTravel=Math.max(released.maxTravel,dist(enemy.node,released.from));released.entered= released.entered || n>max+12;released.latest={x:enemy.node.x,y:enemy.node.y};released.state=enemy.state;var target=enemy._targetSearchCache&&enemy._targetSearchCache.target;released.lastTarget=target&&{id:target.tag&&(target.tag.uuid||target.tag.name),name:target.tag&&target.tag.name,canAttack:target.canAtt,building:target.building&&target.building.ID};}
      });
      if(open&&nearCount)openGroundFrames++;
    }
    cc.director.on(cc.Director.EVENT_AFTER_UPDATE,sample);
    function killSix() {
      if(victims.length)return;
      requested=6;
      var selected=[7,8].reduce(function(all,id){return all.concat(game.gameData.bulidPointMap[id].enemyList.filter(function(s){return s&&!s.isDead();}).slice(0,3));},[]);
      selected.forEach(function(unit){var record={unit:unit,id:unit.uuid,kind:unit.cfg.ID,barracks:unit.outBuild.ID,beforeGeneration:unit.node._combatGeneration,killedAtMs:elapsed(),respawnedAtMs:null,inheritedOrder:false,attackEvents:0,enRouteAttackEvents:0,projectiles:0,damageHits:0,events:[]};victims.push(record);victimMap.set(unit,record);unit.onAttacked(unit.hp*100+1000,null);});
      log('Killed '+selected.length+' owned soldiers; normal barracks respawn timers running');
    }
    function destroyGate() {
      if(!gate().getIsWork()){log('Gate already destroyed before scripted breach');return;}
      breach={atMs:elapsed(),intactExclusion:report().enemyExclusion,groundAtBreach:0};
      game.gameData.getEnemyList().forEach(function(enemy){if(!enemy.isDead()&&enemy.cfg.BuildingCross!==0&&along(enemy.node)<=max+12){breachUnits.set(enemy,{id:key(enemy),kind:enemy.cfg.ID,attackRange:enemy.cfg.AttackRange,state:enemy.state,generation:enemy.node._combatGeneration,from:{x:enemy.node.x,y:enemy.node.y},maxTravel:0,entered:false});}});
      breach.groundAtBreach=breachUnits.size;gate().onAttacked(gate().buildInfo.hp+1000);breach.destroyedByRealDamage=gate().isDestroyed;
      log('Destroyed gate through onAttacked; tracking '+breach.groundAtBreach+' ground enemies for release');
    }
    function summary() { return {respawned:victims.filter(function(r){return r.respawnedAtMs!==null;}).length,selected:victims.length,respawnAttacks:victims.reduce(function(n,r){return n+r.attackEvents;},0),enRouteAttacks:victims.reduce(function(n,r){return n+r.enRouteAttackEvents;},0),openGateGroundContacts:nearbyOpen.size,groundAdmissionFailures:violations.length}; }
    function report() {
      sample();
      return {enemyExclusion:{method:'Ground units observed outside, then checked against the intact canonical gate leaf inner face; flyers excluded by BuildingCross=0.',verdict:violations.length?'failed':openGroundFrames>=30?'passed':'inconclusive: insufficient ground enemies near an open gate',observedGroundUnits:ground.size,excludedFlyers:flyers.size,openFrames:openFrames,openFramesWithNearbyGround:openGroundFrames,uniqueGroundNearOpenGate:nearbyOpen.size,gateDestroyedAtMs:destroyedAt,violations:violations},breach:breach&&Object.assign({},breach,{progressed:Array.from(breachUnits.values()).filter(function(r){return r.maxTravel>30;}).length,entered:Array.from(breachUnits.values()).filter(function(r){return r.entered;}).length,units:Array.from(breachUnits.values())}),respawns:{requested:requested,selected:victims.length,respawned:victims.filter(function(r){return r.respawnedAtMs!==null;}).length,inherited:victims.filter(function(r){return r.inheritedOrder;}).length,attackedAfterRespawn:victims.filter(function(r){return r.attackEvents>0;}).length,attackedEnRoute:victims.filter(function(r){return r.enRouteAttackEvents>0;}).length,attackEvidence:'Actual doAttack callbacks with a live target in range, projectile launches, and synchronous melee HP reductions; absence of an event is not counted as a pass.',units:victims.map(function(r){var copy={};Object.keys(r).forEach(function(k){if(k!=='unit')copy[k]=r[k];});copy.finalGeneration=r.unit.node._combatGeneration;copy.finalAlive=!r.unit.isDead();copy.finalOutside=isOutside(r.unit.node);return copy;})}};
    }
    return {killSix:killSix,destroyGate:destroyGate,summary:summary,report:report,dispose:function(){cc.director.off(cc.Director.EVENT_AFTER_UPDATE,sample);bindings.reverse().forEach(function(restore){restore();});}};
  }
  async function measure(label, seconds, done, schedule) {
    label += ' · ' + units().length + ' allies';
    active = label; metrics.start(label); log('START ' + label);
    var start = performance.now(), startFrame = frameData(), nextAction=0, hiddenSamples=0, report=metrics.report();
    while (report.elapsedGameMs < seconds * 1000 && performance.now()-start < Math.max(60000,seconds*3000)) {
      if(document.hidden)hiddenSamples++;
      while(schedule&&nextAction<schedule.length&&report.elapsedGameMs>=schedule[nextAction].at*1000){var action=schedule[nextAction++];log('ACTION '+action.name);action.run();}
      await delay(500); render();
      report=metrics.report();
    }
    var ratio=report.elapsedGameMs/Math.max(1,report.elapsedWallMs),validDuration=report.elapsedGameMs>=seconds*1000;
    var result = { environment:environment, label: label, duration: (performance.now()-start)/1000, initial: startFrame, final: frameData(), metrics: report, timingValidity:{requestedGameSeconds:seconds,completedGameSeconds:report.elapsedGameMs/1000,gameToWallRatio:ratio,hiddenSamples:hiddenSamples,functionalDurationValid:validDuration,performanceValid:validDuration&&!hiddenSamples&&ratio>=.8&&ratio<=1.2} };
    if (done) Object.assign(result, done());
    results.push(result); stopHeroDrive(); active = (validDuration?'Finished: ':'INVALID duration: ') + label; log(active);
    if(!validDuration)throw new Error('Scene did not simulate '+seconds+' seconds within wall-time limit; keep the game tab visible');
    return result;
  }
  async function crossing(level, mode, toOutside, arrange) {
    game.gameStatus = Stage.Prepare; game.clearArmyOrder();
    gate().isDestroyed = false; gate().setLevel(level); gate().setLight(false);
    await delay(500);
    var goal = toOutside ? outside : inside;
    if (arrange) placeArmy(toOutside ? inside : outside);
    if (mode === 'follow') { order(mode, toOutside ? inside : outside); walkHero(goal); }
    else order(mode, goal);
    await measure('Gate variant ' + level + ' ' + mode + ' ' + (toOutside ? 'outward' : 'inward'), units().length>30?40:22, function () {
      var army = living(); return { crossed: army.filter(function(s) { return isOutside(s.node) === toOutside; }).length, total: army.length, settled:army.filter(function(s){return s.state===0;}).length, furthestGoal: Math.max.apply(null, army.map(function(s) { return dist(s.node,goal); })), furthestSlot:Math.max.apply(null,army.map(function(s){var slot=game._armyFormation&&game._armyFormation.slots.get(s);return slot&&slot.pos?dist(s.node,slot.pos):0;})), positions: army.map(function(s) { var slot=game._armyFormation&&game._armyFormation.slots.get(s); return { id:s.uuid, x:s.node.x, y:s.node.y, state:s.state, slot:slot&&slot.pos, goal:s._navigationState && s._navigationState.goal, index:s._navigationState && s._navigationState.index }; }) };
    });
  }
  async function crossingMatrix() {
    for (var level = 1; level <= 3; level++) {
      await crossing(level,'rally',true,true); await crossing(level,'rally',false,false);
      await crossing(level,'follow',true,false); await crossing(level,'follow',false,false);
    }
  }
  async function respawn() {
    clearCombat();await restoreBuildings();order('rally',outside);
    var checks=phaseChecks=watchCombat();checks.killSix();
    try{await measure('Six deaths, natural timers, intact-gate exterior rally',40,function(){var report=checks.report();return {respawned:report.respawns.respawned,inherited:report.respawns.inherited,crossed:report.respawns.units.filter(function(r){return r.finalAlive&&r.finalOutside;}).length,expected:6,checks:report};});}
    finally{checks.dispose();phaseChecks=null;}
  }
  async function wave(number, multiplier, seconds, renderChecks) {
    clearCombat();await restoreBuildings();
    game.gameData.round = number; game.gameData.enemyQueue = {}; game.gameData.time.MonsterGenerate = 0; game.gameData._liveWaveFinished = false;
    var cfg = game.gameData.levelCfg.WaveCfg[number-1];
    cfg.RefreshSoldierKind.filter(Boolean).forEach(function (entry) { var parts = entry.split('#'); game.gameData.enemyQueue[parts[0]] = parts[1].split(';').map(function(row) { var fields=row.split(','); return {id:+fields[0],num:+fields[1]*multiplier}; }); });
    game.gameData.videoCoin=cfg.CommerceSliver;
    game.gameData.packInterval = multiplier > 1 ? .05 : .5;
    var originalAdd=game.gameData.addEnemy;
    if(multiplier>1)game.gameData.addEnemy=function(enemy){enemy.hp*=20;enemy.hpMax*=20;if(enemy.hpctrl)enemy.hpctrl.setHp(enemy.hp,enemy.hpMax);return originalAdd.apply(this,arguments);};
    placeArmy(inside); order('rally', inside); ui.initView();
    game.ctrPlay.hp = game.ctrPlay.hpMax = 100000; // Explicit fixture modifier; normal damage/attacks.
    if (multiplier > 1) game.gameData.getBulidList().forEach(function(b) { if (b.buildInfo && b.buildInfo.cfg) b.buildInfo.hp = b.buildInfo.hpMax = 100000; });
    var checks=phaseChecks=watchCombat();ui.startRoundGame();await delay(800);
    // startRoundGame refreshes building buff statistics and replaces their HP.
    // Apply the disclosed endurance modifier after that real initialization.
    game.ctrPlay.hp=game.ctrPlay.hpMax=100000;game.ctrPlay.ctrHp.setHp(100000,100000);
    if(multiplier>1)game.gameData.getBulidList().forEach(function(b){if(b.buildInfo&&b.buildInfo.cfg){b.buildInfo.hp=b.buildInfo.hpMax=100000;b.upHpView();}});
    var actions=multiplier>1?[
      {at:4,name:'Rally outside during combat',run:function(){order('rally',outside);}},
      {at:8,name:'Six natural barracks respawns under fire',run:checks.killSix},
      {at:38,name:'Rally inside during combat',run:function(){order('rally',inside);}},
      {at:46,name:'Follow hero walking outside',run:function(){order('follow',inside);walkHero(outside);}},
      {at:64,name:'Follow hero walking back inside',run:function(){walkHero(inside);}},
      {at:80,name:'Final exterior rally',run:function(){order('rally',outside);}}
    ]:null;
    if(actions&&number===10){actions.push({at:60,name:'Real gate destruction and crowd release',run:checks.destroyGate});actions.sort(function(a,b){return a.at-b.at;});}
    try{if(renderChecks){await measure('Render A/B warmup: wave 8 ×5, enemy HP×20',15,null,actions.slice(0,1));await renderAB();}else await measure('Actual wave '+number+(multiplier>1?' ×'+multiplier+' crowd stress, enemy HP×20':' authored composition'),seconds,function(){return {waveFinished:!!game.gameData._liveWaveFinished,fixtureModifiers:{enemyCountMultiplier:multiplier,enemyHealthMultiplier:multiplier>1?20:1,spawnInterval:game.gameData.packInterval,heroHealth:100000,structureHealth:multiplier>1?100000:'authored',unitMovementAndAttacks:'unchanged',respawnTimers:'unchanged'},checks:checks.report()};},actions);}
    finally{game.gameData.addEnemy=originalAdd;checks.dispose();phaseChecks=null;}
  }
  async function renderAB() {
    var depth=game._depthView,depthUpdate=depth&&depth.update,depthHidden=false,overlayStates=[],components=new Map(),hpTimer=null;
    function restoreDepth(){if(!depthHidden)return;cc.director.off(cc.Director.EVENT_BEFORE_DRAW,sortOnly,depth);cc.director.on(cc.Director.EVENT_BEFORE_DRAW,depthUpdate,depth);metrics.restoreRenderTimingOrder();overlayStates.forEach(function(row){if(cc.isValid(row.node))row.node.active=row.active;});depthHidden=false;}
    function sortOnly(){depth.sort();}
    function hideDepth(){if(!depth)return;depthHidden=true;cc.director.off(cc.Director.EVENT_BEFORE_DRAW,depthUpdate,depth);cc.director.on(cc.Director.EVENT_BEFORE_DRAW,sortOnly,depth);metrics.restoreRenderTimingOrder();depth.objects.forEach(function(object){if(object.overlay){overlayStates.push({node:object.overlay.node,active:object.overlay.node.active});object.overlay.node.active=false;}});}
    function hideHealthBars(){[game.ctrPlay].concat(units(),game.gameData.getEnemyList()).forEach(function(actor){var hp=actor.hpctrl||actor.ctrHp;if(!hp||!hp.node)return;hp.node.getComponentsInChildren(cc.Sprite).concat(hp.node.getComponentsInChildren(cc.Label)).forEach(function(component){if(!components.has(component))components.set(component,component.enabled);component.enabled=false;});});}
    function restoreHealthBars(){if(hpTimer!==null){clearInterval(hpTimer);hpTimer=null;}components.forEach(function(enabled,component){if(cc.isValid(component))component.enabled=enabled;});components.clear();}
    function result(mode){return function(){return {renderAB:{mode:mode,healthValuesAndCombat:'unchanged',enemyHealthMultiplier:20,groundDepthSorting:'retained',detailedEngineCPU:environment&&environment.detailedEngineCPU,populationNote:'Compare initial/final and peak unit counts; ongoing combat may change population between phases.'}};};}
    try {
      await measure('Render A/B baseline',20,result('baseline'));
      hideDepth();await measure('Render A/B silhouettes hidden',20,result('silhouettes hidden'));restoreDepth();
      hideHealthBars();hpTimer=setInterval(hideHealthBars,250);await measure('Render A/B health sprites hidden',20,result('health Sprite/Label components hidden'));restoreHealthBars();
      await measure('Render A/B fully restored',20,result('fully restored'));
    } finally {restoreDepth();restoreHealthBars();}
  }
  async function acceptanceSuite() {
    await build(30);await crossingMatrix();await respawn();
    await wave(6,1,60);await wave(8,1,60);await wave(10,1,60);
    await build(60);await crossing(3,'rally',true,true);await crossing(3,'rally',false,false);
    await wave(8,5,90);await wave(10,5,90);
    active='Acceptance suite finished';log(active);
  }
  function start() {
    if (!document.body) return setTimeout(start, 100);
    panel = document.createElement('section'); panel.id = 'live-gate-panel'; panel.style.cssText='position:fixed;left:6px;top:42px;width:430px;max-height:92vh;overflow:auto;z-index:100000;background:#0d1c26ee;color:#fff;padding:9px;box-sizing:border-box;font:13px sans-serif';
    panel.innerHTML='<h2 style="margin:2px 0 8px;font-size:18px">Live gate audit · isolated test save</h2><p>Real Creator physics, rendering, units and respawns. Fixture setup only; normal movement and attacks.</p>';
    document.body.appendChild(panel);
    button('Open test battle',openBattle); button('Build + 30 allies',function(){return build(30);}); button('Build + 60 allies',function(){return build(60);});
    button('Run acceptance suite',acceptanceSuite);
    button('60 allies gate 3 rally pair',async function(){await build(60);await crossing(3,'rally',true,true);await crossing(3,'rally',false,false);});
    button('Run 12 gate crossings',crossingMatrix); button('Test 6 natural respawns',respawn);
    button('Diagnose gate pair',async function(){metrics.setGeometryDiagnostics(true);await crossing(1,'rally',true,true);await crossing(1,'rally',false,false);metrics.setGeometryDiagnostics(false);});
    button('Wave 6 · 60 seconds',function(){return wave(6,1,60);});
    button('Wave 8 · 60 seconds',function(){return wave(8,1,60);});
    button('Wave 10 · 60 seconds',function(){return wave(10,1,60);});
    button('Wave 8 ×5 · 90 seconds',function(){return wave(8,5,90);});
    button('Wave 10 ×5 · 90 seconds',function(){return wave(10,5,90);});
    button('Diagnose wave 8 ×5',async function(){geometryEnabled=true;metrics.setGeometryDiagnostics(true);try{await wave(8,5,90);}finally{geometryEnabled=false;metrics.setGeometryDiagnostics(false);}});
    button('Render A/B checks',renderAB);
    button('Build 60 + render A/B',async function(){await build(60);await wave(8,5,90,true);});
    button('Toggle geometry diagnostics',function(){geometryEnabled=!geometryEnabled;metrics.setGeometryDiagnostics(geometryEnabled);log('Geometry diagnostics '+(geometryEnabled?'on':'off'));},true);
    button('Fit game viewport',fitViewport,true);
    button('Rally outside',function(){order('rally',outside);log('Manual rally outside');},true); button('Rally inside',function(){order('rally',inside);log('Manual rally inside');},true);
    button('Follow outside',function(){order('follow',inside);walkHero(outside);log('Manual follow walking outside');},true); button('Follow inside',function(){order('follow',outside);walkHero(inside);log('Manual follow walking inside');},true);
    status = document.createElement('h3'); status.id='live-status'; panel.appendChild(status);
    progress = document.createElement('pre'); progress.id='live-progress'; progress.style.cssText='white-space:pre-wrap;font:11px monospace'; panel.appendChild(progress);
    var details = document.createElement('details'); var summary=document.createElement('summary'); summary.textContent='Saved results JSON'; details.appendChild(summary); output=document.createElement('pre'); output.id='live-report'; output.style.cssText='white-space:pre-wrap;font:10px monospace'; details.appendChild(output); panel.appendChild(details);
    monitor=setInterval(render,1000); render();
  }
  start();
})();
