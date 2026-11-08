'use strict';
// Explicit browser integration against a running Creator preview. Every run
// uses a fresh private context, muted before navigation, and external artifacts.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');

async function inGameChecks() {
    const request = name => window.__quick_compile_project__.require(name, '');
    const player = request('KinghtFallPlayerMgr').KinghtFallPlayerMgr.getInstance();
    const manager = request('UIMgr').UIMgr.getInstance();
    const config = request('KinghtFallConfig');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const report = window.__shopVerification = { checks: [], errors: [], stage: 'home', ready: false };
    function check(value, name) { if (!value) throw Error(name); report.checks.push(name); }
    async function until(predicate, name) {
        report.stage = name;
        for (let i = 0; i < 300; i++) { const value = predicate(); if (value) return value; await delay(100); }
        throw Error('Timed out: ' + name);
    }
    function tap(node) {
        const point = node.convertToWorldSpaceAR(cc.Vec2.ZERO), touch = new cc.Touch(point.x, point.y, 73);
        touch._setPrevPoint(point.x, point.y);
        touch._startPoint = touch.getLocation().clone();
        [cc.Node.EventType.TOUCH_START, cc.Node.EventType.TOUCH_END].forEach(type => {
            const event = new cc.Event.EventTouch([touch], true); event.type = type; event.touch = touch; node.dispatchEvent(event);
        });
    }
    function find(node, name) {
        if (!node.activeInHierarchy) return null;
        if (node.name === name) return node;
        for (const child of node.children) { const value = find(child, name); if (value) return value; }
        return null;
    }
    try {
        const home = await until(() => manager.getUIById(config.KinghtFallUIID.UIHome), 'Lobby ready');
        await until(() => home.tag1 && home.tagNode && home.tagNode.activeInHierarchy && !manager.isopening, 'Lobby initial tab started');
        player.guideData.setGroupId(9999);
        player.udata.data.maxStage = 1; player.udata.data.curStage = 1;
        player.udata.data.goldNum = 1000000; player.udata.data.diamondNum = 10000;
        player.udata.data.functionUnlockInfo = [1, 1, 1, 1, 1]; player.udata.saveData();
        home.canGuide = false;
        const guide = manager.getUIById(request('Config').UIID.UIGuide);
        if (guide) manager.closeUI(guide.node);
        home.initViewTogg();
        check(home.isLock(4) === false, 'New players can open the installed Shop');
        const toggle = home.togCon.toggleItems[4]; toggle.isChecked = true; home.showView(toggle);
        const shop = await until(() => home.tagNode && home.tagNode.activeInHierarchy && home.tagNode.getComponent(request('KinghtFallHomeShopCtrl').default), 'Shop instantiated');
        await until(() => shop.view && shop.view.ready, 'Persisted stock ready');
        await delay(1000);
        await until(() => Object.keys(shop._iconPending).length === 0, 'Shop artwork and authored button skins loaded');
        window.__shopTest = { shop, player, home, tap, find, report };
        check(shop.tabButtons.length === 4, 'Four inner Shop tabs');
        check(shop.view.relics.length === 12, 'Twelve relic slots');
        check([1, 3, 4].map(q => shop.view.relics.filter(o => o.quality === q).length).join(',') === '2,4,6', 'Two legendary, four rare, six common slots');
        check(new Set(shop.view.relics.map(o => o.relicId)).size === 12, 'Relic stock is distinct');
        const footer = home.node.getChildByName('ndBottom');
        const footerTopWorld = footer.convertToWorldSpaceAR(cc.v2(0, footer.height * (1 - footer.anchorY)));
        const shopFooterTop = shop.scrollNode.parent.convertToNodeSpaceAR(footerTopWorld).y;
        check(Math.abs(shop.scrollNode.y - shop.scrollNode.height / 2 - shopFooterTop) < .5, 'Shop list reaches the footer with no blank strip');
        check(shop.dailyTimer.node.zIndex > shop.dailyTimerStrip.zIndex, 'Daily reset text renders above its strip');
        const dailyNode = shop.daily;
        for (const tab of ['chests', 'relics', 'resources', 'bundles']) {
            shop.selectTab(tab); check(shop.daily === dailyNode && dailyNode.activeInHierarchy, 'Daily Deal pinned on ' + tab);
        }
        const gold = player.udata.getGoldNum(); tap(shop.dailyClaim);
        check(player.udata.getGoldNum() === gold + 500, 'Daily claim credits exactly 500 Gold');
        check(shop.view.dailyDeal.claimed && !shop.dailyClaim._enabled, 'Daily claim becomes disabled with reset timer');
        tap(shop.dailyClaim); check(player.udata.getGoldNum() === gold + 500, 'A second claim grants nothing');
        check(shop.view.bundles.length === 5, 'Five real-money bundle offers');
        check(shop.view.resources.filter(o => o.payment).length === 6, 'Six real-money Gem pack offers');
        check(shop.view.bundles.concat(shop.view.resources.filter(o => o.payment)).every(o => !o.available && !o.payment.available), 'Production checkout stays disabled without a configured store');
        shop.selectTab('bundles');
        const bundle = shop.view.bundles[0]; check(bundle.highlights.length === 3 && bundle.rewards.length > 3, 'Bundle previews are partial');
        tap(find(shop.content, 'ProductImage')); check(!!shop.modal, 'Tapping bundle art opens full contents');
        const list = find(shop.modal, 'ContentsScroll').getComponent(cc.ScrollView).content;
        check(list.children.length === bundle.rewards.length, 'Bundle modal lists every included reward');
        const bundleIntroduction = find(shop.modal, 'Introduction'), bundleScroll = find(shop.modal, 'ContentsScroll');
        check(bundleScroll.y + bundleScroll.height / 2 <= bundleIntroduction.y - bundleIntroduction.height / 2 - 10, 'Bundle contents keep the introduction clear of the first reward row');
        const contentsScroll = bundleScroll.getComponent(cc.ScrollView), contentsCue = find(shop.modal, 'ScrollCue');
        check(contentsCue && contentsCue.active, 'Overflowing bundle contents display a separate down-scroll cue');
        contentsScroll.scrollToBottom(.1);
        await until(() => !contentsCue.active, 'Actual ScrollView node events hide the cue at the bottom');
        check(!contentsCue.active, 'Contents cue hides after actual animated scrolling to the final reward');
        contentsScroll.scrollToTop(.1);
        await until(() => contentsCue.active, 'Actual ScrollView node events restore the cue at the top');
        check(contentsCue.active, 'Contents cue reappears when rewards remain below');
        shop.closeModal();
        shop.selectTab('chests'); check(shop.view.chests.length === 8 && shop.view.chests.every(o => o.highlights.length === 2), 'Eight chests each expose exactly two top possible rewards');
        check(shop.view.chests.map(o => o.draws).join(',') === '2,2,3,3,4,4,5,6', 'Chest base-draw counts match the approved restrained tiers');
        check(shop.view.chests.every(o => o.randomDraws + o.guaranteedDraws.reduce((n, row) => n + row.count, 0) === o.draws), 'Guaranteed rarity draws are included in each chest total');
        const chest = shop.view.chests[0]; shop.contents(chest);
        check(find(shop.modal, 'ContentsScroll').getComponent(cc.ScrollView).content.children.length === chest.rewards.length + chest.possibleRewards.length, 'Chest details include fixed rewards and all per-draw outcomes');
        shop.closeModal();
        shop.selectTab('relics');
        const approvedRelicPrices = { 1: 800, 2: 600, 3: 300, 4: 150 };
        check(shop.view.relics.every(row => row.cost.currency === 2002 && row.cost.amount === approvedRelicPrices[row.quality]), 'All relic tiers use the approved Gem prices');
        const relicCards = shop.content.children.filter(node => node.activeInHierarchy && node.name.startsWith('Offer_'));
        await until(() => relicCards.every(row => { const frame = find(row, 'RarityFrame'); return frame && frame.getComponent(cc.Sprite).spriteFrame; }), 'Authored relic rarity frames loaded');
        check(relicCards.length === 12, 'All twelve stock relics display their authored frames');
        await until(() => relicCards.every(row => { const skin = find(row, 'CardSkin'); return skin && skin.getComponent(cc.Sprite).spriteFrame; }), 'Kit relic card skins loaded');
        const cardFrames = relicCards.map(row => find(row, 'CardSkin').getComponent(cc.Sprite).spriteFrame._uuid);
        check(new Set(cardFrames).size === 1, 'Relic cards share one kit surface while authored frames carry rarity');
        const inspectId = shop.view.relics[0].relicId, originalRelics = JSON.parse(JSON.stringify(player.udata.data.treasureInfo));
        const inspectionStates = [null, { id: inspectId, level: 1, frame: 0 }, { id: inspectId, level: 3, frame: 0 }];
        for (const owned of inspectionStates) {
            player.udata.data.treasureInfo = originalRelics.filter(row => row.id !== inspectId);
            if (owned) player.udata.data.treasureInfo.push(owned);
            player.udata.saveData(); shop.refresh();
            const before = JSON.stringify([player.udata.getGoldNum(), player.udata.getDiamondNum(), player.udata.data.treasureInfo]);
            const card = shop.content.children.find(node => node.activeInHierarchy && node.name === 'Offer_' + shop.view.relics[0].id);
            tap(find(card, 'RarityFrame').parent);
            const details = await until(() => { const panel = manager.getUIById(config.KinghtFallUIID.UITreasureInfo); return panel && !panel.isclose && Object.prototype.hasOwnProperty.call(panel, 'info') && panel; }, 'Shared read-only relic inspection');
            check(details.cfg.ID === inspectId && details.readOnly && !details.btnGold.active, 'Shop uses the shared relic panel without Upgrade for ' + (owned ? 'level ' + owned.level : 'an unowned relic'));
            check(details.node.zIndex > manager.getUIById(config.KinghtFallUIID.UITop).node.zIndex, 'Shared Shop inspection covers the persistent currency and Settings HUD');
            const titleOutline = details.labName.node.getComponent(cc.LabelOutline), titleShadow = details.labName.node.getComponent(cc.LabelShadow);
            const outsideLabel = find(details.node, 'labClose').getComponent(cc.Label), outsideOutline = outsideLabel.node.getComponent(cc.LabelOutline), outsideShadow = outsideLabel.node.getComponent(cc.LabelShadow);
            check(details.labName._uiTypography && titleOutline.width <= 2 && (!titleShadow || !titleShadow.enabled) && !details.labName.enableWrapText, 'Shared relic heading stays sharp and fits one line');
            check(outsideLabel._uiTypography && (!outsideOutline || !outsideOutline.enabled) && (!outsideShadow || !outsideShadow.enabled) && !outsideLabel.enableWrapText, 'Shared outside instruction stays clean and on one line');
            if (!owned) {
                const language = request('LanguageMgr').LanguageMgr.getInstance(), data = request('KinghtFallDataMgr').KinghtFallDataMgr.getInstance();
                for (const relic of data.getTreasureCfg()) {
                    const name = language.t(data.getGoodsCfgById(relic.goodID).name);
                    details.labName.string = name; await delay(35);
                    check(details.labName.actualFontSize >= 67 && details.labName.overflow === cc.Label.Overflow.CLAMP, 'Shared title retains readable authored size for ' + name + ' (actual=' + details.labName.actualFontSize + ', configured=' + details.labName.fontSize + ', overflow=' + details.labName.overflow + ')');
                }
                details.labName.string = language.t(data.getGoodsCfgById(details.cfg.goodID).name);
            }
            details.onGoldBtnClick();
            check(JSON.stringify([player.udata.getGoldNum(), player.udata.getDiamondNum(), player.udata.data.treasureInfo]) === before, 'Relic inspection cannot spend, buy, unlock or upgrade');
            details.closeUI();
            await until(() => !manager.getUIById(config.KinghtFallUIID.UITreasureInfo), 'Relic panel closed');
        }
        player.udata.data.treasureInfo = originalRelics; player.udata.saveData(); shop.refresh();
        const shopLabels = shop.node.getComponentsInChildren(cc.Label).filter(label => label.node.activeInHierarchy && label._shopTypography);
        check(shopLabels.length > 20 && shopLabels.every(label => { let card = label.node; while (card && !card._kitCard) card = card.parent; const outline = label.node.getComponent(cc.LabelOutline), shadow = label.node.getComponent(cc.LabelShadow); return (!outline || !outline.enabled || outline.width <= (card || label === shop.title ? 3 : 2)) && (!shadow || !shadow.enabled); }), 'Shop typography keeps controlled kit strokes and no hard shadows');
        const slot = shop.view.relics[0], beforeOrder = shop.view.relics.map(o => o.relicId).join(',');
        shop.buy('relics', slot, shop.view.token); check(!!shop.modal, 'Relic purchase requests confirmation'); tap(find(shop.modal, 'Confirm'));
        check(shop.view.relics[0].soldOut && shop.view.relics.map(o => o.relicId).join(',') === beforeOrder, 'Purchase marks the same slot sold without replacing stock');
        const gems = player.udata.getDiamondNum(); tap(find(shop.content, 'RefreshRelics'));
        check(player.udata.getDiamondNum() === gems && shop.view.refresh.used === 1, 'First manual refresh is free');
        check(shop.view.relics.every(o => !o.soldOut) && shop.view.dailyDeal.claimed, 'Refresh restores all relic slots but keeps the shared daily claim');
        check(shop.view.refresh.cost.amount === 10, 'Second refresh quote costs 10 Gems');
        tap(find(shop.content, 'RefreshRelics')); check(!!shop.modal, 'Paid refresh requests confirmation'); tap(find(shop.modal, 'Confirm'));
        check(player.udata.getDiamondNum() === gems - 10 && shop.view.refresh.used === 2, 'Confirmed second refresh debits exactly 10 Gems');
        shop.selectTab('resources'); check(shop.view.resources.length === 14, 'Four Gold, four Energy and six Gem packages');
        check(shop.view.resources.every(o => !o.cost || o.cost.currency === 2002), 'The old Gold-to-Gem exchange is absent');
        check(shop.content.children.filter(n => n.activeInHierarchy && n.name.indexOf('Offer_') === 0).every(n => !!find(n, 'PackageQuantity')), 'Resource cards expose package amounts');
        const refill = shop.view.resources.find(o => o.rewards.some(r => r.id === 2033));
        const itemCount = player.udata.data.energyItems || 0, power = player.udata.data.powerNum, gemCount = player.udata.getDiamondNum();
        shop.buy('resources', refill, shop.view.token); tap(find(shop.modal, 'Confirm'));
        check(player.udata.data.energyItems === itemCount + 1 && player.udata.data.powerNum === power, 'Shop Energy item goes to inventory without an immediate refill');
        check(player.udata.getDiamondNum() === gemCount - refill.cost.amount, 'Energy item purchase debits the confirmed Gem price');
        const items = request('EnergyItems').create(player), itemToken = items.getView().token;
        check(items.useOne(itemToken).ok && player.udata.data.energyItems === itemCount && player.udata.data.powerNum === power + 20, 'One stored item consumes once and credits 20 Energy');
        check(!items.useOne(itemToken).ok && player.udata.data.powerNum === power + 20, 'Duplicate Energy item token cannot refill again');
        check(request('KinghtFallDataMgr').KinghtFallDataMgr.getInstance().getParamsCfgById(60005) === '20,15', 'Direct Gem Energy refill is aligned to 20 while ad refill remains 15');

        // This adapter exists only inside this verifier's private browser
        // context. The production singleton stays unconfigured throughout.
        const data = request('KinghtFallDataMgr').KinghtFallDataMgr.getInstance();
        const catalog = request('ShopCatalog').create(data), accountId = 'private-browser-shop-test';
        const paidOffers = catalog.bundles.concat(catalog.resources.filter(o => o.payment));
        const completed = Object.create(null), receipts = Object.create(null), intents = Object.create(null);
        let serial = 0, pendingReceipts = [];
        const payments = request('ShopPayments').create({
            accountId,
            store: {
                getProducts: async ids => ids.map(productId => {
                    const offer = paidOffers.find(o => o.payment.productId === productId);
                    return { productId, currency: 'USD', formattedPrice: '$' + (offer.payment.priceMinor / 100).toFixed(2) };
                }),
                purchase: async (productId, intent) => {
                    const transaction = { status: 'purchased', productId, intentId: intent.intentId, transactionId: 'private-browser-receipt-' + (++serial) };
                    pendingReceipts.push(transaction); return transaction;
                },
                getPendingPurchases: async () => pendingReceipts.slice(),
                finish: async transaction => { pendingReceipts = pendingReceipts.filter(row => row.transactionId !== transaction.transactionId); }
            },
            authorizePurchase: async context => {
                const purchaseNumber = (completed[context.productId] || 0) + 1;
                const intentId = 'private-browser-intent-' + (++serial); intents[intentId] = { productId: context.productId, purchaseNumber };
                return { allowed: true, intentId, accountId, productId: context.productId, purchaseNumber };
            },
            verifyPurchase: async transaction => {
                if (!receipts[transaction.transactionId]) {
                    const intent = intents[transaction.intentId]; if (!intent || intent.productId !== transaction.productId) throw Error('Unknown private test intent');
                    receipts[transaction.transactionId] = { status: 'verified', receiptId: transaction.transactionId, accountId, productId: transaction.productId, purchaseNumber: intent.purchaseNumber, firstPurchase: intent.purchaseNumber === 1 };
                    completed[transaction.productId] = Math.max(completed[transaction.productId] || 0, intent.purchaseNumber);
                }
                return receipts[transaction.transactionId];
            }
        });
        const originalService = shop.service;
        const paidService = request('ShopRuntime').create(player, data, { payments });
        await paidService.loadProducts(); shop.service = paidService; shop._renderToken = null; shop.refresh();
        async function paidClick(kind, id) {
            shop.selectTab(kind); shop.refresh();
            const offer = shop.view[kind].find(o => o.id === id);
            check(offer.available && !!offer.payment.formattedPrice, 'Private test store enables ' + id + ' at a localized price');
            shop.buy(kind, offer, shop.view.token);
            if (shop.modal) tap(find(shop.modal, 'Confirm'));
            await until(() => !shop._acting, 'Private checkout completed: ' + id);
            shop.refresh(); return shop.view[kind].find(o => o.id === id);
        }
        for (const offer of catalog.bundles) {
            let result = await paidClick('bundles', offer.id);
            check(result.purchaseCount === 1, offer.id + ' records its first lifetime purchase');
            result = await paidClick('bundles', offer.id);
            check(result.purchaseCount === 2 && result.soldOut && !result.available, offer.id + ' becomes sold out at two purchases');
            const charged = serial, blocked = await paidService.purchase('bundles', offer.id, paidService.getView().token);
            check(!blocked.ok && blocked.code === 'purchaseLimit' && serial === charged, offer.id + ' rejects a third purchase before checkout');
        }
        for (const offer of catalog.resources.filter(o => o.payment)) {
            const before = player.udata.getDiamondNum(), amount = offer.rewards[0].num;
            let result = await paidClick('resources', offer.id);
            check(player.udata.getDiamondNum() === before + amount * 2 && !result.firstPurchaseAvailable, offer.id + ' grants exactly double its full first amount');
            await paidClick('resources', offer.id);
            check(player.udata.getDiamondNum() === before + amount * 3, offer.id + ' later purchase grants its normal amount');
        }
        shop.selectTab('chests'); shop.refresh();
        const banked = shop.view.chests.find(o => o.id === 'wooden-chest'), beforeOpenGems = player.udata.getDiamondNum();
        check(banked.ownedCount === 2, 'Two starter bundles bank two unopened Wooden Chests');
        const openToken = shop.view.token; tap(find(shop.content, 'OpenOwned_wooden-chest'));
        check(shop.view.chests[0].ownedCount === 1 && player.udata.getDiamondNum() === beforeOpenGems, 'Open owned chest consumes one token without spending Gems');
        check(paidService.openChest('wooden-chest', openToken).code === 'stale', 'Repeated old Open token cannot consume another chest');
        let baseDraws = 0, recordedDraws = 0;
        for (const template of catalog.chests) {
            // A completed quest intentionally stops counting until claimed.
            // Give each chest a fresh active quest in this private fixture.
            player.missionData.data.taskInfo = { id: 6, type: 7, num: 0, stage: 0 };
            delete player.missionData.data.quests; delete player.missionData.data.questCursor; player.missionData.saveData();
            shop.refresh(); const offer = shop.view.chests.find(o => o.id === template.id), before = player.udata.getDiamondNum(), owned = offer.ownedCount;
            shop.buy('chests', offer, shop.view.token); tap(find(shop.modal, 'Confirm'));
            check(player.udata.getDiamondNum() === before - offer.cost.amount && shop.view.chests.find(o => o.id === offer.id).ownedCount === owned, offer.id + ' Gem purchase opens immediately at the exact price');
            baseDraws += offer.draws;
            recordedDraws += player.missionData.data.quests.find(row => row.id === 6).num;
        }
        check(recordedDraws === baseDraws, 'All eight chest base-draw totals advance an active quest, excluding Rune extras');
        check(pendingReceipts.length === 0, 'Every private test receipt is durably delivered before acknowledgement');
        shop.service = originalService; shop._renderToken = null; shop.refresh();
        check(shop.view.bundles.every(o => o.soldOut && o.purchaseCount === 2), 'Lifetime bundle caps remain when returning to production-disabled checkout');
        check(!request('ShopPayments').getInstance().describe(catalog.bundles[0].payment).available, 'The production payment singleton remains unconfigured');
        report.simulatedStore = true;
        player.udata.data.maxStage = 20; player.udata.saveData(); home.initViewTogg();
        const gearToggle = home.togCon.toggleItems[0]; gearToggle.isChecked = true; home.showView(gearToggle);
        const gear = await until(() => home.tagNode && home.tagNode.getComponent(request('KinghtFallHomePersonCtrl').default), 'Gear page ready');
        await until(() => gear._homeTabReady && gear.scrView, 'Gear layout initialized');
        const gearViewport = gear.scrView.content.parent, gearBottom = gearViewport.convertToWorldSpaceAR(cc.v2(0, -gearViewport.height * gearViewport.anchorY)).y;
        check(Math.abs(gearBottom - footerTopWorld.y) < .5, 'Gear list reaches the same footer edge without a blank strip');
        window.__shopTest.gear = gear;
        toggle.isChecked = true; home.showView(toggle);
        await until(() => shop.node.activeInHierarchy, 'Return to Shop after Gear footer check');
        shop.refresh();
        request('LanguageMgr').LanguageMgr.getInstance().setCurrentLanguage('zh'); await delay(400);
        check(shop.title.string === '商店', 'Shop copy switches to Chinese');
        shop.selectTab('bundles'); shop.contents(shop.view.bundles[0]);
        const chineseContents = find(shop.modal, 'ContentsScroll').getComponent(cc.ScrollView).content.children.map(row => find(row, 'Reward').getComponent(cc.Label).string).join('\n');
        check(chineseContents.includes('金币') && chineseContents.includes('钻石'), 'Chinese bundle contents use the authored Gold and Gems names');
        shop.closeModal();
        request('LanguageMgr').LanguageMgr.getInstance().setCurrentLanguage('en'); await delay(400);
        check(shop.title.string === 'Shop', 'Shop copy switches back to English');
        report.ready = true; report.stage = 'ready-for-captures';
    } catch (error) { report.errors.push(error.stack || String(error)); report.stage = 'failed'; }
    return report;
}

