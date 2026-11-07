# Localization audit

English is the default and Simplified Chinese is the second language. The editable source of truth is `assets/resources/localization/catalog.json`; open **Localization > Translation Tables** in Cocos Creator to edit it. See `LOCALIZATION.md` for the editor-panel workflow.

## Repeatable checks

Run from the project directory:

```powershell
$artifactDir = Join-Path $env:USERPROFILE 'Documents\Codex Artifacts\HeroKingdomDefense\localization-audit'
node tools/localization/audit-project.cjs --report (Join-Path $artifactDir 'project-audit.json')
node tools/localization/test-migrated-runtime.cjs
```

`audit-project.cjs` writes the requested external report and exits with a nonzero status on an error. Without `--report`, its default is `audit/localization.json` under the external artifact root in `AGENTS.md`; `HKD_ARTIFACT_DIR` can override that root. It checks:

- Every `[[loc:key]]` reference and literal `LanguageMgr.t/T/token` key exists.
- Every locale has translations, with matching parameters and rich-text markup.
- Cocos Label, RichText and EditBox placeholder fields contain keys or language-neutral numeric/decorative content.
- Gameplay names and descriptions contain keys, including the reused GAD mode.
- Authored labels have layout metadata and RichText has a bounded width.
- All gameplay configuration numbers, booleans, nulls, array lengths and non-display strings match the pre-localization backup. New GAD `buffLabel` and `buffValue` fields are an explicit allowance.
- JavaScript parses and direct literal UI assignments/modal fields do not introduce hardcoded copy.

The audit is a focused regression check, not a proof that every possible program path renders correctly. Raster lettering and Spine texture lettering require the artwork audit and visual checks. Dynamic text generated from arbitrary external/user data is not exhaustively inferable by a static scan.

## Coverage and preserved data

The text migration covers gameplay configuration, menus, tutorials, equipment, relics, talents, stage names, achievements, rewards, notices, native platform dialogs, common UI and GAD UI. Elapsed-time phrases include separate singular and plural entries. Countdown suffixes, quantities, version captions and large-number units are table-driven.

The two EditBox components reference ordinary placeholder Label components. Both placeholder labels are localized. Creator 2.4.13's web EditBox implementation reads the translated placeholder again when input receives focus; player-entered gift codes and feedback remain user content.

Saved battle state contains stage, building, buff and mission identifiers and values. Loading a battle reconstructs descriptive configuration from the current tables; migration does not rewrite gameplay saves. A legacy local default player name can be recognized separately from third-party account names. Player-authored or external account names must remain unchanged.

Historical backup locations and scalar comparison counts are recorded in the externally archived audit reports. For a new historical comparison, supply `--baseline path/to/original/assets`. Without an explicit baseline, the default audit validates current content and does not certify preservation against an old copy.

## English layout

`catalog.labelStyles` holds English width, height, wrapping, maximum line count and optional font-size/line-height choices. Original Chinese layout baselines are restored on switching back. Font families, colors and outlines are preserved for ordinary labels. `catalog.nodeStyles` uses `prefab UUID:fileId` because this restored project reuses some file IDs across prefabs; unique bare file IDs and node paths are fallbacks.

The home sidebar has wider horizontal margins. Chest objectives use two bounded lines. The mission panel also supports two lines. Bottom navigation placement remains unchanged; its compact Equipment caption is **Gear**. These changes prioritize readable English while retaining localized Chinese content.

The archived `label-fit-audit.json` contains historical static Windows font measurements at an assumed 375-pixel viewport over the 750-pixel design width. Keep new measurements and screenshots in the external artifact folder. Font measurements are estimates; browser/Cocos visual checks establish overlap, truncation, style and centering.

## English wording and coverage review — 2026-11-06

The reviewed merge artifact is `tools/localization/english-polish-patch.json`. It includes the earlier relic/chest corrections, the Battle Pass columns, 285 English wording revisions relative to the copy-review backup, five native-platform/payment messages, and four existing singular elapsed-time entries missing from the assembled catalog. The source contributions remain in `text-entries.json` and `layout-entries.json`; merge this patch instead of rebuilding the entire catalog, so unrelated translation-panel edits survive.

The pass uses **Free Rewards** and **Bonus Rewards**: the left column grants rewards directly; the right invokes the existing rewarded-ad placement. There is no paid premium-track purchase in this implementation. Both columns use centered 26px text at the 750px design width, and the middle **Level** caption uses 22px. Bounds leave space around the center column.

