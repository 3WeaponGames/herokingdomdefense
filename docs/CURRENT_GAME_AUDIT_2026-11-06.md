# Hero Kingdom Defense current game audit

**Follow-up:** The fixes and subsequent test results are recorded in [AUDIT_FIXES_2026-11-06.md](AUDIT_FIXES_2026-11-06.md). The findings below retain the original pre-fix audit evidence.

**Date:** 6 November 2026, Europe/Paris

**Source checkpoint:** `9e45bc1` (`Fix progression, rewards, save recovery, and Victory text`), plus concurrent chest-preview, button, playtime Claim All, and Battle Pass working changes. This is a point-in-time audit while those changes are in progress.

**Engine:** Cocos Creator 2.4.13

The game loads and its existing regression checks pass. It has several confirmed correctness defects and unfinished release integrations. The highest priorities are an unreachable late-game mission, failure recovery after startup, and production rewarded ads. Saving, reward transactions, and pooled combat targets also need work.

This report describes the current checkout. It supersedes corresponding findings in the earlier `GAME_STATUS_REPORT_2026-11-06.md`, whose pre-fix snapshot must not be used as the current bug list. No production code, game configuration, artwork, or user save was edited for this audit. A separate fresh in-app-browser profile was used for the live walkthrough; entering its first battle consumed its normal five energy. Faults and calendar changes were simulated in isolated Node VM harnesses, without changing the computer clock or deliberately corrupting real saves.

## Verified current state

| Area | Current result |
|---|---|
| Main campaign content | 20 chapters, 200 configured waves, four authored map fixtures. B and D overrides also contain 20 chapters. |
| Progression systems | Six equipment tracks, 140 talent nodes, 27 relics, 101 missions, 132 achievements, 100 Battle Pass levels, seven sign-in rewards, six playtime rewards. |
| Existing automated checks | All 19 discovered test files pass. The Node test runner reports 85 passing test entries, zero failures or skips; some entries wrap scripts with additional internal assertions. The separate migrated-runtime localization check also passes. |
| Navigation | 702/702 authored route checks pass across four maps and three unit radii. These are geometry checks, not prolonged crowd or device tests. |
| Source and serialized assets | All 202 game scripts parse; named script imports resolve. Across 102 scene/prefab files, no broken serialized indices, unresolved asset UUID references, or duplicate asset UUIDs were found. References to engine default assets were checked against the installed engine. Dynamic paths require separate checks. |
| Localization | 1,085 catalog entries; 2,880 token references, 645 serialized text fields, and 1,697 configuration display fields checked. Zero errors, seven missing-baseline warnings. |
| Localized artwork | All 41 template sources and 82 English/Chinese PNG outputs exist. The catalog contains 39 sprite and two Spine bindings. This establishes file availability, not complete visual sign-off or historical image immutability. |
| Fresh preview | Home, Battle Pass, sign-in, Settings, first-battle tutorial, movement input, pause, and return home were inspected at the iPhone 6 preset, 375 × 667 CSS pixels. No captured warning/error messages appeared during this walkthrough. A complete combat wave was not played. The later chest-preview and Claim All edits received automated checks; their new visuals were not included in this walkthrough. |

## Confirmed findings and recommended fixes

P1 means blocked progression, a possible game lock, or a release integration blocker. P2 means a significant correctness or usability defect. P3 covers incomplete features and verification tooling.

### A01 P1 Mission 100 cannot be completed

Mission 100 requires **250 equipment upgrades**. The three 50-level tracks and three 20-level tracks allow only `3 × 49 + 3 × 19 = 204` upgrades, starting at level one. Mission 101 is therefore inaccessible through normal completion. The previous chapter-20 mission bug is fixed; this later blocker remains.

**Evidence:** [mission 100](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/KinghtFallConfig/GameJsonCfg.json:16992), equipment `levelInfo` arrays, and `progression-caps` in `local/current-audit/reproductions.json`.

**Fix:** Reconcile the mission requirement with achievable progression or add the intended equipment content. Add a content-cap check so future mission requirements cannot exceed their systems' maximums.

### A02 P1 An asset download failure after startup can lock the UI

