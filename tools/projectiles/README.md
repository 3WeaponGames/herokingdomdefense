# Projectiles, Relics and icons

Open **Tools → Hero Kingdom Defense → Projectiles** in Creator. The library
contains the 25 imported arrows, original game projectiles (including the 18
wall-defense variants), and 45 Toon clips. Select a ranged unit and choose its
flight artwork, launch effect and impact effect. Size, rotation and tint affect
artwork only. Cannon and Sniper levels also expose **Flight speed · units / second**.
That saved speed is shared with Buildings and applies in Simulation Mode. Other
units show their existing speed as read only. Damage, targeting, collision and
attack timing stay in their existing systems. **Reset artwork & effects** removes
visual overrides and keeps the saved gameplay speed.

The hero follows the Arrow design saved for its equipped tier in **Items**.
An explicit flight selection in Projectiles overrides that design. The equipment
tier selector is a silent preview setting; it never changes player progress.

**Relics** edits the 27 existing relics, their level effects and costs, conversion
rewards, names, icons and icon backgrounds. Implemented effect IDs and goods
bindings are fixed. **Choose icon…** is also available on image fields in
Equipment, Talents, Battle Perks, Buildings and Units. It offers imported
SpriteFrames from runtime bundles. The picker opens with pack folders: 2D Minimal,
Minimal Hero Equipment, GUI Pro, monster portraits and original game assets.
Open a category to browse its icons; breadcrumbs and Back return to parent
folders. Search finds matching names and folders across every pack.
Explicit icon choices take precedence over
automatic item thumbnails. Icons do not alter the held equipment model.

All panels keep drafts until **Save**. A no-change save writes nothing. Saves
check revisions and retain unknown fields. Backups go under
`%USERPROFILE%/Documents/Codex Artifacts/HeroKingdomDefense/`.

## Toon conversion

The source is Hovl Studio's **Toon Projectiles 2 2.0.1.unitypackage**. Unity
particle prefabs cannot run directly in Creator. The importer renders their
authored particle geometry into transparent 32-frame 2D atlases at 24 fps:
15 flight clips, 15 launch clips and 15 impact clips. Materials use a transparent
unlit adaptation; Unity shader-graph distortion and lighting are not reproduced.
No Unity package scripts or audio are imported or executed.

1. Run `python tools/projectiles/prepare-toon.py <package> <fresh external folder>`.
2. Run the installed Unity editor with `-batchmode -quit -projectPath <folder>
   -executeMethod ToonBaker.Run -hkdOutput <folder>/Baked -logFile <external log>`.
   The prepared project's audio is disabled before startup.
3. Run `python tools/projectiles/import-toon.py <folder>/Baked` and
   `node tools/projectiles/build-library.cjs`.

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
directory. `node tools/projectiles/serve-editor.cjs` opens a standalone local
Projectiles editor on port 8792, without a gameplay scene or audio.