Other terminology now uses **Perk**, **Battle Perks**, **Active Perks**, **Reroll**, **HP Regen**, **movement speed**, **House**, and **Retry Wave** in their corresponding contexts. Descriptions retain the configured effects and parameters. The four **×2 Claim** entries remain unchanged. Original Chinese entries are unchanged; new platform messages have Chinese translations as well.

The relic collection heading, ownership labels, draw captions and Epic guarantee have bounded English layouts. **Sidebar Rewards** fits its heading without shrinking. Four feedback categories use aligned two-line labels at 12.5px equivalent on a 375px viewport. The authored-label font estimate leaves only the disabled disclaimer and overwritten numeric sample below 9px. This is a static estimate, not a claim that every dynamic runtime state has received visual sign-off.

Native WeChat purchase toasts now show translated outcomes instead of raw server response messages. Their callback diagnostics and success behavior remain intact. WeChat/Douyin modal buttons are explicitly localized; **OK** and **Back** stay within the four-character limit documented by the [Douyin modal API](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/interface/interfeedback/tt-show-modal). The unused multi-video ad failure toast also uses the existing localized unavailable-ad message.

Validated candidate: 1,057 entries, 2,872 token references, 202 scripts, 641 serialized text fields, 253 styled labels, 11 RichText blocks, two EditBoxes and 1,697 configuration display fields; zero static errors or warnings. Comparison against the original backup preserves 24,097 numeric/boolean/null gameplay values and 18,813 non-display strings.

```powershell
node tools/localization/audit-project.cjs --catalog local/english-copy-backup-20261106/candidate-catalog.json --report local/english-copy-backup-20261106/candidate-audit.json
node tools/localization/native-boundaries.test.cjs
node tools/testing/rewarded-ads.test.cjs
node tools/navigation/runtime.test.cjs
```

Results: eight native-boundary checks, 13 rewarded-ad checks and 20 navigation integration checks pass. The navigation checks include the enabled sibling wall pieces referenced by `ndAniOther`, which now participate in obstacle collection. Native tests execute the real adapter code with isolated SDK/network/storage mocks; no real purchase or save reset is performed. Real device SDK behavior and final browser screenshots remain separate integration checks.

Remaining Chinese source matches were reviewed as diagnostics, inspector text, analytics, identifier validation or protocol values. In particular, `EditorManager.addDesktop` returns `桌面图标添加成功` as an internal status that `KinghtFallHomeBattleCtrl` compares before displaying a translated toast; translating that status would break the callback contract. The inactive feedback **Get Data** sample and unused generic **Label/RichText** samples remain documented authored placeholders. Artwork coverage is maintained separately by the artwork audit and runtime binding checks.

## Explicit exclusions

- Pure numbers, arithmetic signs, progress separators and clock punctuation are language-neutral data.
- Inspector field names, diagnostic console messages, analytics descriptions, SDK success/status identifiers and geographic identity-validation data are implementation metadata.
- Atlas attachment names, Spine slot/skin identifiers and resource paths must not be translated as plain text; doing so breaks references. Their visible artwork is handled by artwork localization bindings.
- The historical `configsB`/`configsD` `TextCfg` tables are retained unchanged as legacy reference data. Runtime localization reads the new catalog.
- The removed top disclaimer remains as an inactive authored node/catalog entry. The ItemHp sample **Label** text is replaced by runtime numeric content. Neither needs a new player-facing placeholder.

## Web export preparation

The installed `CocosCreator.exe` application's `app.asar/app.js` declares `--path` and `--build` options. Its builder package declares `web-mobile`, `buildPath`, `debug`, and `webOrientation` settings. A prepared release command is:

```powershell
& 'C:\ProgramData\cocos\editors\Creator\2.4.13\CocosCreator.exe' --path 'P:\Unity\Projects\Project Cocos' --build 'platform=web-mobile;debug=false;buildPath=P:\Unity\Projects\Project Cocos\build;webOrientation=portrait;title=Claim the Castle'
```

Do not treat preparation as a successful export: build after artwork and catalog validation are complete, inspect the build log, then launch the exported game and verify both languages. The semicolon option syntax is the standard Creator 2 command-line format; the installed parser implementation is compiled. The configured start scene is `assets/scenes/loading.fire`.