The loading scene installs the resource error/retry handler, then removes it when destroyed. A later failed or timed-out request logs its error but neither completes nor exposes a retry when that handler is absent. `UIMgr.open` has already set `isopening = true` and blocked input; its success callback is responsible for clearing that state. Failure can therefore leave the current interface locked and subsequent menus queued indefinitely.

The actual resource loader was exercised with its handler absent: one failed request produced **zero completion callbacks, zero retry prompts, and zero remaining timers**.

**Evidence:** [ResourceMgr.js:52](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/ResourceMgr.js:52), [Loading.js:101](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/Loading.js:101), [UIMgr.js:181](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/UIMgr.js:181).

**Fix:** Keep recovery available for the entire app lifetime. Give resource callers an explicit failure path that clears UI opening/input state and offers retry or cancel. Test a failed menu prefab and a failed battle asset after startup has completed.

### A03 P1 Production rewarded ads need host integration

The selected platform is `ANDROID_4399`. Its adapter depends on a host-supplied `h5api.playAd`; without it, every normal rewarded request fails. The existing regression test confirms that the standalone path gives no reward and cleans up correctly. No bundled SDK loader was found. The host could inject the API, but that integration was not verified.

F8 development test mode and exactly-once SDK callback handling are implemented and pass their tests. They do not establish that production ad playback works.

**Evidence:** [PlatformSetting.js:24](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/PlatformSetting.js:24), [Platform4399Manager.js:63](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/Platform4399Manager.js:63), `tools/testing/rewarded-ads.test.cjs`.

**Fix:** Validate the intended host, SDK injection, placement configuration, completion, cancellation, offline behavior, and timeout in an exported release build. Treat this as an integration gap rather than removing the normal reward restrictions.

### A04 P2 Old projectiles can damage a newly pooled enemy

Player/tower projectile callbacks capture an enemy component and check only `cc.isValid`. Dead enemies are returned immediately to a pool. A pooled node remains valid, and it can be reused for a different enemy before the old projectile arrives. The old callback then damages the new incarnation.

An isolated replay of the actual tower shot method fired at generation one, recycled the target, and invoked the retained impact callback. The replacement enemy lost HP **100 → 90**.

**Evidence:** [KinghtFallGameCtrl.js:630](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallGameCtrl.js:630), [tower impact callback](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallGameCtrl.js:698), [enemy pooling](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallEnemyBase.js:433), `KinghtFallBulletBase.js`.

**Fix:** Capture a spawn/lifetime identifier with each projectile target. Before tracking or applying impact, require the same lifetime and a live target. Cover death, immediate reuse, and restart while projectiles are in flight.

### A05 P2 Daily rollover requires reloading the game

Calendar-day comparison is now correct, but daily initialization runs only when saved data is loaded. The regular timer adds online seconds without checking for a new day. A session held across midnight retains yesterday's sign-in claim and playtime reward state; login-day progress also waits for initialization.

Simulated 23:59 → 00:01: sign-in remained on day zero with its claimed bit set, and online time continued from 600 to 601 seconds. Calling `initData` then advanced sign-in correctly.

**Evidence:** [KinghtFallDailyData.js:46](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallDailyData.js:46), [Main.js:107](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/Main.js:107), `KinghtFallMissionData.initData`.

**Fix:** Check rollover during the normal timer and on app resume. Refresh visible reward menus and notification dots, and define how pending ad claims behave across midnight.

### A06 P2 Parsed saves are not validated against their schema

Malformed JSON now has recovery, but any non-null JSON object is accepted. Required arrays, numeric fields, and supported versions are not validated. An empty object passes the loader; user initialization repairs energy but leaves other fields absent. Awarding 100 gold produces `NaN`; a later talent read throws while accessing an undefined array's `length`.

**Evidence:** [BaseData.js:97](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/BaseData.js:97), [KinghtFallUserData.js:70](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallUserData.js:70), `save-schema` reproduction.

**Fix:** Validate and migrate each record before accepting it. Quarantine invalid shapes as well as invalid JSON, preserve valid fields where possible, and test missing arrays, wrong numeric types, and unsupported versions.

