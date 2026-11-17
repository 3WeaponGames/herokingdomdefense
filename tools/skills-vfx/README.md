# Character Plan VFX

`Characters Plan.xlsx` is the source plan. `effects.json` describes 26 particle
captures from the selected Unity prefabs, and `native-clips.json` records eleven
animation entries, including the final-volley crop, from nine original Spine effects. Four older supplied-sheet
clips remain selectable so existing saved overrides continue to work. The
41-entry hero catalog resolves to 40 unique resource assets.

The current defaults use one final three-arrow volley, Fighter wind plus an
active-only Meshy Ki center, fixed-size Vanguard charging/buff effects, Mystic's
electric channel and target effect, the paired native Blood Cleave effects, and
Guardian's gold body shield plus separate taunt and ally protection effects.

## Runtime and authoring

- Presentation is shared by battle and the Skills preview through
  `HeroSkillVFXState` and `HeroSkillVFXLayout`. Opening editors does not create
  overrides or write gameplay data.
- Every individual layer has its own offset, scale, rotation, tint, opacity and
  delay. Presentation delays do not modify gameplay, except the explicitly
  linked complete-cast delay. Gameplay hit-area controls remain separate from
  the artwork's transforms.
- Active VFX begins at cast time zero plus its explicit **Additional VFX start
  delay**. Blank source lead-ins are trimmed automatically; damage still waits
  for its authored contact/windup. Guardian's body layers use their own slot
  delays, and a lost Mystic target cancels its pending burst.
- Fighter has one wind effect scaled by its 1–10 stacks. The center effect is
  active only during its ten-second active buff. Vanguard switches Step1 to
  Step3 during the frozen momentum buff, retaining quantized playback speed
  from 0.5 to 1.0 in ten-percent charge steps.
- Skirmisher performs one rider attack and one independently timed whole-arc
  hit. Its final three-arrow artwork retains the original source geometry;
  changing VFX playback does not add damage events. Vanguard's five contacts
  use the authored flash times and one rider cast.
  **Start width** (`visual.arcStartWidth`, default 120 world units) changes its
  flat rear hit-area edge and the gold preview outline; zero restores a pointed
  cone. VFX scale remains a separate control.
- Guardian protection loops follow only living protected allies. Its default
  active body effect uses one gold source-window loop and stops immediately
  when the shield expires or is consumed. Legacy blue intro/loop layers remain
  selectable through existing authored overrides. Mystic target
  effects stop with their channel and pooled target generations are fenced.
- Mystic's **Explosion / actual hit time** (`explosionTime`) is a VFX source-time
  marker, default `0.76666665`, matching the native explosion attachment. The
  shared clock subtracts visible source trimming and divides by cast playback,
  then adds cast delay and the separate additional actual-hit delay. Damage,
  lifesteal and hit feedback wait for that marker; ordinary channel windup is
  independent. On-hit feedback delay still starts after actual damage.
- `ForestRain` uses `BiomeWeatherState` and a separate weather catalog for Deep
  Forest rain/ground impacts, light Snow, dense Ice, and Fire/Lava embers. Weather
  owns no input, sound, combat RNG or gameplay state. See `weather-effects.json`.

## Reproducible import

Use Python with Pillow and PyYAML and Unity 6000.6.0f1. All disposable files,
Unity projects, captures and import backups must remain outside this repo.

1. Run `prepare-bake.py <Unity-Assets/VFX> <fresh external Unity project>
   --extra-manifest tools/skills-vfx/weather-effects.json`. The importer also
   resolves the selected Hyper Casual Vol.1 package in `Unity-Assets/New VFX`.
2. Launch that project using Unity batch mode, `-quit -force-d3d11`, and
   `-executeMethod SkillVfxBaker.Run`; put the log outside this repo. Keep audio
   disabled before launch. Do not use `-nographics` for particle capture.
3. Review `Baked/*.png`, loop seams, phase pivots and `clips.json`. Every phase
   except the intentionally empty opening frames must have visible pixels.
4. Run `import-bake.py <external Unity project> <external backup directory>`.
5. Run `node tools/skills-vfx/trim-lead-ins.cjs` to measure first visible source
   frames without writes; redirect its JSON report outside the repository.
   After reviewing the report, `--write` updates catalog trim metadata and its
   generated JS/native/sheet mirrors. Fully transparent effects are rejected.
