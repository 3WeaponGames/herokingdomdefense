# Project Cocos — full status audit

**Audit date:** 6 November 2026 (Asia/Shanghai)
**Project:** `P:\Unity\Projects\Project Cocos` · Cocos Creator 2.4.13
**Overall assessment:** a substantial playable game with localization work in progress; **not yet a complete, verified English release**.

This is an audit-only snapshot. Implementation stopped when requested. No game functions, gameplay configuration, source artwork, or editor settings were changed during this audit. The only written outputs were audit documentation, the machine-readable audit result, and screenshots. Existing implementation changes remain in place. No reward was deliberately claimed, purchase made, save reset, or system clock changed. The running game's ordinary timers continued normally.

## 1. Current status against the requested work

| Requested outcome | Status at audit time |
|---|---|
| Open and run the project on this PC | Working in Creator 2.4.13; editor bridge connected; home and representative menus run. |
| English default, Chinese second language | Implemented in the localization source. Live English → Chinese → English switching works for ordinary labels in the inspected preview. |
| Editable translation tables/panel | Implemented under **Localization > Translation Tables**. Includes text, locales, CSV import/export, layout metadata and artwork metadata. |
| Every player-facing phrase translatable | Broad text migration completed, but four referenced keys are absent from the assembled catalog. Baked artwork coverage and runtime integration remain unfinished. |
| Clearly labeled language option in Settings | Buttons work in the running preview, but their captions are invisible. A source correction exists; it has not been rebuilt and verified. |
| Complete English artwork with original visual style | Not complete. No production localized images have been generated. Original image pixels remain intact. |
| Remove the top disclaimer and debug statistics | Confirmed absent from the running home screen. The disclaimer's original node is inactive, rather than deleted. |
| Retain energy, coins, gems and other UI; move upper UI up | Confirmed on home. Upper groups were moved before the audit; bottom navigation remains anchored. |
| English text fits without overlaps | Improved on home, including two-line chest objectives. Not complete across the game; sign-in text becomes unreadably small. |
| Instant ad rewards and removal of ad limits for testing | **Not implemented before the audit freeze.** Current ad integration and restrictions remain. |
| Full audit and status report | Completed as source/data checks, isolated function tests and representative live UI inspection. Full campaign/device/release testing remains outstanding. |

**Important snapshot difference:** files on disk contain **1,044 catalog entries and 27 sprite bindings**. The open preview reports **1,019 entries and no image bindings**. It is running an older imported/compiled snapshot. It was deliberately not rebuilt during this audit. Its successful screens cannot certify the newer artwork metadata or latest source corrections.

## 2. Highest-priority findings

P1 means a crash, blocked progression, or a major obstacle to validating the requested version. P2 means a significant correctness, usability or integration defect. Priorities describe recommended next work; no fixes were applied.