async function main() {
    const outArg = process.argv.indexOf('--out');
    const out = path.resolve(outArg < 0 ? path.join(os.homedir(), 'Documents/Codex Artifacts/HeroKingdomDefense', new Date().toISOString().slice(0, 10) + '-shop-implementation', 'browser-' + Date.now()) : process.argv[outArg + 1]);
    if (out === root || out.startsWith(root + path.sep)) throw Error('Verification artifacts must be outside the project');
    if (fs.existsSync(path.join(out, 'browser-result.json'))) throw Error('Use a fresh output folder');
    fs.mkdirSync(out, { recursive: true });
    const playwright = process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), 'Documents/Codex Artifacts/HeroKingdomDefense/cleanup-2026-11-07/local/gear-concepts-20261107/browser/node_modules/playwright-core');
    const { chromium } = require(playwright);
    let browser, page;
    const errors = [], warnings = [];
    try {
        browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] });
        const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1 });
        page = await context.newPage();
        page.on('pageerror', error => errors.push(error.stack || error.message));
        page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
        await page.addInitScript(() => {
            ['MUSIC', 'EFFECT', 'MUSICVOLUME', 'EFFECTVOLUME'].forEach(key => localStorage.setItem(key, '0'));
            document.addEventListener('DOMContentLoaded', () => {
                const style = document.createElement('style'); style.textContent = '.toolbar{display:none!important}.content{top:0!important;height:100%!important}'; document.head.appendChild(style);
            });
        });
        await page.goto(process.env.COCOS_PREVIEW_URL || 'http://127.0.0.1:7456/', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => window.cc && cc.director && window.__quick_compile_project__, null, { timeout: 90000 });
        await page.waitForFunction(() => window.cc && cc.director && cc.director.getScene(), null, { timeout: 90000 });
        await page.evaluate(() => {
            const request = name => window.__quick_compile_project__.require(name, '');
            cc.audioEngine.stopAll(); cc.audioEngine.play = cc.audioEngine.playMusic = cc.audioEngine.playEffect = () => -1;
            const player = request('KinghtFallPlayerMgr').KinghtFallPlayerMgr.getInstance(), original = player.preload;
            player.preload = function (done) { original.call(this); this.guideData.setGroupId(9999); this.udata.data.functionUnlockInfo = [1, 1, 1, 1, 1]; this.udata.data.maxStage = 1; this.udata.saveData(); if (done) done(); };
            const ui = request('UIMgr').UIMgr.getInstance();
            const start = cc.director.getScene().getComponentsInChildren(request('StartScreen'))[0];
            if (start) start.beginLoading();
            else if (!ui.getUIById(request('KinghtFallConfig').KinghtFallUIID.UIHome)) cc.director.loadScene('loading');
        });
        const result = await page.evaluate(inGameChecks);
        if (result.ready) {
            // Direct node.dispatchEvent bypasses hit-testing. Use actual browser
            // pointer input to ensure a modal blocks the persistent chrome.
            const canvas = await page.locator('#GameCanvas').boundingBox();
            const targets = await page.evaluate(() => {
                const t = window.__shopTest, request = name => window.__quick_compile_project__.require(name, '');
                const manager = request('UIMgr').UIMgr.getInstance(), config = request('KinghtFallConfig');
                t.shop.selectTab('bundles'); t.shop.contents(t.shop.view.bundles[0]);
                window.__shopModalInput = { modal: t.shop.modal, tag: t.home.tag };
                const origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
                const point = node => { const p = node.convertToWorldSpaceAR(cc.Vec2.ZERO); return { x: (p.x - origin.x) / size.width, y: 1 - (p.y - origin.y) / size.height }; };
                return [point(t.home.togCon.toggleItems[2].node), point(manager.getUIById(config.KinghtFallUIID.UITop).btnSetting)];
            });
            await page.waitForTimeout(300);
            for (const [index, target] of targets.entries()) {
                await page.mouse.click(canvas.x + target.x * canvas.width, canvas.y + target.y * canvas.height); await page.waitForTimeout(250);
                await page.evaluate(index => {
                    const t = window.__shopTest, original = window.__shopModalInput, request = name => window.__quick_compile_project__.require(name, '');
                    if (t.shop.modal !== original.modal || !t.shop.node.activeInHierarchy || t.home.tag !== original.tag || request('UIMgr').UIMgr.getInstance().getUIById(request('KinghtFallConfig').KinghtFallUIID.UISetting)) throw Error('Modal pointer input reached ' + (index ? 'Settings' : 'footer navigation'));
                    t.report.checks.push('Real pointer input is blocked over ' + (index ? 'Settings' : 'footer navigation') + ' while Shop contents are open');
                }, index);
            }
            const closePoint = await page.evaluate(() => {
                const t = window.__shopTest, origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize(), p = t.find(t.shop.modal, 'Close').convertToWorldSpaceAR(cc.Vec2.ZERO);
                return { x: (p.x - origin.x) / size.width, y: 1 - (p.y - origin.y) / size.height };
            });
            await page.mouse.click(canvas.x + closePoint.x * canvas.width, canvas.y + closePoint.y * canvas.height); await page.waitForTimeout(200);
            await page.evaluate(() => { const t = window.__shopTest; if (t.shop.modal) throw Error('Real Close pointer did not release Shop modal'); t.report.checks.push('Actual Close pointer releases the detached overlay'); });
            // Exercise the new card hit areas with actual pointer hit-testing,
            // including transparent art containers and the separate footer.
            for (const [tab, target] of [['bundles', 'ProductImage'], ['chests', 'FullContents']]) {
                await page.evaluate(tab => { const s = window.__shopTest.shop; s.selectTab(tab); s.scroll.scrollToTop(0); }, tab);
                await page.waitForTimeout(250);
                const point = await page.evaluate(name => {
                    const t = window.__shopTest, row = t.shop.content.children.find(n => n.activeInHierarchy && n.name.startsWith('Offer_'));
                    const p = t.find(row, name).convertToWorldSpaceAR(cc.Vec2.ZERO), origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
                    return { x: (p.x - origin.x) / size.width, y: 1 - (p.y - origin.y) / size.height };
                }, target);
                await page.mouse.click(canvas.x + point.x * canvas.width, canvas.y + point.y * canvas.height);
                await page.waitForFunction(() => !!window.__shopTest.shop.modal);
                await page.evaluate(name => { const t = window.__shopTest; t.report.checks.push('Actual pointer opens contents through ' + name); t.shop.closeModal(); }, tab + '/' + target);
            }
            for (const tab of ['bundles', 'chests', 'relics', 'resources']) {
                await page.evaluate(tab => { window.__shopTest.shop.selectTab(tab); window.__shopTest.shop.scroll.scrollToTop(0); }, tab);
                await page.waitForTimeout(700); await page.locator('#GameCanvas').screenshot({ path: path.join(out, 'shop-' + tab + '.png') });
            }
            // Probe actual engine transforms after device resize, including
            // the small phone size where selectively scaled headers overlapped.
            for (const [width, height] of [[320, 568], [375, 667], [430, 932], [768, 1024]]) {
                await page.setViewportSize({ width, height }); await page.waitForTimeout(500);
                for (const tab of ['bundles', 'chests', 'relics', 'resources']) {
                    await page.evaluate(tab => { const s = window.__shopTest.shop; s.selectTab(tab); s.scroll.scrollToTop(0); }, tab);
                    await page.waitForTimeout(400);
                    await page.evaluate(({ width, height, tab }) => {
                        const { shop, home, report } = window.__shopTest;
                        const rect = (n, parent) => {
                            const a = parent.convertToNodeSpaceAR(n.convertToWorldSpaceAR(cc.v2(-n.width * n.anchorX, -n.height * n.anchorY)));
                            const b = parent.convertToNodeSpaceAR(n.convertToWorldSpaceAR(cc.v2(n.width * (1 - n.anchorX), n.height * (1 - n.anchorY))));
                            return { left: a.x, right: b.x, bottom: a.y, top: b.y };
                        };
                        const footer = home.node.getChildByName('ndBottom'), edge = shop.surface.convertToNodeSpaceAR(footer.convertToWorldSpaceAR(cc.v2(0, footer.height * (1 - footer.anchorY)))).y;
                        if (Math.abs(rect(shop.scrollNode, shop.surface).bottom - edge) > .5) throw Error('Footer gap at ' + width + '×' + height);
                        const rows = shop.content.children.filter(n => n.activeInHierarchy && n.name.startsWith('Offer_'));
                        for (const row of rows) {
                            const headerNode = row.getChildByName('Header'), header = rect(headerNode, row), art = rect(row.getChildByName('ProductImage'), row);
                            const buy = rect(row.getChildByName('Buy_' + row.name.slice(6)), row);
                            const card = rect(row, row);
                            if (headerNode.activeInHierarchy && art.top > header.bottom + .5 || art.bottom < card.bottom - .5 || art.left < card.left - .5 || art.right > card.right + .5 || buy.bottom < card.bottom - .5) throw Error('Card bounds at ' + width + '×' + height + ' ' + row.name);
                            const quantity = row.getChildByName('PackageQuantity');
                            if (quantity && quantity.activeInHierarchy) {
                                const amount = rect(quantity, row);
                                if (!(art.right <= amount.left || art.left >= amount.right || art.top <= amount.bottom || art.bottom >= amount.top)) throw Error('Artwork overlaps quantity at ' + width + '×' + height + ' ' + row.name);
                            }
                            if (!(art.right <= buy.left || art.left >= buy.right || art.top <= buy.bottom || art.bottom >= buy.top)) throw Error('Artwork covers purchase at ' + width + '×' + height);
                            // A SHRINK label can fit its node while silently
                            // becoming unreadable. Check the actual engine font
                            // size after layout, not only the containing boxes.
                            for (const name of ['FullContents', 'TopPossibleRewards', 'PurchaseCount', 'EnergyTotal']) {
                                const item = row.getChildByName(name);
                                if (!item) continue;
                                const label = item.caption || item.getComponent(cc.Label);
                                if (label.node.height + .5 < label.lineHeight || label.actualFontSize < Math.floor(label.fontSize * .95)) throw Error('Card support text shrank at ' + width + '×' + height + ' ' + row.name + '/' + name + ': ' + label.actualFontSize + '/' + label.fontSize);
                            }
                        }
                        const first = rect(rows[0], shop.viewport), view = rect(shop.viewport, shop.viewport);
                        if (first.bottom >= view.top || first.top <= view.bottom) throw Error('Blank tab after resize: ' + tab);
                        if (tab === 'bundles' || tab === 'relics') {
                            for (const row of rows.slice(0, tab === 'relics' ? 2 : 1)) {
                                const control = row.getChildByName('Buy_' + row.name.slice(6)), action = rect(control, shop.viewport);
                                if (shop.content.getChildByName('StoreNotice')) {
                                    // Paid test receipts bind this private save
                                    // to their account. Returning to the disabled
                                    // provider correctly adds a recovery notice;
                                    // prove its extra row leaves actions reachable.
                                    shop.scroll.scrollToOffset(cc.v2(0, Math.max(0, view.bottom - action.bottom + 8)), 0);
                                    const scrolled = rect(control, shop.viewport);
                                    if (scrolled.bottom < view.bottom - .5 || scrolled.top > view.top + .5) throw Error('Recovery notice leaves purchase unreachable at ' + width + '×' + height);
                                    shop.scroll.scrollToTop(0);
                                } else if (action.bottom < view.bottom - .5 || action.top > view.top + .5) throw Error('First purchase hidden below fold at ' + width + '×' + height + ' ' + row.name);
                            }
                        }
                        report.checks.push(width + '×' + height + ' ' + tab + ': visible products, separated artwork and exact footer');
                    }, { width, height, tab });
                    await page.locator('#GameCanvas').screenshot({ path: path.join(out, `shop-${tab}-${width}x${height}.png`) });
                }
            }
            await page.setViewportSize({ width: 375, height: 667 }); await page.waitForTimeout(500);
            await page.evaluate(() => { const s = window.__shopTest.shop; s.selectTab('bundles'); s.contents(s.view.bundles[0]); });
            await page.waitForTimeout(400); await page.locator('#GameCanvas').screenshot({ path: path.join(out, 'shop-bundle-contents.png') });
            await page.evaluate(() => {
                const s = window.__shopTest.shop; s.closeModal();
                s.confirm('shop.confirm.gems', ['Celestial Hourglass', 800], () => { throw Error('Visual confirmation audit cannot purchase'); }, 2500);
            });
            await page.waitForTimeout(200); await page.locator('#GameCanvas').screenshot({ path: path.join(out, 'shop-conversion-confirmation.png') });
            await page.evaluate(() => { const t = window.__shopTest; t.shop.closeModal(); t.home.togCon.toggleItems[0].isChecked = true; t.home.showView(t.home.togCon.toggleItems[0]); });
            await page.waitForTimeout(400);
            await page.evaluate(() => window.__shopTest.gear.scrView.scrollToBottom(0));
            await page.waitForTimeout(300); await page.locator('#GameCanvas').screenshot({ path: path.join(out, 'gear-footer.png') });
        } else await page.screenshot({ path: path.join(out, 'failure.png') });
        result.checks = await page.evaluate(() => window.__shopTest ? window.__shopTest.report.checks : window.__shopVerification.checks);
        result.pageErrors = errors; result.warnings = warnings; result.mutedBeforeNavigation = true;
        result.sourceHashes = Object.fromEntries(['ShopCore', 'ShopCatalog', 'ShopCommerce', 'ShopPayments', 'ShopRuntime', 'ShopViewCore', 'KinghtFallHomeShopCtrl', 'KinghtFallUIHome', 'KinghtFallHomePersonCtrl', 'KinghtFallUITreasureInfo', 'LanguageMgr'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'))).digest('hex')]));
        fs.writeFileSync(path.join(out, 'browser-result.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ out, checks: result.checks.length, errors: result.errors, pageErrors: errors, warningCount: warnings.length, warnings: Array.from(new Set(warnings)).slice(0, 8) }));
        if (!result.ready || result.errors.length || errors.length) process.exitCode = 1;
    } catch (error) {
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack || String(error), pageErrors: errors, warnings }, null, 2));
        if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        throw error;
    } finally { if (browser) await browser.close(); fs.writeFileSync(path.join(out, 'session-closed.json'), JSON.stringify({ closedAt: Date.now(), browser: true })); }
}
module.exports = { inGameChecks };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
