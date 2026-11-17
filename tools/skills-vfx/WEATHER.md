# Biome ambience

`weather-effects.json` selects the eight authored effects referenced by the
embedded ambience images in `Characters Plan.xlsx`. The combined isolated
Unity bake accepts this manifest alongside the hero effects. Package scripts,
audio and assemblies are excluded; the bake's AudioManager is disabled before
Unity starts. Keep the Unity project, logs, screenshots and backups outside
the repository.

Publish only these eight captures with:

```text
python tools/skills-vfx/import-weather-bake.py <external bake project> <external backups>
```

The importer checks the complete weather selection against both the bake jobs
and capture output before publishing. Stable Creator UUIDs and revision checks
preserve existing metadata. The generated JSON and `WeatherVFXCatalog.js`
describe the same source prefabs and image hashes. Each atlas holds 64 frames
at 32 fps, with 128-pixel cells and no mipmaps. The render conversion preserves
authored particle motion; an overlapping loop seam is baked into the images.
No Unity particle simulation runs in the game.

Airborne snow uses one continuous `cc.ParticleSystem` batch, rather than the
whole-emitter 128-pixel flipbooks. Those captures undersampled individual flakes
to fewer than one texel, so hard frame changes made snow blink instead of fall.
`import-snow.py <external Unity project> <external backups>` reads the original
CFXR procedural P4 glow shader/material and source light/dense emitter values.
It publishes a 128-pixel flake, stable metadata and `SnowWeatherProfile.js`.
The soft particle shape is the original shader equation, with no recoloring or
AI generation. Lifetime, size, emission and horizontal drift come from the
source; the continuous 2D projection replaces Unity's depth/noise simulation.

Each snow biome has one batched particle component, capped at the source rate
times maximum lifetime (150 light, 1500 dense), with no individual flake nodes.
Native middleware uses its own particle RNG. The web emitter initializer uses a
private PRNG and the engine's existing integration/rendering, preserving combat
randomness. Pausing freezes live particles; native playback uses a scoped,
GPU-only snow snapshot while its middleware timer is disabled, then releases the
snapshot on resume or scene retirement. It allocates no capture during normal
play. Ground splashes and the rain/fire captures remain unchanged.

`BiomeWeatherState` chooses light snowfall for `snow`, dense snowfall for `ice`,
and upward/erratic flying embers for `fire` and `lava`. Snowfall includes the
matching ground snow-splash variant. Deep Forest retains the existing private
rain clock, alternating soft rain with intense/light/clear intervals; ground
rain splashes fade with the corresponding rain state.

`ForestRain` installs this presentation only in a live battle. Air tiles stay
behind HUD controls; ground splashes are attached to `ndDown`, below actors and
buildings. World-aligned ground cells retain their positions and phases when
the camera scrolls. Flipbook tiles are capped at 24 per airborne layer and 35 per ground
layer; cloned frames are shared per atlas and only changed frames dirty a
sprite. A biome uses two atlas references; Deep Forest can retain five after
all rain variants have appeared. New weather atlases use at most 8 MiB of RGBA
base levels per biome (rain's existing atlases are separate). Pause and app
hide freeze time. Epoch, map, game-data or UI retirement releases frames,
references, callbacks and ground nodes. Editor browsing installs no ambience
and writes no data.

Run `forest-rain*` and `biome-weather.test.cjs` regressions. The importer tests
use only external temporary directories:

```text
python -B tools/skills-vfx/test_import_weather.py
```
