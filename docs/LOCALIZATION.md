# Localization

The game uses a shared localization catalog at `assets/resources/localization/catalog.json`. English (`en`) is the default language and Simplified Chinese (`zh`) is the second language. The player's chosen language is stored locally and survives reopening the game.

## Edit translations in Cocos Creator

Open **Localization → Translation Tables** in Cocos Creator 2.4.13. If the menu is missing immediately after installing the project package, reload the package or restart the editor once.

- **Text** shows stable keys, their source/context, and one column per language. Search works across keys, translations, and context. Select a language to focus on one column; **Missing only** shows unfinished rows.
- Edit cells, then use **Validate** to check missing translations, placeholders, rich text tags, and referenced keys. Click a validation issue to find its row.
- **Save tables** writes the catalog, rebuilds localized text artwork, and asks Creator to reimport it. The previous file is backed up in `local/localization-backups/`. Reload the browser preview to read table changes. A failed artwork build is shown explicitly; fix the reported template and rebuild before release.
- **Reload** rereads the catalog from disk. Saving refuses to overwrite a catalog changed by another editor or script since it was loaded.
- Unsaved table edits are kept as a recovery draft on this computer. Reopen the panel and use **Restore draft** after an accidental closure. A stale draft cannot replace a newer disk revision.

Keys are identifiers, not English phrases. Changing a translation does not require changing its key or code references. Context explains where and why a line appears. Do not rename a key without updating its references.

## Add another language

Expand **Add a key or language**, enter a locale code such as `fr` and its native name such as `Français`, then click **Add language**. The panel creates its language-name entry and a new empty translation column. Translate every row, including language-name entries, then validate. Set the **Default** dropdown only if new players should use that locale by default. Existing saved player preferences remain in effect.

Do not delete English or Chinese translations when adding a language. Each language may have its own typography and artwork needs; check it in the browser preview at the game's supported resolutions before release.

## Exchange tables with translators

**Export CSV** exports the panel's current text table, including unsaved edits, with UTF-8 encoding, a BOM, and columns `key,context,en,zh,...`. Quoted commas, line breaks, quotation marks, Chinese text, placeholders, and rich text are preserved.

**Import CSV** merges rows into the panel; it does not immediately write the game catalog. Review the result and click **Save tables**. Importing a subset of language columns updates only those columns. Missing rows remain untouched. Add a language in the panel before importing its column. Duplicate keys, duplicate headers, unknown language columns, and malformed CSV are rejected.

When opening CSV in spreadsheet software, import translation columns as **Text**, so the spreadsheet does not treat strings beginning with `=`, `+`, or `-` as formulas or change numeric-looking text. CSV contains text entries only; artwork bindings remain in the JSON catalog and are preserved during CSV imports.

## New UI and script text

Add a catalog entry before adding visible text. For a label with fixed text, attach the `LocalizedLabel` component and set its `key` to the bare stable ID, for example `settings.language`. The existing `TranstaLabel` component remains compatible with migrated content.

For dynamically generated text:

```js
var language = require('LanguageMgr').LanguageMgr.getInstance();
language.bindLabel(label, 'battle.wave', [waveNumber]);
// Catalog: en: "Wave {0}", zh: "第{0}波"
```

`bindLabel` keeps the stable key and parameters attached to the label, so switching languages preserves its meaning even when two English entries happen to have the same wording. The manager's `t`/`T` methods return translated strings for external APIs such as native platform dialogs. A serialized string or data-table field can reference an entry using `[[loc:battle.wave]]`; runtime lookup accepts either that token or a bare key. Keep words and sentence structure in translation entries. Avoid constructing sentences by concatenating language-specific fragments around variable values: use a full sentence with `{0}`, `{1}`, etc. instead.

Existing internal UI helpers return stable `[[loc:...]]` or encoded `[[fmt:...]]` tokens until they reach a Label/RichText. Do not hand-edit the encoded format payload. Late-loaded prefabs, pooled UI, and live-node clones retain their translation bindings. EditBox placeholders translate; player-entered text and RichText's generated fragments are left to their owning components.

Preserve placeholder names and counts across languages. Keep Cocos rich text tags such as `<b>`, `<color=#43a926>` and `</c>` balanced and equivalent. Translate the text between them. Do not translate script identifiers, asset paths, enum values, or gameplay IDs.

## Localize text in artwork

### Adjust label layouts

The **Layouts** tab edits locale-specific label layout rules. Search by the translation/layout key, source context, translated wording, prefab binding, or node path. Select a layout to edit its JSON, then click **Apply layout** and **Save tables**.

`labelStyles` contains one object per locale. Supported fields include `width`, `height`, `fontSize`, `lineHeight`, `wrap`, `maxLines`, `overflow` (`NONE`, `CLAMP`, `SHRINK`, or `RESIZE_HEIGHT`), `horizontalAlign` (`0` left, `1` center, `2` right), and optional `x`/`y`. Omitted values use the original UI layout, which preserves the source Chinese presentation when no Chinese override is needed. Check changes in the running game; changes to font size and wrapping can affect adjacent controls.

`nodeStyles` lists prefab UUID/file-ID bindings for that layout. `nodePathStyles` lists fallback node paths. These bindings let dynamic labels use the correct layout even when their displayed value changes. Edits to one layout preserve other bindings and catalog sections. To add a layout for a new label, enter an existing translation key in the **New key** field above and click **Add layout for new-key field**.

### Sprite bindings

The **Bindings** tab binds an original SpriteFrame UUID to a translation key. The same catalog controls these bindings, so wording can be changed without repainting the source image.