| ID | Priority | Confirmed finding | Player/project impact |
|---|---|---|---|
| G01 | P1 | Mission 96, **Clear Chapter 20**, cannot complete. Chapter completion sets `maxStage` to 21, but the mission UI clamps it to 20 before checking `> 20`. | The final chapter mission and missions 97–101 remain blocked. |
| G02 | P1 | After the seven sign-in rewards, `signDay` advances to index 7. Claim buttons can remain enabled, but only indices 0–6 exist. | The eighth-day claim throws a `TypeError` when reading `Item`. Reproduced with the actual handler in an isolated in-memory test. |
| G07 | P1 | Day 7 awards a type-2 Revive Token, but the shared reward handler only grants type-1 goods. The claim is consumed first. | Normal and ad-multiplied Day 7 claims silently grant no Revive Token. This is separate from the Day 8 crash. |
| L01 | P1 | Artwork localization has missing inputs, incompatible drafts, and unfinished runtime handling. | The requested complete English presentation cannot currently be produced or verified. Loading the latest bindings may replace some original sprites with provisional generic labels. |
| A01 | P1 | Current platform requests a real 4399 ad API; the requested testing bypass does not exist. | In a standalone preview without `h5api`, rewarded actions fail instead of granting the reward. |
| A02 | P1 | Ad rewards have no exactly-once completion guard or robust timeout/exception cleanup. | Duplicate SDK success events can duplicate rewards. Missing completion or a thrown SDK error can leave input/music blocked. |
| G03 | P2 | Daily reset compares **weekday**, using `getUTCDay()`, rather than calendar day. | Returning exactly 7, 14 or 21 days later within the same month can incorrectly count as the same day. November 6 versus November 13 reproduced this result. |
| G04 | P2 | Mission 100 requires 250 equipment upgrades; only 204 are possible with the current six tracks. Eight achievements also exceed available content. | Some completion goals are mathematically unreachable even after the earlier mission blocker is fixed. |
| G05 | P2 | Shop unlock is chapter 30/wave 10, but only 20 chapters exist. The home prefab's shop reference is unassigned. | Shop is unfinished and unreachable in normal progression. |
| L02 | P2 | Four singular elapsed-time keys are referenced but absent from the assembled catalog. | The static project audit fails; affected phrases cannot resolve correctly. |
| U01 | P2 | Settings language caption/button text is blank in the running preview; sign-in reward text can shrink to about 4 CSS pixels. | Language choice is undiscoverable and some English text is effectively unreadable. |
| G06 | P2 | Both configured redemption codes expired in December 2024. | The visible code feature has no currently valid bundled code. |
| S01 | P2 | Saves are local-only for the selected platform, with no malformed-JSON recovery path. | There is no implemented account recovery/cross-device save for this build; a malformed saved record can throw on loading. |

### Evidence for gameplay findings

- **G01:** [mission comparison](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallHomeBattleCtrl.js:303>), [chapter completion](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUserData.js:150>), [mission configuration](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:16944>).
- **G02:** [daily sign-in advancement](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallDailyData.js:57>) and [claim handler](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUISignIn.js:40>); button activation is in the same file at line 75. This was reproduced without modifying the real save.
- **G07:** [Day 7 reward](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:18384>) is goods ID `2006`, configured as type 2. The [claim handler](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUISignIn.js:48>) marks it claimed before calling [addRewards](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallPlayerMgr.js:121>), whose switch handles only type 1. Confirmed by source tracing; no actual reward was claimed in the audit. Other callers should also be reviewed for unsupported reward types.
- **G03:** [KinghtFallModle date comparison](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallModle.js:96>) and its [TimeUtils counterpart](<P:/Unity/Projects/Project Cocos/assets/_script/TimeUtils.js:58>); used by daily and mission data.
- **G04:** three equipment tracks cap at level 50 and three at level 20, starting at level 1: `3 × 49 + 3 × 19 = 204`. See [upgrade cap handling](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallHomePersonCtrl.js:122>) and [mission 100](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:16992>). Unreachable achievement IDs: `111055`, `111056` require 30/40 treasures versus 27; `111062`–`111066` require 60/70/80/100/120 treasure upgrades versus 54; `111083` requires 300 equipment upgrades versus 204. See [achievement configuration](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:17558>).
- **G05:** [unlock configuration](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:13306>), [shop opening](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIHome.js:162>) and [home prefab references](<P:/Unity/Projects/Project Cocos/assets/KinghtFallPrefabs/home/KinghtFallUIHome.prefab:3683>).
- **G06:** [configured code dates](<P:/Unity/Projects/Project Cocos/assets/KinghtFallConfig/GameJsonCfg.json:4914>) and [expiration enforcement](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIExchangeCode.js:46>).

These are findings in the current project. Unless explicitly identified as unfinished localization work, this report does not attribute their origin to the recent changes.

## 3. Localization, translation editor and artwork

### Ordinary text: broad coverage, final consistency still failing

The central catalog supports English and Simplified Chinese, an English default, persisted language selection, stable text tokens, formatted parameters, rich text, locale-specific large-number units, and live label refresh. Menus, gameplay configuration, tutorials, equipment, treasures, talents, stage names, achievements, notices, platform dialogs and Defend the Wall text were migrated.