### A07 P2 Failed save writes are silent to the game and player

`CacheUtils.saveData` catches storage errors and logs them, with no failure result returned to callers. A quota or storage-access failure lets the game continue as though progress were durable. A simulated write failure was swallowed exactly this way. The selected platform also has no configured server-save adapter, so there is no demonstrated cloud fallback.

**Evidence:** [CacheUtils.js:16](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/CacheUtils.js:16), [BaseData.js:122](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/BaseData.js:122), `ServerDataMgr.init`.

**Fix:** Propagate persistence success/failure, retain dirty state for retry, and show a clear unsaved-progress message. Do not discard a settlement journal unless its required writes succeeded. Add a supported backup/export or account recovery path if cross-device recovery is part of the product.

### A08 P2 One-time reward claims are not crash-safe transactions

Battle settlement now uses receipts and a journal, but free Battle Pass claims save the currency before saving the claim flag in a separate record. Interruption between those writes leaves the reward credited and claim available after restart. The latest bonus-track handler writes its flag first, which instead risks a consumed claim without its reward if interrupted. Sign-in, achievements, and playtime claims use separate-write sequences and need the same review.

The actual free Battle Pass claim handler was replayed with an interruption before the receipt write. Reopening and claiming again credited the same 2,000-gold reward twice, producing **4,000 gold**. This models interruption between writes; it is not a claim that an ordinary double click bypasses the current UI.

**Evidence:** [free Battle Pass claims](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallUIPassport.js:87), [KinghtFallUISignIn.js:56](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallUISignIn.js:56), `KinghtFallUIAchievement.js`, `KinghtFallUIOnlineReward.js`, `pass-claim-interruption` reproduction.

**Fix:** Extend durable, idempotent reward transactions to all one-time claims. Verify recovery after interruption at every write boundary.

### A09 P2 Eight achievements exceed available content

| Achievement IDs | Requirement | Available maximum |
|---|---|---|
| 111055, 111056 | Own 30 / 40 relics | 27 |
| 111062–111066 | Upgrade relics 60 / 70 / 80 / 100 / 120 times | 54 |
| 111083 | Upgrade equipment 300 times | 204 |

**Evidence:** [achievement configuration](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/KinghtFallConfig/GameJsonCfg.json:17558), `progression-caps` reproduction.

**Fix:** Align goals with current content or explicitly gate them until the required content exists. Validate these limits alongside mission limits.

### A10 P2 Day 7 reward text remains unreadable on a phone-sized screen

The English sign-in artwork now renders correctly, but the Revive Token name under its icon is visibly too small to read in the fresh 375-pixel-wide preview. Its one-line shrink layout has width 112, a label node scale of 0.5, and the viewport scales the 750-unit design by another 0.5: only about **28 CSS pixels of line width** remain before fitting the complete name. The home mission caption and several secondary labels are also very small.

Settings language captions are visible now; the earlier blank-caption finding is resolved. Battle Pass headers also appear correctly in the inspected preview.

**Evidence:** [sign-in label assignment](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallUISignIn.js:122), catalog layout `ui.layout.kinghtfalluisignin.213`, and `KinghtFallUISignIn.prefab` day-seven `labName`.

**Fix:** Give the reward name more width or a separate wrapped caption with a minimum readable rendered size. Continue the existing 41-screen visual checklist with long values, both languages, and real device safe areas. Clamp completed playtime/achievement progress displays instead of showing counts far above their targets.

### A11 P3 Visible features include unfinished or stale content

- **Shop:** its unlock requires chapter 30/wave 10, while only 20 chapters exist. No Shop prefab is assigned. The current Coming Soon response is appropriate, but this is an incomplete feature rather than a playable shop.
- **Gift codes:** both bundled codes expired in December 2024. This may be intentional seasonal behavior, but there is no currently valid bundled code to exercise the visible feature.
- **Add Desktop:** a UI prefab path is registered but absent. No active caller to that registered screen was established; the existing shortcut route uses the SDK directly. Remove unused registration or provide the screen before exposing it.