Select a binding to edit its key, replacement/overlay mode, font size, color, outline, background, and optional text region. Region coordinates are local UI coordinates represented as `{ "x": 0, "y": 0, "width": 200, "height": 60 }`. **Apply binding** stages the artwork fields in the panel; **Save tables** writes them to the game.

For an illustration that needs different artwork in a particular language, enter that locale's SpriteFrame UUID or generated resource path in the artwork field. Generated paths have the form `localization/generated/en/tile_by` without the file extension. A published `template` binding derives the same path for newly added languages. Bindings without a template can use the text replacement/overlay treatment; unfinished template bindings retain their source image. Additional binding metadata is preserved and available in the advanced JSON field.

To add a binding, first create and translate its text key. Leave that key in the **New key** field, enter the original SpriteFrame UUID in the Bindings tab, then click **Bind to new-key field**. A binding refers to a SpriteFrame, not its Texture2D UUID. Multiple uses of a SpriteFrame share its binding; use separate SpriteFrames if those uses require different translations or layouts.

### Recreated text artwork

**Text artwork** lists `artTemplates` from the catalog. These preserve the original image dimensions and recreate text using editable translation keys and font/style metadata. Translate wording in the **Text** tab. For visual adjustments, select a template, edit its JSON, and click **Apply template**, then **Save tables**.

The compiler runs locally inside Creator and uses bundled project fonts. It writes deterministic PNG files to `assets/resources/localization/generated/<locale>/<template>.png`. It only rewrites files whose pixels changed. **Rebuild saved artwork** reruns the compiler using the catalog on disk; saving tables already performs this step automatically. Generated PNGs can be recreated and should not be hand-edited.

A template has `width`, `height`, optional `source` (a neutral project image), optional `background`, and `regions`. Each region has a `key`, a pixel `rect`, optional project `font` path, `fontSize` and `minFontSize`, `color` or `gradient`, `outlineColor`, `outlineWidth`, `shadow`, and optional `angle`. Text shrinks to fit; a build fails if it cannot fit at its minimum size. A `quad` with four `{x,y}` points maps text to an angled surface; points are clockwise from top-left. A `clip` polygon can constrain it. `locales` can override styles for a particular locale.

Template rectangles use top-left **image pixels**. Runtime binding rectangles use centered **node coordinates**; they are different coordinate systems. Font and neutral-image paths are relative to the project and restricted to files inside `assets`. An optional template `languages` list limits which locales are generated; omit it for all catalog languages.

`pending: true` explicitly marks unfinished art. The compiler skips and reports that template, and the runtime retains its source image. A ready template with a missing neutral image or font is an error. Correct the source path or mark the draft pending; a successful table save alone does not mean all artwork was rebuilt.

Existing field tiles, labels embedded in textures, and bound Spine atlas text use these same text entries and template controls. For Spine, `spineImages` maps each original **Texture2D UUID** to a template; this differs from sprite bindings, which use SpriteFrame UUIDs. Keep atlas dimensions, packed regions, and animation geometry unchanged. Change the words in **Text**, or font/region styling in **Text artwork**, then save and reload the preview. The runtime creates separate localized SkeletonData assets instead of editing the shared original animation asset. Startup preloads ready Spine textures before the game opens.

Use exact source-wording matches when retaining original Chinese artwork. A single-text sprite binding can contain `preserveOriginal: { "zh": "兵营" }`; it uses that original only while the bound Chinese entry still equals `兵营`. An atlas with multiple text regions uses a map, for example:

```json
"preserveOriginal": {
  "zh": {
    "art.result.victory": "胜利",
    "art.result.defeat": "失败"
  }
}
```

After any listed Chinese entry changes, the generated Chinese atlas is used. Use the exact wording actually baked into the source. Avoid `true` for editable source preservation: that legacy value always keeps the original regardless of table edits. CSV imports preserve these routing and source-match fields.

Automated runtime checks cover Sprite and Spine switching, stale async requests, pooled nodes, animation timing/queues, and completion callbacks. The native Spine implementation follows the installed Creator 2.4.13 adapter but still needs a native-device test. A live native cached-animation switch restarts its animation because that adapter does not expose its elapsed frame/consumed queue; the current localized result/sign-in prefabs use realtime animation. Active crossfade identity is not retained when replacing SkeletonData.

## Verification

Run **Localization → Validate Translations** for an editor-console report, or **Validate** inside the panel for clickable issues. Validation checks coverage and token consistency; it does not judge translation quality or prove that text fits.

Preview both English and Chinese, switch languages in Settings, reopen dialogs, start a level, and check translated artwork and text wrapping. Test longer languages at narrow device sizes when adding them. A localization change should preserve player progress, audio settings, and gameplay behavior.

The editor extension's CSV, validation, and safe-save tests can be run from the project directory with:

```powershell
node packages/localization-editor/test/catalog.test.js
node tools/localization/runtime.test.cjs
node tools/localization/lifecycle.test.cjs
node tools/localization/artwork-runtime.test.cjs
node tools/localization/artwork-compiler.test.cjs
node tools/localization/spine-artwork.test.cjs
```

The Spine test uses the installed engine at `C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine`; set `COCOS_ENGINE_ROOT` if yours is elsewhere. These automated checks supplement visual preview testing; they do not certify translation quality, every device layout, or native deployment.

For rewarded-ad testing, see [TEST_MODE.md](TEST_MODE.md). **F8** toggles the preview/debug-only mode: eligible rewarded-ad callbacks succeed without playing an ad and the supported ad caps/cooldowns are bypassed. Ownership and progression rules still apply. It is off for a fresh development profile, restores the local development preference, and cannot be enabled in release builds. Its badge and messages are normal catalog entries and translate through the same panel.