The source audit inspected **197 scripts**, **2,855 token references**, **641 serialized text fields**, **1,697 configuration text fields**, **11 rich-text blocks**, **2 edit boxes**, and **253 styled label components**. The catalog has 252 layout entries; an entry/component count need not be identical.

The four missing assembled-catalog keys are:

```text
time.ago.days.one
time.ago.hours.one
time.ago.minutes.one
time.ago.seconds.one
```

They are referenced by [TimeUtils](<P:/Unity/Projects/Project Cocos/assets/_script/TimeUtils.js:45>) and exist in the late text-entry source, but were not merged into the current assembled catalog before work stopped. The machine-readable result reports **4 errors, 0 warnings**. Zero other scanner findings is not proof that every game path or image is localized.

Live grammar also needs review: the achievement dialog displayed **“Log in for 1 days.”** Singular/plural support for elapsed time does not automatically correct every numeric sentence. A consistent glossary and grammatical variants should be checked across rewards, missions, upgrades and tutorials.

Language-neutral numbers, punctuation, resource identifiers, diagnostics, analytics identifiers and player-authored names/codes are intentional exclusions. Original legacy text tables remain as reference data. “Nothing hardcoded” is therefore only a player-facing text goal, not a reason to translate technical identifiers.

### Editor panel: useful foundation, incomplete validation

The translation panel supports searching, paging, editing locales/keys, setting the default locale, CSV round trips, placeholders, rich-text tag checks, revision-aware saving, recovery drafts and backups. Layouts and artwork bindings/templates are editable as advanced JSON. Font/outline/gradient/perspective rendering was verified on isolated fixtures before the freeze; those fixtures are **not finished game artwork**.

Remaining editor/runtime weaknesses:

- Table validation does not fully check production image existence, dimensions, image-to-template references, Spine references, or visual fit. Its zero-issue table result is narrower than the project audit and artwork checks.
- Rich-text validation compares tag counts; malformed nesting such as `</b>text<b>` can pass the same signature as `<b>text</b>`. See [catalog validation](<P:/Unity/Projects/Project Cocos/packages/localization-editor/lib/catalog.js:80>).
- Saving writes the catalog before compiling artwork. A compilation error produces a warning while leaving new tables with stale/missing outputs. This should become an explicit, reviewable build state. See [save flow](<P:/Unity/Projects/Project Cocos/packages/localization-editor/main.js:57>).
- Number-format metadata is table-driven but lacks a dedicated visible editing control; advanced layout/artwork JSON is less approachable than a visual authoring panel.
- The public rendered-string translation API retains an ambiguity for delayed assignments of identical English phrases. Migrated stable-token paths have regression coverage; future code should retain explicit keys/bindings.
- Sprite load failures are silent, and the provisional overlay has outline re-enable/lifecycle weaknesses. Current mock tests do not exercise actual Cocos sprite trimming, asynchronous loading races or Spine animation.

### Baked artwork: unfinished and not style-certified

The image audit inspected **711 original raster images** across 15 contact sheets and identified **43 text-bearing textures**. All 711 original SHA-256 hashes remained unchanged. Draft metadata contains **23 artwork text entries, 27 sprite bindings, 2 Spine bindings and 29 templates**.

**No production generated localized PNGs exist.** Fourteen required neutral backgrounds are missing: twelve construction-tile variants (`by`, `cq`, `fw`, `jt`, `mf`, `zc`, each with its second variant), `settlement_atlas.png`, and `day7_atlas.png`.

The only two neutral drafts have incompatible dimensions:

| Draft | Required template size | Existing image size |
|---|---:|---:|
| `neutral/pass.png` | 750 × 429 | 1659 × 948 |
| `neutral/day7.png` | 514 × 192 | 2053 × 766 |

The compiler checks source loading and dimensions, so these are actual build blockers, not cosmetic warnings. See [source loading](<P:/Unity/Projects/Project Cocos/packages/localization-editor/lib/art-compiler.js:29>) and [dimension validation](<P:/Unity/Projects/Project Cocos/packages/localization-editor/lib/art-renderer.js:136>).

