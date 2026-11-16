# Projectiles, Relics and icons

Open **Tools Ã¢â€ â€™ Skills Ã¢â€ â€™ Projectiles** in Creator. Choose a ranged
unit on the left and a complete projectile from the library. It includes
imported arrows, original game projectiles (including all 18 wall-defense
variants), Toon sets, Tiny Kingdom sprites, Fantasy sets and 67 native Spine
variants. Numbered Toon flashes and hits are paired with their flight animation;
individual effect clips do not appear as separate projectiles.

The preview has four looping modes: **Play launch**, **Play flight**,
**Play on hit** and **Play all**. Missing launch and special hit effects disable
their buttons. Flight stays stationary while its artwork, particles and
animation play. Play all uses the skirmisher hero by default; choosing another
ranged unit replaces the shooter. It shows the attack animation, release,
flight, target reaction, the existing default hit and any additional projectile
hit effect. Original wall projectiles retain their complete visual prefabs in
game, including authored particle emitters and animated trails.

The active playback button reads **Pause**. Click it or press **Space** to
freeze the current frame; click **Play** or press Space again to resume from
that frame. Space leaves text inputs, selectors and other editor panels alone.
The preview canvas can receive keyboard focus by clicking it.

Match **Launch delay** with the attack using its slider or numeric field, then
Save the projectile and timing together. Animated units share the existing
Units timing setting: the marker is measured in animation seconds and its
effective elapsed release time follows the unit's saved animation speed.
Static buildings and wall cards use elapsed seconds. Reset removes the custom
delay and returns to the saved default without changing the animation reference.
The Units tab exposes **Projectile flight speed** for the hero and every ranged
character, with **Reset projectile flight speed** restoring the inherited or authored default.
This optional setting is shared across that characterÃ¢â‚¬â„¢s levels; existing hero
speed bonuses still apply. Damage, range and attack speed remain in Units.
Tower projectile speeds remain in Buildings.

The left panel also offers **Enable trail** and ten authored trail textures.
The original trail remains the default; an explicit preset replaces it, and
turning the checkbox off suppresses it. Trail, projectile and launch-delay
changes remain drafts until Save. Opening panels, browsing and preview playback
never write game data or player progress.

Projectile selection changes artwork only; damage, targeting and collision keep
their existing gameplay behavior. Saved character and tower flight speeds apply
in Simulation Mode. **Reset projectile & trail** preserves those gameplay speeds.


Tiny Kingdom's original cannonball and ballista bolt are available under
**Tiny Kingdom** in the library and assigned to the three Cannon and Sniper
tiers. Their sprites use the existing flight, targeting and hit logic.

The hero follows the Arrow design saved for its equipped tier in **Items**.
An explicit projectile selection overrides that design. Resetting the projectile
assignment restores the original unit/item behavior. Existing artwork size,
rotation, tint and unrelated content are retained until that projectile is
explicitly replaced.

**Relics** edits the 50 relics, their level effects and costs, conversion
rewards, names, icons and icon backgrounds. Implemented effect IDs and goods
bindings are fixed. **Choose iconÃ¢â‚¬Â¦** is also available on image fields in
Equipment, Talents, Battle Perks, Buildings and Units. It offers imported
SpriteFrames from runtime bundles. The picker opens with pack folders: 2D Minimal,
Minimal Hero Equipment, GUI Pro, monster portraits and original game assets.
Open a category to browse its icons; breadcrumbs and Back return to parent
folders. Search finds matching names and folders across every pack.
The **Relic Icons** collection contains all 50 transparent 128px icons and appears
after the other collections. The catalog has 18 Common, 14 Rare, 10 Epic and
8 Legendary relics. Every relic requires 3 fragments for level 1 Ã¢â€ â€™ 2 and
5 fragments for level 2 Ã¢â€ â€™ 3. New combat effects live in `RelicCombat`,
`RelicBattle` and `RelicRuntime`; their battle charges and wave reward ledgers
are included in stage checkpoints. Rarity values run from 1 (Legendary) to
4 (Common). Changing an effect parameter in Relics updates its owned runtime
snapshot when a new battle or Continue session loads.
Explicit icon choices take precedence over
automatic item thumbnails. Icons do not alter the held equipment model.