6. Run `skill-vfx-trimming.test.cjs`, the `hero-skill-vfx-*` and `forest-rain*`
   tests, and the skill regressions.

Only prefab dependencies are extracted. Package C#, DLLs and audio are never
imported or executed. The isolated baker replaces render-pipeline shaders with
a sprite-compatible channel-mask/color-ramp conversion, preserving authored
particle paths and timing. Fighter wind and center are captured independently and neutralized for the
authored beige tint. Klaus packed texture channels and custom vertex streams,
and CFXR procedural glows, are converted explicitly. The older Toon Laser Blast
beam remains in the catalog for saved overrides; new Mystic defaults use the
Electric Barrier. Package spellings are **Spiky** and **Skull**.

The baker uses deterministic seeds, a fixed group-wide pixel envelope, fixed
pivots, straight-alpha output and a short overlap at loop seams. Particle
captures default to 128 pixels per frame, with atlas dimensions capped at 2048.
Vanguard Momentum uses the original Unity Shader Graph materials in an isolated
URP capture, 256-pixel antialiased frames and the same 1.5-second source loop.
Its `referenceCell: 128` preserves the authored world size after increasing
resolution. These ground effects render in front of the horse and rider.
Native Spine effects retain their original atlas resolution. Runtime does not
simulate Unity particles or instantiate their prefabs.

Publication uses stable UUIDs, revision checks and external original backups.
It rejects partial/duplicate manifests, unsafe filenames, mismatched jobs and
invalid layout/pivot metadata before publishing any production asset.
It does not touch gameplay JSON, saved progress or the workbook. Reimport
refuses to replace edited metadata. The JSON and generated JS catalogs must
remain identical; both are generated by the import tools.

The catalog's `workbookSha256` records the workbook snapshot used for that bake.
Renaming the plan or editing unrelated gameplay notes does not require new VFX
atlases. Validation compares the baked clip sources and layout against the
selection manifest and verifies each atlas hash, without overwriting this
historical provenance to match a later planning document.

The two supplied Guardian test sheets are imported by `import-sheets.py` using
`--taunt <original PNG> --shield <original PNG> --backups <external directory>`.
They use fixed source hashes and grids, white-matte removal, and proportional
128-pixel cells. Taunt plays its 60 frames once above each affected enemy. The
body shield has separate appearance, ping-pong sustain, and release phases.
The maintained `sheet-clips.json` preserves these additions when Unity captures
are reimported. Neither original sheet nor backups are stored in the project.

## Native effects

Run `import-native.py <Unity project/Assets/SpineVfx/Collections20261030>
<external backups>` before particle publication. It copies only the exact
3.8 JSON, atlas and original PNG pages with stable identities; no Unity
behaviours or executable package code enter the game. The catalog retains
separate physical-shield intro and loop animations over one shared asset.
`authored_paths.py` samples all nine arrow meshes plus their sparse linear
deformation at 120 Hz. Native import atomically regenerates the matching
`HeroSkillArrowPaths.js`, release centroid and production-skeleton SHA-256.
Its standalone CLI writes an external JSON sample for inspection; new weighted
meshes, animated bones or Bezier deforms fail explicitly until verified.
Lead-in analysis requires painted pixels and nonzero triangle area, so an
attached zero-area mesh does not count as visible. Ordinary effects loop only
their visible source interval. Native Skirmisher and Vanguard use dedicated
source clocks: preparation is fitted to the bow release or first spear contact,
then the remaining source frames retain their selected playback. These native
clocks bypass ordinary trim mapping to prevent applying a source trim twice.

Vanguard's native flash center is measured from `guangyunadf_0000`. The mean
source spear direction supplies its facing calibration, including nonuniform
art scaling. The flash and the middle of the damage arc's rear edge follow the
live spearhead; their offsets use spear axes and mirror with facing. VFX and
damage transforms share the same math in battle, preview and drag handles.

