# Icon library

The dedicated icon folder is `assets/resources/icons/`. Keep character parts,
world art, demo scenes and scripts out of this folder.

`2d-minimal/` contains the 900 icons from Layer Lab's **2D Minimal - Icon Pack
1.0.1**, imported from the licensed local Unity package. Only the original
**128 × 128** versions are included. There are no 256px or 512px copies. Original
PNG bytes, transparent canvases and publisher filenames are preserved.

`2d-minimal-hero-equipment/` contains the 60 icons from **2D Minimal - Hero
Equip Icons 1.0**, organized into **Armor** (20), **Weapons** (34), and **Items**
(6). This pack also includes only the original **128 × 128** PNGs. Its Unity
demo scene and larger image variants are excluded.

## Finding and applying icons

In Creator, browse `assets/resources/icons/2d-minimal/`, then choose a category:
Buildings, Consumables, Economy, Equipment, Items, Materials, Misc, Nature,
Props, Stats or UI. UI is further divided into Common, Play, Rewards, Shop,
Social, Symbol, System and Misc.

Drag the PNG's SpriteFrame onto a Sprite's **Sprite Frame** field as usual.
Use uniform scaling or a containing frame to preserve its square aspect ratio.

In the game authoring panels, click **Choose icon…** and search for
`icons/2d-minimal` to browse this pack, or a category such as
`2d-minimal/Economy` or a filename fragment such as `Coin_04`.
Choosing an icon changes only the draft; **Save** applies the selection.
Runtime references use the existing resource format, for example:
`@icon/icons/2d-minimal/Economy/Economy_Coin_04_Gold`.

For the equipment pack, search `2d-minimal-hero-equipment` in **Choose icon…**,
or browse that folder in Creator. Search for a name such as `HelmGolden`,
`DragonShield` or `CrystalSword` to find a specific item. For example:
`@icon/icons/2d-minimal-hero-equipment/Armor/Armor_HelmGolden`.

## Import provenance

`tools/icons/minimal-pack.catalog.json` records every icon's category, resource
reference, source Unity GUID and original PNG SHA-256. It is an authoring/import
registry, outside the runtime icons folder.
The equipment pack has its own registry, `tools/icons/hero-equipment.catalog.json`.

Reimport with:

```powershell
python tools/icons/import-minimal.py 'path/to/2D Minimal - Icon Pack1.0.1.unitypackage' --dry-run
python tools/icons/import-minimal.py 'path/to/2D Minimal - Icon Pack1.0.1.unitypackage'
python tools/icons/import-minimal.py 'path/to/2D Minimal - Hero Equip Icons.unitypackage' --pack hero-equipment --dry-run
python tools/icons/import-minimal.py 'path/to/2D Minimal - Hero Equip Icons.unitypackage' --pack hero-equipment
```

The importer validates the complete 128px set before writing, preserves existing
Creator UUIDs, rejects edited PNG overwrites, checks for concurrent changes, and
keeps transaction backups outside the repository. Reimporting unchanged content
performs no writes. Unity C# scripts, Unity demo scenes and editor logo textures
are excluded.

## GUI PRO Kit icons

The requested GUI PRO Kit - Casual Game artwork is available as Cocos sprite frames:

- `assets/resources/icons/Pictograms`: all 320 pictograms.
- `assets/resources/icons/GUI-Pro/Icons`: the 90 GUI icons from the reference sheet.

All images are original 128px PNGs copied byte-for-byte. Rune icons, demo extras and 256px/512px duplicate sets are excluded. Search the icon chooser by the source name, or use `@icon/icons/Pictograms/Pictoicon_Account` or `@icon/icons/GUI-Pro/Icons/Icon_Battle`.

Source GUIDs and hashes are recorded in `tools/icons/pictograms.catalog.json` and `tools/icons/gui-pro.catalog.json`. Reimport with `node tools/icons/import-pictograms.cjs "path/to/GUI PRO Kit - Casual Game"` and `node tools/icons/import-gui-icons.cjs "path/to/GUI PRO Kit - Casual Game"`. Reimport preserves UUIDs, performs no writes for unchanged content and refuses to replace locally edited artwork.
