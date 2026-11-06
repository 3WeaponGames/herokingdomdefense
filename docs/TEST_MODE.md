# Development ad test mode

Press **F8** with the game focused to switch development test mode on or off. It starts **off** on a fresh development profile. A compact **TEST MODE · F8** badge appears at the top of the game while it is on. The badge follows the selected game language and does not intercept mouse or touch input.

The preference is stored locally under `project-cocos.test-mode` for browser preview/debug builds. Reloading a development preview restores the last choice. Release builds ignore the saved preference and cannot enable this mode. Cocos editor scene editing does not enable it either.

Holding F8 toggles only once per press. F8 is ignored while an HTML input, textarea, select, content-editable field, or Cocos EditBox is focused, and while modifier keys are held. Leaving Defend the Wall does not remove the hotkey.

The centralized reward adapter and individual ad-frequency/cooldown guards consume this API:

```js
var testMode = require('TestMode').TestMode.getInstance();
testMode.isAvailable();          // Preview/debug only; false in editor/release.
testMode.isEnabled();            // Always checks availability too.
testMode.shouldBypassAdLimits(); // Same effective state as isEnabled().
testMode.setEnabled(true);       // Cannot enable it in a release build.
testMode.toggle();
```

`Loading.startGame` initializes the service after the persistent UI root and localization are ready. The service has no SDK/platform/player-data dependency. Do not use this flag to grant unrelated inventory or bypass quest progression; reward simulation and each supported restriction override belong in their existing ad paths.

The visible badge text is the catalog entry `testing.modeBadge`. Edit its English/Chinese wording in **Localization → Translation Tables**.

The isolated state, hotkey, persistence, focus, lifecycle, badge and release-isolation checks run with:

```powershell
node tools/testing/test-mode.test.cjs
```

These tests do not call an ad SDK or grant rewards. Browser/device interaction and the centralized reward adapter require their own integration checks.

## Verified behavior and limits

In the isolated preview verification on 2026-11-06, test mode ON granted the existing battle silver reward immediately: **6 → 16 silver**. F8 was also verified switching the mode back OFF. This checks an actual reward path, not successful playback of a real advertisement.

With test mode OFF, the current local 4399 preview has no real `h5api` ad SDK available. That path reports ad unavailability and grants **no reward**. Release builds always use the normal path; a saved development ON preference cannot bypass it. Real SDK integration, ad-unit configuration, and device/network behavior still need platform testing.

The existing rewarded-ad hooks remain in place, with **24 named placement IDs** registered in `assets/_script/AdPlacements.js` across 23 call sites (one site selects between placements). Test mode uses their existing success callbacks and bypasses supported ad-frequency/cooldown restrictions. It does not reset previously owned upgrades, consumed one-time claims, quest requirements, or progression unlocks; toggling it off does not erase rewards already earned.

The adapter also has regression coverage for duplicate callbacks, failure, timeout, concurrent requests, input/audio cleanup, and placement registration:

```powershell
node tools/testing/rewarded-ads.test.cjs
node tools/testing/ad-limit-guards.test.cjs
```