Fourteen text-bearing textures remain unmapped: four tester badges (`all`, `all-f`, `all-r`, `all-y`), five equipment glyphs (`zb_02`, `zb_04`, `zb_06`, `zb_08`, `zb_09`), three sidebar instruction/screenshot textures, the `8.png` age badge and `fk.png` feedback icon. The sidebar screenshots contain Chinese interface text beyond their captions. Their exposure in every gameplay path has not been certified.

The provisional [sprite runtime](<P:/Unity/Projects/Project Cocos/assets/_script/LanguageMgr.js:315>) ignores artwork templates and has no Spine-image replacement implementation. The proposed `LocalizedArtwork.js` service does not exist. Its Chinese `preserveOriginal` handling also ignores later Chinese wording edits whenever that metadata is truthy. Therefore both fully editable Chinese artwork and English artwork integration are unfinished.

The replacement Noto Sans SC Black font is bundled with its OFL license and supports 30,890 mapped characters. It adds approximately 10.6 MB of source font data. It is **not the original typeface**, so an exact historical font match cannot be claimed. The original bundled font is a small rounded subset with only 145 Chinese characters. Font size, outline, gradient, tilt, perspective, sprite trim/offset and animated atlas alignment still need image-by-image acceptance.

Generated construction-tile drafts that changed shapes were rejected and not copied into the project. The user-approved precise masked cleanup was **never performed before the audit freeze**. The two surviving background drafts are not accepted final replacements.

## 4. Live UI observations

Inspection used the running browser preview's iPhone 6 preset, approximately **375 × 667 CSS pixels**, and the older catalog snapshot described above.

| Screen | Observation |
|---|---|
| Home | Energy, coins, gems and settings remain. Disclaimer and FPS overlay are absent. Sidebar labels are inside the screen; chest objectives wrap onto two lines without the original collision. Bottom navigation remains anchored. Some secondary text is still small. |
| Settings | Language switching works, but the language heading/button captions are invisible. Runtime nodes had zero width and effectively zero font size. A width-restoration fix exists at [LanguageOptions.js:54](<P:/Unity/Projects/Project Cocos/assets/_script/LanguageOptions.js:54>), but was not rebuilt during the audit. |
| Achievements | Representative rows were aligned. “Log in for 1 days” requires grammatical correction. |
| Battle Pass | Ordinary labels are English; the large baked header still reads Chinese. |
| 7-Day Login | Ordinary labels are English; the Day 7 promotional banner is Chinese. “Revive Token” shrinks to approximately 4 CSS pixels after component and ancestor scaling. It needs a wider/better wrapped area, not further shrink-to-fit. |
| Playtime Rewards | Representative rows are aligned. Completed progress can display values such as `41/5` and `41/10`; a clamped bar/count or clearer completed state would be easier to read. |

Evidence screenshots: [home](<P:/Unity/Projects/Project Cocos/local/audit-20261106/home-en.png>), [settings](<P:/Unity/Projects/Project Cocos/local/audit-20261106/settings-en.png>), [battle pass](<P:/Unity/Projects/Project Cocos/local/audit-20261106/pass-en.png>), [sign-in](<P:/Unity/Projects/Project Cocos/local/audit-20261106/signin-en.png>), [playtime rewards](<P:/Unity/Projects/Project Cocos/local/audit-20261106/playtime-en.png>).

The preview was left on the English home screen. Locked progression tabs, all combat states, every popup, all Chinese layouts, alternate aspect ratios and physical mobile safe areas were not exhaustively inspected. **Perfect alignment across the complete game is not yet verified.**

## 5. Advertising and testing readiness

The current platform is [ANDROID_4399](<P:/Unity/Projects/Project Cocos/assets/_script/PlatformSetting.js:24>). Its adapter calls external `window.h5api.playAd`; without that API it reports failure and gives no reward. No 4399 SDK loader was found in project source/templates. A hosting platform could inject it, but that was not verified. Empty failure text commonly means no explanatory message reaches the player.

