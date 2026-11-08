# Shop

The lobby Shop contains Bundles, Chests, Relics and Resources. Its prefab is assigned to `KinghtFallUIHome.preShop`; this replaces the unavailable placeholder without changing the other four tabs' progression requirements.

## Daily deal and stock

The same free 500-Gold Daily Deal appears above every category. Claiming it once disables it everywhere until the next local calendar midnight. The countdown uses the next midnight rather than a fixed 24-hour duration, including daylight-saving changes.

Relic stock contains twelve distinct relics: two orange legendary, four blue rare and six green common. The authored relic quality numbers are respectively **1, 3 and 4**. Purple quality 2 relics are not part of this daily stock. Every slot can be purchased once per stock rotation. A sold slot retains its relic and position until the daily restock or a manual refresh.

Manual refresh replaces all twelve slots, makes them purchasable again and changes each slot's relic when alternatives are available. It does not reset the shared Daily Deal. A relic may appear in another slot or a later rotation. Automatic daily restocking does not consume a manual refresh.

| Manual refresh each day | Gem cost |
| --- | ---: |
| 1 | Free |
| 2 | 10 |
| 3 | 20 |
| 4 | 30 |
| 5 | 40 |
| 6 | 50 |
| 7 | 75 |
| 8 | 100 |
| 9 | 125 |
| 10 | 150 |

The maximum is ten manual refreshes per day, including the free refresh; all ten cost 600 Gems in total. Paid refreshes require confirmation. The next local daily reset restores the free refresh and quota. Moving the clock backwards does not rearm saved daily claims or refreshes.

## Offers and rewards

`assets/_script/ShopCatalog.js` defines all five paid bundles, eight Gem-priced chests and fourteen resource packs. Existing Goods IDs, relic unlocks, fragments and overflow conversions remain in use. Relic stock prices are 1,000 Gold for common, 50 Gems for rare and 200 Gems for legendary. Fully collected fixed relics display their configured Gold conversion before purchase, including a warning before paid bundle checkout.

Bundle cards show a featured fixed relic, chest quantity and Gem quantity. Selecting the artwork opens the complete contents; selecting an included chest opens that chest's full reward and probability list. Every bundle has a permanent two-purchase limit, with a 0/2, 1/2 or sold-out 2/2 counter. Bundle Gem rewards never receive the separate Gem-pack first-purchase multiplier.

| Bundle | Reference USD price | Fixed relics (one copy each) | Chest tokens | Gems | Gold | Energy Drinks |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| Archer Starter | 1.99 | Deadly Arrowhead, Farsight Scope | Wooden ×1 | 50 | 5,000 | 2 |
| Guard Kit | 4.99 | Guardian Shield, Windstride Boots | Iron ×1 | 250 | 10,000 | 3 |
| Royal Archer | 9.99 | Emblem of Wealth, Rapidfire Charm, Deadly Arrowhead | Silver ×2 | 500 | 25,000 | 5 |
| King's War Chest | 19.99 | Revive Token, Doubling Rune, Ancestral Pact | Knight ×3 | 1,200 | 60,000 | 8 |
| Crown Treasury | 49.99 | Slowing Charm, Emblem of Wealth, Doubling Rune | Epic ×3 | 3,500 | 200,000 | 16 |

Chest cards show two highest-tier **possible** rewards, not a guaranteed pair. Buying a chest with Gems opens it immediately. Chests included in bundles remain unopened inventory tokens, with a separate Open button and owned count. Opening one consumes one token without spending Gems. Its fixed rewards, randomized relics, Rune bonuses, quest progress and token debit share one recoverable transaction.