All panels keep drafts until **Save**. A no-change save writes nothing. Saves
check revisions and retain unknown fields. Backups go under
`%USERPROFILE%/Documents/Codex Artifacts/HeroKingdomDefense/`.

## Toon conversion

The source is Hovl Studio's **Toon Projectiles 2 2.0.1.unitypackage**. Unity
particle prefabs cannot run directly in Creator. The importer renders their
authored particle geometry into transparent 32-frame 2D atlases at 24 fps:
15 flight clips, 15 launch clips and 15 impact clips. Each frame is captured at
512px and supersampled to 256px, with one fixed camera fitted to the clip's
rendered coverage. This retains detail that the old bounds-based 128px capture
lost before the game ever loaded it.

The shipped conversion uses the package's corresponding Built-in material
shaders, preserving their masks, noise, emission, Fresnel and UV animation.
Capture time is deterministic. Purely additive clips retain additive blending
in both preview and game; mixed alpha/additive layers share one RGBA capture.
HDR bloom and background-dependent screen refraction cannot be reproduced by
these standard 2D flipbooks. No Unity package scripts or audio are imported or
executed. Each atlas is 2048 Ãƒâ€” 1024 (8 MiB as uncompressed RGBA, versus 2 MiB
for the previous capture); runtime textures load when referenced and are
released with their battle's projectile bank.

1. Run `python tools/projectiles/prepare-toon.py <package> <fresh external folder>`.
2. Run the installed Unity editor with `-batchmode -quit -projectPath <folder>
   -noaudio -executeMethod ToonBaker.Run
   -hkdOutput <folder>/Baked -logFile <external log>`.
   The prepared project's audio is disabled before startup.
3. Run `python tools/projectiles/import-toon.py <folder>/Baked` and
   `node tools/projectiles/build-library.cjs`.

The catalog stores complete sets separately from its stable raw asset IDs.
Flight loops skip fully transparent capture cells, retaining the source atlas
and finite launch/hit timing. Every shipped image, animation and preset has an
automated resource check.

Imports stage and validate outputs first, retain stable UUIDs, protect recorded
manual edits and concurrent changes, and keep raw packages, intermediate captures
and backups outside the game. Runtime atlases carry straight alpha and fixed
frame anchors. Reimport does not replace saved projectile assignments.

## Verification

`node --test tools/projectiles/*.test.cjs` covers resource references, draft-only
browsing, no-op saves, revision conflicts, relic saves, item selection, renderer
fallbacks, pooling, stale callbacks and effect lifetime. These tests also run
through the normal `npm test` command.

For an isolated engine integration scene, configure:

- `COCOS_CREATOR_ROOT`: Creator 2.4 installation (defaults to this PC's 2.4.13).
- `HKD_INTERNAL_BUNDLE`: an exported Creator 2.4 `assets/internal` directory,
  used only for the engine's built-in renderer materials.
- `PLAYWRIGHT_MODULE`: an installed `playwright-core` module or package directory.
- `HKD_ARTIFACT_DIR`: a fresh directory outside the repository.

Run `node tools/projectiles/verify-engine.cjs`. It uses the installed engine,
real projectile classes, textures and SpriteFrames in headless Browser and a
hidden native Simulator. Resource records and equipped tiers are isolated test
fixtures; the main gameplay scene and player saves are not opened. It checks all
25 arrow selections, every Toon clip, unchanged trajectories and hit ticks for
five projectile classes, and nonempty rendered pixels. Both hosts are muted
before engine startup; temporary sessions close automatically. `--native-only`
runs only the Simulator checks.

`node tools/projectiles/verify-editors.cjs` checks the actual authoring clients
in a muted headless browser. The Creator panel shell is supplied by the test;
only draft operations are allowed. Screenshots and reports use the artifact
directory. Add `--projectiles-only` to check projectile assignment, timing,
trail and reset drafts without the other editor panels.

`node tools/projectiles/verify-projectile-library.cjs` walks all 77 complete
sets through every available playback mode, every ranged shooter, all ten
trails and trails off. It blocks saves and checks catalog/config bytes before
and after, along with browser, console and asset errors. Set
`PLAYWRIGHT_MODULE`, optional `BROWSER_EXECUTABLE`, and an external
`HKD_ARTIFACT_DIR` for its screenshots and JSON report. The browser is muted
before startup and temporary sessions close automatically.

`node tools/projectiles/verify-playback-controls.cjs` mounts the actual client
inside open and closed shadow roots like Creator's panel host. It checks real
unit clicks, draft retention, frozen/resumed preview pixels, Space shortcuts,
input focus and listener cleanup without permitting saves.

`node tools/projectiles/serve-editor.cjs` opens a standalone local Projectiles
editor on port 8792, without a gameplay scene or audio.


## Native Spine projectiles

The **Spine Projectiles** category contains all 67 visible variants from Spine
Projectiles 1. Six shared Spine 3.8 skeleton/atlas sets retain their original
artwork and 68 original animations. The empty `fly_901` export is excluded;
`fly_20` and `fly_26` are intentional static poses held for one second.
Only data and PNGs are imported; Unity scripts and prefabs are never executed.

Each entry selects an additional `flight_loop_fly_N` animation. The maintained
loop converter removes embedded travel/launch-exit motion, keeps the local
pulses and animated trails, and closes independent tracks over a bounded common
cycle. It explicitly keys each bone, slot and draw order so recycling a pooled
renderer between variants cannot leave parts from its previous projectile.
All original animations, attachments and atlas pixels remain unchanged.

Import in two passes using fresh external directories. The first real-Spine
render measures the entire loop; the second centers that envelope at the
projectile's collision position and verifies the final loop and thumbnail.

```text
python tools/projectiles/import-spine.py prepare "<prepared SpineProjectiles1 folder>" "<external measure staging>"
node tools/projectiles/bake-spine-previews.cjs --stage "<external measure staging>" --artifacts "<external measure captures>"
python tools/projectiles/import-spine.py prepare "<prepared SpineProjectiles1 folder>" "<external centered staging>" --bounds "<external measure captures>/spine-preview-bake.json"
node tools/projectiles/bake-spine-previews.cjs --stage "<external centered staging>" --artifacts "<external final captures>"
python tools/projectiles/import-spine.py publish "<external centered staging>" --backups "<external import backups>" --dry-run
python tools/projectiles/import-spine.py publish "<external centered staging>" --backups "<external import backups>"
```

The prepared Unity source on this PC is under
`Idle Hero Defense/Assets/SpineVfx/SpineProjectiles1` beside the original
`Unity-Assets` library. Python requires Pillow; the renderer uses Creator's
installed Spine runtime and Playwright. No game or audio is loaded by the
thumbnail baker. All capture, staging and backup paths must stay outside this
repository. Thumbnails are visible transparent PNGs no larger than 128 pixels;
runtime atlas pages retain their original resolution and straight alpha.

The centering pass verifies the measured library and all six measured runtime
JSON hashes before using its bounds. Publication checks every protected staged
file, all 67 thumbnail hashes and bounds, stable metadata/UUIDs, and the current
catalog revision. One transaction publishes the resources, their native library
and only the new catalog assets/sets. Existing assignments, tiers, trails,
unknown fields and original entries are preserved. Repeating an identical
import performs no project writes; edited imported assets require review.

Run the importer regressions with `python -m unittest discover -s
tools/projectiles -p test_import_spine.py`, and the real-Spine loop regressions
with `node --test tools/projectiles/spine-flight-loops.test.cjs`.
