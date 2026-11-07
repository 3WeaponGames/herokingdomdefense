# Hero item editor

Open **Tools → Hero Kingdom Defense → Items**. The local review window is `node tools/characters/serve-items.cjs`, at `http://127.0.0.1:8791/`.

The item list includes all **210 current equipment tiers** in the original six slots: Cape, Helmet, Arrow, Bow, Gloves, and Mount. Selecting an original tier previews its existing artwork on the hero, with no writes. **Edit this item** creates an appearance draft for that tier. **New item** and **Duplicate** create additional named item definitions.

Use **Adjust original model** to move, resize, rotate, fade or change the skin of the existing gear. The starting layer matches the selected equipment category. Reset removes that layer's overrides. You can also choose imported artwork, fit it to a model layer/bone, and adjust its hidden original pieces and draw order as in the Characters tool. Check idle, movement and attack in either direction.

**Royal Helmet · parts example** is saved in the item library as an unassigned example. It does not replace the hero's current hat until you explicitly assign it and save.

Check **Use this item at this tier** and **Save items** when the item should appear in the game. That saved assignment replaces the physical appearance of the hero's gear at the selected slot and upgrade level; its icon and name also appear on the hero equipment screen. An unassigned saved item stays in the library for later use. New/reloaded game sessions read saved assignments.

New items use the selected tier's existing statistics, unlocks, upgrade costs and progression. **Edit stats and upgrades** opens the existing Equipment tool in Creator. No gear balance or player progress is changed merely by opening or browsing either editor. These definitions are alternative physical gear appearances; they do not add a separate loot/inventory economy.

Saved item appearances live in `assets/resources/hero-items/catalog.json`. Original equipment tables and saved player upgrades are preserved. Drafts, explicit saves, no-change saves, revision protection and exact-source backups work the same way as the Characters tool. Equipped item parts take priority when an outfit and item target the same model slot.