| Chest | Gems | Gold | Energy Drinks | Total base relic draws | Guaranteed rarity draws | Remaining draws: common/rare/epic/legendary |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Wooden | 75 | 500 | 1 | 2 | None | 90/10/0/0% |
| Iron | 150 | 1,500 | 2 | 2 | 1 rare | 70/25/5/0% |
| Silver | 225 | 3,000 | 3 | 3 | 1 rare | 50/40/9/1% |
| Knight | 375 | 6,000 | 5 | 3 | 1 epic | 30/50/18/2% |
| Royal | 650 | 14,000 | 8 | 4 | 1 epic | 15/45/35/5% |
| Epic | 1,300 | 35,000 | 18 | 4 | 2 epic | 0/40/50/10% |
| Legendary | 2,100 | 60,000 | 30 | 5 | 1 legendary | 0/20/75/5% |
| Crown | 3,300 | 100,000 | 48 | 6 | 1 legendary | 0/0/90/10% |

Guaranteed rarity draws are included in the total base count. Remaining draws first choose a rarity by the listed percentages, then choose uniformly among that rarity's authored relics. The size of a rarity's collection does not change its total probability. Repeated results follow the existing fragment/overflow rules. Each base draw counts toward the existing draw quest. It grants the relic before checking the authored Doubling Rune bonus, so a Rune unlocked during the chest can enable a bonus immediately. Bonus copies do not add quest draws. Fixed bundle relics and direct relic purchases do not trigger this draw bonus. Legacy chest draws and pity counters are unchanged.

Gold packs cost 50/150/500/1,000 Gems for 5,000/15,000/50,000/100,000 Gold. Stored Energy packs cost 50/135/250/450 Gems for 1/3/6/12 Drinks. The repeatable Gold-to-Gem exchange has been removed from the shop.

| Gem pack | Reference USD price | Normal Gems | First purchase |
| --- | ---: | ---: | ---: |
| Gems 100 | 0.99 | 100 | 200 |
| Gems 550 | 4.99 | 550 | 1,100 |
| Gems 1,200 | 9.99 | 1,200 | 2,400 |
| Gems 2,600 | 19.99 | 2,600 | 5,200 |
| Gems 7,000 | 49.99 | 7,000 | 14,000 |
| Gems 15,000 | 99.99 | 15,000 | 30,000 |

The first purchase doubles the full normal amount once per SKU, independently of other packs. The badge and received amount update after verified fulfillment. A stale cross-device first-bonus quote is corrected before checkout can charge for a smaller award.

Goods 2033 (`EnergyItem`) is a banked consumable, separate from current Energy (2005). Shop awards increase the owned item count without refilling Energy immediately. The Energy+ popup shows that count and consumes one item for a full 20 Energy through `EnergyItems.js`, including above the natural regeneration cap. Consumption and the Energy credit are journaled together; repeated callbacks and stale inventory tokens cannot consume twice. The direct 50-Gem refill now grants 20 Energy, matching one Drink; the ad refill remains 15. Natural regeneration and its cap are unchanged.

Generic rewards, authored battle rewards (including the existing double-ad settlement) and explicit Testing-tool grants all support the same stored item. Testing status exposes its owned count separately from currencies; merely opening the panel does not grant or consume it. No existing campaign reward amounts were changed.

## Store integration

Real-money checkout is intentionally disabled until the release store is selected and configured. All paid offers are visible with clearly labeled USD reference prices; only actual localized store metadata can enable checkout. Test Mode does not bypass payment verification or grant paid products.

`ShopPayments.js` is the store/backend boundary. Platform startup may explicitly call `ShopPayments.configure(options)` with:

- `accountId`: the authenticated game account that owns the loaded save.
- `store.getProducts(productIds)`: returns `{productId, formattedPrice, currency}` rows from the store. Currency is its three-letter code; the displayed price is never computed from the reference price.
- `authorizePurchase({accountId, productId, purchaseLimit, expectedFirstPurchase})`: checks eligibility and **atomically reserves** the lifetime purchase ordinal before charging. A successful result includes `{allowed:true, intentId, accountId, productId, purchaseNumber}`. The backend must bind that ordinal to its intent until verification. Denied results may include trusted `purchaseCount` and `firstPurchaseAvailable` for updated display.
- `cancelAuthorization(intent)`: releases an unused intent when the displayed quote changes. The backend must also expire abandoned reservations.
- `store.purchase(productId, {intentId, accountId})`: launches the real store flow. It returns `{status, transactionId, productId, intentId, ...receiptPayload}`; only status `purchased` proceeds to verification. Store bridge implementations must preserve unfinished transactions across restarts.
- `verifyPurchase(transaction, context)`: verifies the actual store receipt server-side, checks its account/product/intent binding and returns `{status:"verified", receiptId, accountId, productId, purchaseNumber}`. Each product's ordinal and canonical receipt identity must be stable on retries. Client booleans or store success callbacks are insufficient proof.
- `store.getPendingPurchases()`: returns unfinished transactions for recovery.
- `store.finish(transaction)`: consumes/acknowledges the store purchase **after** the durable game fulfillment succeeds. Reject or return `false`/`{ok:false}` if acknowledgement needs retrying.

Product IDs are `hkd.bundle.<bundle-id>` for bundles and `hkd.gems.<normal-quantity>` for Gem packs. Neither the reference price nor client-provided reward quantities are a payment instruction. Backend verification must use the configured store product catalog.

The adapter checks the preflight ordinal against both the bundle cap and displayed Gem bonus before launching checkout, and checks verification against that same reserved ordinal. The runtime accepts only private verified-entitlement capabilities from the adapter. It independently journals canonical receipt IDs and per-SKU ordinals, so duplicated or restored callbacks cannot grant twice. Restores can arrive out of order; the original verified first purchase still gets its fixed double award. Local lifetime records supplement the server's account-level eligibility checks and cannot replace them across devices or reinstalls.

Opening the shop or pressing Retry purchases loads product metadata and restores unfinished purchases. Timer ticks do not make network requests. Pending store approval disables further paid checkout, while ordinary currency and owned-chest actions remain available after the checkout callback settles. Closing the page does not cancel a verified paid delivery. Save/verification/acknowledgement failures leave the store transaction unfinished for retry; no unconfirmed purchase grants rewards.

## Persistence

`ShopCore.js` owns calendar rules, stock validation and rotation drafts. `ShopCommerce.js` owns optional lifetime counts, account binding, first-purchase records, receipt deduplication and chest inventory under `UserData.shopCommerce`, independently of the daily `shopState`. Reads use a virtual empty record for older saves and do not seed it. Malformed records fail closed and remain intact. `ShopRuntime.js` commits mutations through `KinghtFallPlayerMgr`'s existing durable reward journal. The old `shopInfo` relic-draw record retains its original purpose.

Normal reads, category switching and timer ticks do not reroll or save unchanged stock. Initial stock and a new day's stock are journaled before offers become actionable. Each action captures a quote token containing stock/commerce revisions, ownership and trusted store eligibility. Stale confirmations and repeated callbacks cannot consume a second chest, buy replacement stock or silently change a fixed relic into an unquoted Gold conversion. Daily restock and relic refresh never reset lifetime bundle counts, Gem bonuses or owned chests.

## Verification

Run `npm test` for maintained checks, including `shop-*.test.cjs`. They cover the exact catalog, rarity guarantees, private receipt capabilities, server preauthorization, both bundle purchases, all six independent Gem bonuses, out-of-order restores, account mismatch, every durable-write interruption boundary, failed acknowledgement, stale chest tokens, Rune ordering, daily restock, refresh caps and daylight-saving boundaries.

With Creator's preview running, `node tools/testing/verify-shop.cjs` adds a headless, muted, private-profile integration check. It proves the production singleton is unconfigured, then injects a separate simulated store into a test-only runtime to exercise every paid SKU through the actual journal and UI. It never configures a production payment provider or makes real payments. Screenshots/results stay outside the repository. `COCOS_PREVIEW_URL`, `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` select the preview and browser; optional `--out` must name a fresh external artifact directory. The browser is closed after completion.