The unused editor adapter simulates success after one second. Selecting another platform currently routes many choices, including WeChat/ByteDance, to that editor adapter rather than a complete native platform integration. Banner/interstitial methods are callback-only stubs, with no active gameplay callers found. Payment, login, sharing/recording, analytics, user information, leaderboards and shortcut methods are mostly stubs; no active real-money purchasing flow was found.

There are **23 rewarded-ad call sites**. They pass the same `AdFreeTime` enum, and [SdkMgr](<P:/Unity/Projects/Project Cocos/assets/_script/SdkMgr.js:33>) forwards an empty ad identifier. Placement names appear in analytics strings rather than a central placement registry. A future ad panel therefore needs explicit placement IDs.

An isolated test of the actual [4399 adapter](<P:/Unity/Projects/Project Cocos/assets/_script/Platform4399Manager.js:63>) delivered two success events and received two success callbacks. There is no exactly-once reward guard. Timeout/exception cleanup also needs coverage so the touch blocker and paused music are always restored. The unused multiple-video API is incomplete: the 4399 method is absent and the editor implementation does nothing.

### Reward placement inventory

| Placement | Existing restrictions / behavior | Primary source |
|---|---|---|
| Gold and gems | No ad count/cooldown found; 2,000 base gold or 100 gems. | [UIAddCurrency:63](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIAddCurrency.js:63>) |
| Energy | No ad count/cooldown found; ad grants 15, gem purchase grants 5. | [UIAddStrength:49](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIAddStrength.js:49>) |
| Treasure draw / repeat draw | One ad per draw; no daily cap found. | [HomeTreasureCtrl:197](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallHomeTreasureCtrl.js:197>) |
| Talent nodes | Applicable nodes require 1–3 successful ads, plus progression. | [UITalentInfo:108](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUITalentInfo.js:108>) |
| Sign-in double/extra | Once per sign-in day, persisted claim flags. | [UISignIn:57](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUISignIn.js:57>) |
| Pass premium reward | Once per unlocked rank, persisted claim flag. | [UIPassport:157](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIPassport.js:157>) |
| Buff refresh / take all | No ad cap found; operates within a buff choice. | [UIBuff:69](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIBuff.js:69>) |
| Battle silver | No ad cap found; amount from current wave configuration. | [UIGame:129](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIGame.js:129>) |
| Hero revive | No ad count cap; normal auto-revive also exists after about 10 seconds, reduced by treasure. | [UIGame:205](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIGame.js:205>) |
| Retry loss | No ad cap found; retry adds 10 silver. | [UIGameBack:33](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIGameBack.js:33>) |
| Double victory reward | One settlement choice; dialog closes after reward. | [UIGameEnd:178](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIGameEnd.js:178>) |
| Map silver, weapon and horse | Silver pickup consumed; weapon/horse each have two sequential upgrades per run. | [GameCtrl:190](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallGameCtrl.js:190>) |
| Extra barracks soldiers | Hard cap of three per barracks in multiple guards; 1.5-second standing trigger. | [BuildBarracks:92](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallBuildBarracks.js:92>) |
| Building branches | One ad for an ad branch; normal progression applies. | [UIBuildSel:54](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallUIBuildSel.js:54>) |
| Defend the Wall entry | Unlocks after chapter 3; 30-minute cooldown can be skipped with an ad. | [HomeBattleCtrl:588](<P:/Unity/Projects/Project Cocos/assets/_script/KinghtFallHomeBattleCtrl.js:588>) |

The requested test mode should later simulate success centrally, preserve visible ad buttons/reward callbacks and identify every placement. Restriction overrides must also cover the intended counters and cooldowns; replacing the SDK callback alone will not remove them. One-time ownership, quest progression and pass/sign-in claim flags should be distinguished from ad-frequency limits so the intended test behavior is explicit. **No part of this proposal was implemented during the audit.**

## 6. Content present and completeness gaps