The selected SP162 effects use `prepare-sp162.cjs <SP162 source directory>
<external staging directory>`, followed by `import-sp162.py <external staging>
<external backups>`. Preparation reads the original 3.8.99 binary, preserves
region attachments, setup transforms, blend modes, key times and exact cubic
handles, and verifies the converted JSON against source poses at 240 Hz plus
both sides of every key boundary. Unsupported attachment, constraint or timeline
types fail explicitly. Original atlas pages are copied byte for byte. The tiny
binary fixtures support the maintained source-pose regression tests without
requiring the external Unity project. Publication validates source hashes and
uses the same revision checks and external backups as the other importers.

The current native defaults are Fighter `301020_attack2`, Bruiser
`301010_skill3` plus `300950_skill_hit1`, and Guardian `301060_skill_hit`.
Both Bruiser effects start together and retain independent authoring controls.
An explicitly saved legacy/custom/disabled primary keeps its existing look;
the new secondary is inherited only with the new default pair, unless selected
explicitly. Source-center metadata centers native artwork on its authored
attachment without rewriting original bones, meshes or animation keyframes.
Guardian's selected source window is frames 15–140 on the preview's 60 FPS
ruler (`sourceStart=.25`, `sourceEnd=140/60`); its original animation is 2.667
seconds long. The source artwork and source frame transitions remain exact.
Legacy Unity slash and cleave clips remain selectable at their original capture
resolution. Rerun the collection import before the SP162 import when rebuilding
from source, then publish the particle catalog with `import-bake.py`.
Collection refreshes preserve independently imported native IDs, and particle
publication retains their current default presets.

`import-single-volley.py <external backups> [--node <Node executable>]` derives
Skirmisher's selected final three-arrow set from source seconds 1.44–2.0. It
retains those three meshes and their two original release-flash layers, samples
the crop-boundary deformation, and rebases the authored keys. The sibling
skeleton and atlas share the original PNG texture UUIDs; the original triple
volley stays selectable. Publication compares actual selected-source geometry
at 1000 Hz and on both sides of key boundaries before applying its transaction.
Float32 key rebasing introduces less than .001 source-coordinate displacement
(less than .00016 world units at the default scale). Its own release is
.0933333333 source seconds after the crop start; the gameplay fan's hit delay
and range remain separate authoring controls.

Skirmisher now performs one rider attack and one whole-fan damage check. The
three visible arrows do not run individual collision queries. `volleyHitTime`
(default .2 seconds) plus `contactDelay` and `visual.castDelay` selects the one
hit moment. `volleyRange` (250 units), `visual.arcDegrees` (16 degrees), and the
hit-arc offset/rotation controls define its gold preview boundary. The origin
and direction stay captured at cast; targets are sampled at the hit moment.
Cast VFX transforms and `volleyPlayback` change the artwork independently.
Legacy saved repeat/count fields remain untouched but no longer add attacks.

Vanguard's five contacts and cast effect translate with hero ground position
while their captured direction, radius and local offset stay fixed. Each
contact checks current enemies afresh. Fighter's wind and active aura and both
Vanguard momentum effects use ground emitters with zero default vertical offset;
explicit saved offsets remain authorable. The active-only `activeDamage`
defaults are .8 for Skirmisher and .5 for Bruiser, applied after their existing
charged/distance or missing-HP calculations. Ordinary attacks, passive bonuses
and Blood Cleave's current-HP sacrifice keep their existing rules.

## Loading barrier and memory

`HeroSkillAssetWarmup` joins the existing `KinghtFallModle` startup Loading
chain. It loads the fixed 40 unique sprite/Spine assets sequentially, waits for each texture
to decode and initialize its GPU object, then fences GPU work before Main can
open. On JSB the read-only GL query drains the buffered finish command. It does
not render a camera, instantiate actors, or change gameplay or player records.

The pool retains one session reference per resource. Shared texture pages are
counted once (179.70 MiB of RGBA base levels, no mipmaps). Active hero/weather consumers own and release independent
references. This avoids later cold style/stage switches, which do not all enter
the Loading scene. The decoded budget is verified from every actual PNG page. Native integration
must also check process peak residency, including possible decoded copies.

An abandoned Loading scene cancels incomplete jobs and their texture listeners.
Expired callbacks cannot advance a replacement scene. Resource failures use the
existing recovery/retry UI and keep Loading behind the readiness barrier.
