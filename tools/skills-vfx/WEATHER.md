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

`BiomeWeatherState` chooses light snowfall for `snow`, dense snowfall for `ice`,
and upward/erratic flying embers for `fire` and `lava`. Snowfall includes the
matching ground snow-splash variant. Deep Forest retains the existing private
rain clock, alternating soft rain with intense/light/clear intervals; ground
rain splashes fade with the corresponding rain state.

`ForestRain` installs this presentation only in a live battle. Air tiles stay
behind HUD controls; ground splashes are attached to `ndDown`, below actors and
buildings. World-aligned ground cells retain their positions and phases when
the camera scrolls. Tiles are capped at 24 per airborne layer and 35 per ground
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