| Area | Configured content |
|---|---|
| Main campaign | 20 chapters, 200 waves, 4 reused map prefabs |
| Units | 12 soldier/enemy stat definitions: 10 spawning archetypes and 2 boss forms; 4 allied soldier prefabs |
| Hero/equipment | One central playable hero; 6 equipment tracks |
| Buildings | 6 families; 25 upgrade/branch records |
| Talents/buffs | 27 talent types, 140 talent nodes, 57 battle buffs |
| Treasures/items | 27 treasures with 3 levels each; 32 goods |
| Goals/rewards | 101 missions, 132 achievement rows, 100 pass ranks, 7 sign-in rewards, 6 timed rewards |
| Defend the Wall | 100 configured waves, 9 enemy definitions, 10 member definitions, 14 buff types |

Targeted data checks found no missing campaign map/enemy prefabs, non-sentinel enemy IDs, reward goods, treasure/banner references, talent type references or building branch indexes. Sequential IDs were intact. These counts establish substantial content, not that every combination is balanced or every wave is beatable.

Recommended completeness work, beyond the confirmed defects:

- Define the intended final campaign/mission ending and behavior after completing all seven sign-in days, all talents, treasures and pass ranks.
- Resolve whether the shop is a supported feature, future content or a menu that should be hidden until implemented.
- Play through progression and resource pacing: energy, upgrade costs, talent gates, free rewards, treasure duplication and ad dependence. Measure progression rather than assuming valid references imply good balance.
- Review onboarding, locked-feature explanations, defeat/retry guidance and reward wording for a new English-speaking player.
- Audit minimum readable font sizes, contrast, tap targets, safe areas and longer future-language strings. Existing shrink-to-fit behavior can conceal text-fit defects by making text unusably small.
- Verify sound/music settings, background/foreground behavior, interruption recovery and a consistent mute experience on real devices. These were not comprehensively tested here.

## 7. Save data, build and maintenance readiness

For the selected 4399 platform, saves use local storage. [ServerDataMgr](<P:/Unity/Projects/Project Cocos/assets/_script/ServerDataMgr.js:34>) only creates cloud adapters for other platform choices; its server URL is null with no assignment found. Switching a platform constant would not establish a working backend. There is no verified account recovery, cross-device synchronization or authoritative reward validation for this build.

[BaseData](<P:/Unity/Projects/Project Cocos/assets/_script/BaseData.js:59>) parses saved JSON without a corruption-recovery path. A future save format should define versioning/migration, safe defaults and recovery behavior. No actual save was corrupted during this audit.

No completed release export/build output was found or produced. Web export, Android/native packaging, SDK hosting, offline behavior, loading time, memory, sustained performance and long sessions remain unverified. An empty short editor error buffer is not proof of a clean runtime: runtime console capture was not enabled for all prior activity.

The restored scripts are transpiled CommonJS, which makes larger changes harder to maintain than original typed source. The central localization manager patches Cocos label behavior globally; it needs real-engine regression tests in addition to mocked component tests. Future changes should preserve `.meta` files and use focused checkpoints.

The repository now has a local Git recovery checkpoint and [version-control guidance](<P:/Unity/Projects/Project Cocos/docs/VERSION_CONTROL.md>). That checkpoint contains work in progress. Uncommitted source changes were already present at audit start and were preserved; this audit did not commit, discard, merge or push them. Local backups/screenshots under `local` are excluded from Git and should not be assumed to travel to a second PC.

Asset/source provenance and distribution permissions should be assembled before publication; the new font license is present, but a complete release provenance record was not established by this audit. This is a release-documentation task, not a claim that the assets are unauthorized.

## 8. Verification results and limits