**Evidence:** configuration parameter `60008`, [Shop selection](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallUIHome.js:162), [gift expiry data](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/KinghtFallConfig/GameJsonCfg.json:4914), [Add Desktop registration](C:/Users/danny/Documents/projects/HeroKingdomDefense/assets/_script/KinghtFallConfig.js:105).

### A12 P3 Audit tooling is not fully reproducible from a fresh checkout

- The original artwork coverage command aborts because `local/localization-art-audit/inventory.json` is missing. That ignored, machine-local file contains the historical image baseline. Creating a new inventory would not prove preservation of the old one.
- Localization auditing reports seven missing backup warnings; comparison counters for preserved numeric/string gameplay values are zero here. Earlier preservation totals cannot be repeated on this machine.
- The authored-route command initially failed because its output directory did not exist. After creating that directory, all 702 routes passed. The script also does not set a failure exit code when routes are missing.
- Artwork coverage reports missing generated outputs but does not include that list in its failure-exit condition. The independent current existence check found no missing outputs.
- There is no root test entry point or CI workflow in this checkout; checks require knowing the individual commands.

**Fix:** Keep necessary fixtures/baselines in a portable location, create output directories automatically, make all failed invariants produce nonzero exit codes, and add one documented audit/test command suitable for CI.

## Earlier issues verified as fixed

Current regression checks cover the chapter-20 mission comparison, Day 7 relic reward, exhausted seven-day event, duplicate sign-in callbacks, calendar-date comparisons, max-level relic conversion, battle settlement recovery, malformed-JSON quarantine, startup retry, localization lifecycle/Spine behavior, ad callback cleanup, F8 release isolation, navigation geometry, gate approach, and wave-indicator layout.

These passes apply to their covered cases. In particular, correct date comparison does not implement live midnight rollover, malformed-JSON recovery does not validate every save schema, and startup retry does not provide runtime recovery after its handler has been removed.

## Fix order and remaining release checks

1. Fix mission/achievement feasibility and runtime resource failure cleanup.
2. Add pooled-target lifetime checks, validated save schemas, write-failure reporting, and transactional one-time claims.
3. Implement live daily rollover and repair unreadable mobile labels.
4. Complete intended host/SDK integration and decide which unfinished features belong in the release.
5. Export an optimized release and validate on target devices: fresh install, normal ads, offline/slow-network recovery, suspend/resume, victory/defeat/revive, full campaign boundaries, both languages, and large groups at narrow gates.

No release web export, native-device run, complete 200-wave playthrough, live Wall Defense walkthrough, sustained crowd soak, device performance measurement, or complete bilingual responsive visual sign-off was performed. Wall Defense received source review and existing shared checks only. The asset/file checks cannot substitute for those runtime checks.

## Evidence and repeat commands

Audit evidence is saved under `local/current-audit/`, which is excluded from version control:

- `tests.log`: existing regression output.
- `localization.json`: current catalog/source audit and its seven warnings.
- `assets.json`, `assets.log`, `assets.cjs`: source/import/reference and artwork-availability checks.
- `reproductions.json`, `reproduce.cjs`: isolated reproductions for the seven grouped fault scenarios above.
- `source-manifest.json`: fingerprints of the source/configuration/serialized files at the audit cutoff, to distinguish subsequent concurrent work.
- `routes.log`: authored route output; detailed route data is in `local/navigation-audit-20261106/authored-route-audit.json`.

From the project root in PowerShell:

```powershell
$testFiles = @(rg --files tools packages/localization-editor/test -g '*.test.cjs' -g '*.test.js' -g '*test.js')
node --test @testFiles
node tools/localization/test-migrated-runtime.cjs
node tools/localization/audit-project.cjs --report local/current-audit/localization.json
New-Item -ItemType Directory -Force local/navigation-audit-20261106 | Out-Null
node tools/navigation/audit-authored-routes.cjs
node local/current-audit/assets.cjs
node local/current-audit/reproduce.cjs
```

The two local audit helpers record expected faulty outcomes; successful execution means the described defects were reproduced, not that the game passed those scenarios. `assets.cjs` uses the installed Cocos 2.4.13 path on this computer to resolve built-in asset references.
