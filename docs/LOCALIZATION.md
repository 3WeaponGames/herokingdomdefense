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

Preserve placeholder names and counts across languages. Keep Cocos rich text tags such as `<b>`, `<color=#43a926>` and `</c>` balanced and equivalent. Translate the text between them. Do not translate script identifiers, asset paths, enum values, or gameplay IDs.

## Localize text in artwork

### Adjust label layouts

The **Layouts** tab edits locale-specific label layout rules. Search by the translation/layout key, source context, translated wording, prefab binding, or node path. Select a layout to edit its JSON, then click **Apply layout** and **Save tables**.

`labelStyles` contains one object per locale. Supported fields include `width`, `height`, `fontSize`, `lineHeight`, `wrap`, `maxLines`, `overflow` (`NONE`, `CLAMP`, `SHRINK`, or `RESIZE_HEIGHT`), and optional `x`/`y`. Omitted values use the original UI layout, which preserves the source Chinese presentation when no Chinese override is needed. Check changes in the running game; changes to font size and wrapping can affect adjacent controls.

`nodeStyles` lists prefab UUID/file-ID bindings for that layout. `nodePathStyles` lists fallback node paths. These bindings let dynamic labels use the correct layout even when their displayed value changes. Edits to one layout preserve other bindings and catalog sections. To add a layout for a new label, enter an existing translation key in the **New key** field above and click **Add layout for new-key field**.

### Sprite bindings

The **Bindings** tab binds an original SpriteFrame UUID to a translation key. The same catalog controls these bindings, so wording can be changed without repainting the source image.

Select a binding to edit its key, replacement/overlay mode, font size, color, outline, background, and optional text region. Region coordinates are local UI coordinates represented as `{ "x": 0, "y": 0, "width": 200, "height": 60 }`. **Apply binding** stages the artwork fields in the panel; **Save tables** writes them to the game.

For an illustration that needs different artwork in a particular language, enter that locale's **SpriteFrame UUID** in the corresponding field. Leave it empty to use the text treatment. An original Chinese image can be assigned as the Chinese artwork override while other languages use text. Additional binding metadata is preserved and available in the advanced JSON field.

To add a binding, first create and translate its text key. Leave that key in the **New key** field, enter the original SpriteFrame UUID in the Bindings tab, then click **Bind to new-key field**. A binding refers to a SpriteFrame, not its Texture2D UUID. Multiple uses of a SpriteFrame share its binding; use separate SpriteFrames if those uses require different translations or layouts.

### Recreated text artwork

**Text artwork** lists `artTemplates` from the catalog. These preserve the original image dimensions and recreate text using editable translation keys and font/style metadata. Translate wording in the **Text** tab. For visual adjustments, select a template, edit its JSON, and click **Apply template**, then **Save tables**.

The compiler runs locally inside Creator and uses bundled project fonts. It writes deterministic PNG files to `assets/resources/localization/generated/<locale>/<template>.png`. It only rewrites files whose pixels changed. **Rebuild saved artwork** reruns the compiler using the catalog on disk; saving tables already performs this step automatically. Generated PNGs can be recreated and should not be hand-edited.

A template has `width`, `height`, optional `source` (a neutral project image), optional `background`, and `regions`. Each region has a `key`, a pixel `rect`, optional project `font` path, `fontSize` and `minFontSize`, `color` or `gradient`, `outlineColor`, `outlineWidth`, `shadow`, and optional `angle`. Text shrinks to fit; a build fails if it cannot fit at its minimum size. A `quad` with four `{x,y}` points maps text to an angled surface; points are clockwise from top-left. A `clip` polygon can constrain it. `locales` can override styles for a particular locale.

Template rectangles use top-left **image pixels**. Runtime binding rectangles use centered **node coordinates**; they are different coordinate systems. Font and neutral-image paths are relative to the project and restricted to files inside `assets`. An optional template `languages` list limits which locales are generated; omit it for all catalog languages.

## Verification

Run **Localization → Validate Translations** for an editor-console report, or **Validate** inside the panel for clickable issues. Validation checks coverage and token consistency; it does not judge translation quality or prove that text fits.

Preview both English and Chinese, switch languages in Settings, reopen dialogs, start a level, and check translated artwork and text wrapping. Test longer languages at narrow device sizes when adding them. A localization change should preserve player progress, audio settings, and gameplay behavior.

The editor extension's CSV, validation, and safe-save tests can be run from the project directory with:

```powershell
node packages/localization-editor/test/catalog.test.js
```
