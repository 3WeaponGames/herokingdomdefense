# Map baking

`bake-map.cjs` composites the maintained source sprites in a map recipe into four opaque ground tiles and nine transparent terrain groups. Each output stays within a 2048-pixel texture limit. Terrain groups keep their own collision owner and ground anchor in the map prefab.

Preview without changing production assets:

```powershell
node tools/maps/bake-map.cjs tools/maps/stage07/recipe.json
```

Write the production textures explicitly:

```powershell
node tools/maps/bake-map.cjs tools/maps/stage07/recipe.json --write
```

Set `HKD_ARTIFACT_DIR` to an external task folder for previews, logs, reports and texture backups. The default also stays outside the project, under Documents/Codex Artifacts/HeroKingdomDefense/map-bakes. Set `HKD_MAP_BROWSER` if Chromium is installed outside the detected browser locations. The compositor uses an isolated, muted browser session and never launches the game or accesses player storage.

Source sprites under `stage07/source` are maintained production inputs. The map concept itself and generation prompts stay in the external artifact archive. Re-baking does not open or save a Cocos scene or edit player progress. Review transforms and collision shapes in the Maps panel before saving a changed map layout.

After changing a recipe, synchronize the existing prefab's artwork dimensions and ground anchors using its external bake report:

```powershell
node tools/maps/sync-prefab.cjs tools/maps/stage07/recipe.json "$env:HKD_ARTIFACT_DIR/bake-report.json" --write
```

Omit `--write` to inspect the pending sync. This preserves moved terrain roots, colliders, building placements, and unrelated prefab fields. A changed prefab is backed up beside the external report; an unchanged sync writes nothing. `stage07/layout.json` records the reference coordinates, collision footprints and entrance corridors used to author Map07. Later map-editor changes remain in the prefab until explicitly saved.