| Check | Result | Scope / limit |
|---|---|---|
| Current localization runtime regression test | **Pass** | English default, persistence, fallback, formatting, rich-text recipes, live label/number refresh, stable tokens, cleanup and malformed-format handling. Uses mocks, not a complete Cocos scene. |
| Static project audit | **Fail: 4 missing keys** | Counts and exact failures recorded in `project-audit.json`. Does not certify raster text or every dynamic path. |
| Gameplay configuration preservation | **Pass for checked fields** | 24,097 numeric/boolean/null values and 18,813 non-display strings matched the pre-localization backup. |
| Original raster preservation | **Pass** | All 711 original image hashes unchanged. New drafts are separate files. |
| Translation editor tests | **8 passed before freeze** | Table/CSV/revision behavior and earlier fixture work; not a production artwork build. |
| Current complete-catalog CSV round trip | **Pass in memory** | No catalog file changed by the test. |
| Production artwork preparation | **Blocked** | Missing 14 inputs; 2 available backgrounds have wrong dimensions; runtime incomplete. |
| Day-eight claim | **Failure reproduced** | Actual handler in an isolated VM; no real save manipulation. |
| Day-seven Revive Token | **Source-confirmed defect** | Claim is consumed, but the shared reward handler omits its item type. No live claim performed. |
| Weekly-return daily comparison | **Failure reproduced** | Actual function treated November 6 and 13 as the same day. |
| Duplicate ad completion | **Failure reproduced** | Actual adapter accepted two success callbacks; no real ad/network reward was requested. |
| Representative live menus and language switching | **Partial pass** | Home, settings, achievements, pass, sign-in and playtime; defects listed above; preview is older than source. |
| Full campaign, all UI, release/native devices, real ads/cloud | **Not verified** | No completeness or release-readiness claim. |

Repeatable audit commands (from the project root):

```powershell
node tools/localization/runtime.test.cjs
node tools/localization/audit-project.cjs
```

The second command refreshes the audit JSON and currently exits unsuccessfully because of the four missing keys. It does not repair the catalog. Build/migration/art-generation commands were not run during the audit.

## 9. Recommended order when implementation resumes

1. **Repair progression/reward correctness:** final chapter mission, missing Day 7 reward, eighth sign-in day, date comparison, unreachable goals, ad completion guards and recovery. Verify the reproduced cases before broader playtesting.
2. **Create the requested explicit ad test mode:** immediate reward, named placements and intended cap/cooldown overrides; preserve production hooks and visible ad affordances. Test duplicate/cancel/fail/timeout paths as well as success.
3. **Finish localization integration:** assemble the missing keys, finish neutral artwork and sprite/Spine handling, make both languages editable, and validate all artwork inputs before accepting a catalog/art build.
4. **Rebuild one consistent preview and perform the full visual pass:** Settings captions, smallest sign-in labels, all menus/combat/popups, both languages, several portrait ratios. Check centering, wrapping, sprite offsets, outlines, tilted text and animated artwork against originals.
5. **Complete the intended product surface:** decide shop, post-campaign/sign-in behavior, redemption-code policy, onboarding and save recovery; playtest the economy and progression.
6. **Produce and verify a release candidate:** clean web export and intended device build, actual host/SDK integration, save persistence/migration, performance and interruptions. Keep test ads visibly distinguishable in developer configuration and disabled for a production release.

Acceptance should mean: no missing references, no inaccessible required goals, no reward duplication, a working eighth-day policy, correct date resets, no unintended Chinese in English mode, editable Chinese/English artwork, readable labels without overlap, and successful exported-build testing. The current project has not yet met those conditions.

## 10. Audit artifacts

- [Machine-readable text/config audit](<P:/Unity/Projects/Project Cocos/tools/localization/project-audit.json>)
- [Detailed localization audit and exclusions](<P:/Unity/Projects/Project Cocos/docs/LOCALIZATION_AUDIT.md>)
- [Translation editor workflow](<P:/Unity/Projects/Project Cocos/docs/LOCALIZATION.md>) — describes intended tooling; it is not evidence that production artwork is finished.
- [Artwork inventory](<P:/Unity/Projects/Project Cocos/local/localization-art-audit/inventory.json>) and contact sheets `sheet-00.jpg` through `sheet-14.jpg` in the same directory.
- [Draft artwork entries/bindings](<P:/Unity/Projects/Project Cocos/tools/localization/art-entries.json>)
- [Home layout change record](<P:/Unity/Projects/Project Cocos/tools/localization/home-layout-changes.json>)
- [Pre-localization recovery backup](<P:/Unity/Projects/Project Cocos/local/localization-backup-20261106>)
- [Live screenshot folder](<P:/Unity/Projects/Project Cocos/local/audit-20261106>)

This report records the frozen state and proposed next work. It does not authorize or imply that any listed repair has been made.
