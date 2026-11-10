# Character and monster imports

The Characters panel uses the model's package and imported rig metadata to choose its controls:

- Hero and allies use Character Maker equipment and the existing level controls.
- Minimal Enemy Monster Packs 1–3 are finished models; they do not expose appearance fitting controls.
- Fantasy Bosses and Fantasy Monsters expose their supplied outfits, compatible body parts, part visibility, colors, transforms, and available facial expressions. Automatic expressions retain the source animation's expression changes. Outfit choices share a family and animation controller; Titan species remain separate.

The package filter and name/package sort are presentation settings. Browsing never writes game data. Appearance edits remain in the shared draft until **Save characters**. Saved Fantasy appearances are baked to ordinary native Spine data, using the same guarded publication transaction as existing characters.

## Repeatable import

Run from the project root with Python, Pillow, PyYAML, and Node installed. Keep the supplied Unity archives outside the repository and pass an external artifacts directory for staging and backups:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
python tools/characters/import_units.py '<Pack 3.unitypackage>' --kind monster3 --artifacts '<external artifacts folder>'
python tools/characters/import_fantasy.py '<Bosses.unitypackage>' --kind fantasy-bosses --dependency '<Megapack.unitypackage>' --artifacts '<external artifacts folder>'
python tools/characters/import_fantasy.py '<Megapack.unitypackage>' --kind fantasy-monsters --artifacts '<external artifacts folder>'
node tools/characters/register-monster-roster.cjs
node tools/characters/register-fantasy-effects.cjs
```

Bosses reference one disabled placeholder sprite supplied by the Megapack. The dependency fills missing assets only; it never replaces the Bosses package's own animation versions. The placeholder is not exposed as usable equipment.

Imports preserve source sheet pixels, slice file IDs, pivots, transform/color animation, sprite changes, and authored attack events. Unity `SetHead`/`SetWheels` events become native attachment timelines. Unity scripts and materials are not executed. The two stationary chest presets have no authored walking or attacking clips; required runtime action names use their idle pose and their imported combat preset deals zero damage.

Fantasy attack particles use ordinary Spine regions and the existing attack clock. Their color and shape follow the creature's style; their origins follow its weapon or mouth. Cues use the authored attack event, or the existing midpoint convention for eventless attacks. Clip lengths, body tracks, events and gameplay timings remain unchanged. Idle, movement and death reset attack particles; hit reactions do not interrupt the primary effect.

Bug Queen, Moss Queen and mounted Moss Queen include native ports of their supplied circular ambient emitters, with the source rate, particle cap, lifetime and color/size gradients. Their independent five-second loop uses track 2; the attack and hit reaction tracks retain their owners. The missing external Unity particle material is replaced with a neutral 2D billboard. These decorative particles do not add collision or gameplay forces.

Dragon projectiles and impacts use finite Fantasy flipbooks through the existing projectile presentation system. Defaults follow the current saved model, while explicit Projectiles-panel choices take precedence. Flight paths, target validation, damage callbacks and speeds are unchanged. Repeatable registration adds only the generated library entries, preserving existing assignments.

Stable roster IDs live in `monster-roster-definitions.json`. Registration adds missing records only, preserves authored records and timing overrides, and is a no-op when already registered. New eventful models use their authored attack event as their initial gameplay timing; eventless models use the existing importer convention. This never reseeds existing timing tables or changes campaign waves.
