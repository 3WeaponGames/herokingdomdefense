# Hero Kingdom Defense — authoring tools

Open **Tools → Hero Kingdom Defense** in Cocos Creator 2.4.13. Each entry opens a dockable panel. The extension is project-local under `packages`; editor UI and preview code are not included in game builds.

## Editing and saving

Browsing, choosing a model, playing an animation, scrubbing, and inspecting a map do not save game content. Properties edit a shared draft across all panels. **Review** shows the exact fields being changed. **Save changes…** opens a review and requires the final Save button. **Undo**, **Redo**, and **Discard** operate on the shared draft.

A no-change save performs no writes. Numeric edits preserve untouched JSON bytes and number spellings. Existing IDs, optional fields, unknown fields, and data order are retained. If a file with draft edits changes outside these panels, saving stops instead of overwriting it. Untouched files, such as an updated translation catalog, are read again and validated with the draft before saving; their external changes are preserved. A failed save retains the draft and its undo history. Saved files are backed up under `local/game-data-editor/backups/`; multi-file saves have a recovery journal. An interrupted save is shown on reopening and requires an explicit recovery action. Recovery refuses to overwrite subsequent external changes.

After saving, reload an existing game preview to use the new data. The panels do not restart or modify a battle already running. Configuration edits do not change player save files. A Creator import error is reported separately from a completed disk save.

The baseline used during implementation included all existing uncommitted work. No initial overrides or migrated defaults were written to the game's configuration.

## Panels

| Panel | Controls |
|---|---|
| Stages & Waves | A/B/D variants, stage properties, map selection, challenge/reward settings, building-slot unlocks, wave multipliers and silver, ordered unit/count groups, wait groups, wave duplication/reordering/removal, linked missions, global spawn interval. |
| Battle Perks | All 57 perks, rarity, selection weight, icon, actual effect parameters, language-specific names/descriptions, talent prerequisites, availability override, live effect description. |
| Buildings | Six building families, costs, HP, branching upgrades, appearance, tower/castle attack values, barracks recruitment/capacity/respawn, house/mill economy. |
| Equipment | Six equipment tracks, level values/costs/unlocks, localized wording and appearance; selected equipment levels can be viewed on the hero. |
| Talents | All existing talent definitions and progression records, prices, effect values and percentage flags, localized wording and computed effect preview. |
| Units | Hero, 12 independent enemy records including boss forms, four independent allied records, combat roles and counters, special parameters, appearance/animations, optional per-unit attack timing. |
| Maps | Four actual playable prefabs, artwork/physics/path overlays, pan/zoom, object and collision-point dragging, transforms, obstacle duplication/deactivation, spawn/build slots and route conditions, route tests. |
| Battle Settings | Shared parameter values and optional building standing-time override. |
| Testing | A dedicated muted test player, Gold/Gems quick grants, individual or bulk items, equipment levels, talent progression, stage unlocks, inventory, and backed-up full reset. |

## Testing player

Opening **Testing** only reads status. **Start muted test game** opens a managed game window using its own persistent profile for this project. It does not attach to an independently opened Browser or native Simulator save. The profile resumes between sessions and remains muted. Closing the game preserves that test player's progress.

Testing buttons apply immediately to the named managed test player; they are intentionally separate from the configuration draft/Save workflow. Quick buttons grant 99,999 Gold or Gems. The item picker includes the game's currencies and relics. The first relic copy unlocks it; further copies add fragments using the existing game rules. Battle silver requires an active battle and is skipped by a bulk grant outside battle.

Equipment controls set owned levels without changing equipment stats or costs. Talent and stage controls change only test-player progress. Stage progression changes require the home screen. Some appearance/stat changes take effect on reopening their game screen or beginning the next battle, as indicated by the command result.

**Reset test player to the beginning** names the target and requires a typed confirmation. It stops the managed game's writers, captures and verifies a backup under `local/game-data-editor/testing-backups/`, then clears that isolated profile and reloads it. Player progress, items, equipment, rewards and tutorial state restart. Project configuration, map/animation assets, and other players are not reset. Remote-save connections are rejected by the testing command adapter.

The managed game must be ready and development Test Mode must be available. Opening the panel never grants items, starts the game or resets anything. The default keyboard testing controls remain available in its game window.

### Sources and dependencies

- Main data is `assets/KinghtFallConfig/GameJsonCfg.json`. Variants B and D replace complete stage tables; they do not inherit individual stage fields. Common unit/perk/equipment settings remain shared from A. Variant C uses A.
- Stage names and other wording resolve through `assets/resources/localization/catalog.json`. Shared translation usages are identified. Numeric effect edits retain translation placeholders. The historical migration catalog builder is not invoked by these tools.
- Hero base stats come from Equipment. Allies use `AllyCfg`; enemies use `SoldierCfg`. Unit IDs, wave strings and barracks references stay stable, but names, icons, stats, appearances and timings are scoped to the side. Barracks editors modify allied records only. Legacy data without `AllyCfg` retains its original behavior.
- The six combat roles are **Fighter, Skirmisher, Vanguard, Mystic, Bruiser and Guardian**. Assign a role under **Unit type**. **Countered unit type** applies the existing counter-damage multiplier (currently 1.25x) to every opposing unit in that role; **None** disables the bonus. Roles do not alter AI, movement, weapons or target priority. Types can be added or renamed under **Manage types & pictograms**; referenced types cannot be deleted.
- In **Units**, **Attack animation speed (saved)** accepts 0.1–4× and stays in the shared draft until Save. It applies to attack layers, including the combined cavalry rider and horse, in browser and native Simulation Mode. Temporary **Preview speed** affects only the preview. The gold release marker follows the saved multiplier (for example, a 0.6-second marker plays after 0.5 seconds at 1.2×); its stored value and the authored green reference remain unchanged. **Reset attack speed** removes only this unit's speed override. Movement and the attack interval retain their existing settings.
- Every enemy has its own 128px head portrait under `assets/resources/icons/enemy-heads`. The unit's selected Battle icon takes precedence over the role's fallback pictogram. Boss forms have separate portraits. The source monster artwork is unchanged.
- Spawn waits use the existing `-1` unit marker. Counts, waits, lane order and group order keep their current runtime meaning.
- Stage/wave indices and upgrade branches have runtime dependencies. Invalid new references and cycles block saving. Existing duplicate spawn lanes and an inactive map route placeholder are reported without being automatically repaired.
- Asset checks use real resource bundles, imported sprite frames, controller compatibility and available skins/animations. A filename that exists in the wrong bundle is not accepted.
- `AttackPriority` is legacy metadata with no current runtime reader. It is shown read-only. The editor does not invent new targeting rules or new skill implementations.

## Animation and attack preview

The preview renders the actual Spine data in an isolated editor renderer. It does not instantiate gameplay controllers or load the game. There are no audio sources in this renderer. Hero equipment layers and boss forms use the corresponding authored assets.

Use Play/Pause, the timeline, exact seconds, or previous/next frame. The 30/60 FPS grid is a stepping aid; changing it does not quantize saved timings. Preview speed, skin, facing, zoom and temporary hero equipment selections are preview-only.

The **gold marker** is the editable gameplay hit or projectile-release time. **Green markers** are the fixed reference events embedded in the original animation. Use the frame controls and **Use current frame** to move gold to the desired pose; green stays at the authored reference.

For melee/special effects, edit the effect time. For ranged attacks, edit **projectile release**; impact still follows projectile arrival. The target-distance demonstration uses a stationary target and fixed simulation steps, and is labeled accordingly. Actual moving targets change arrival time.

Dragging the timing control or **Use current frame** creates a draft. **Reset to default** removes the custom override and returns gold to the unit's saved animation-derived default. Save explicitly to apply it. Overrides are scoped to side, unit and boss form, not shared skeleton assets.

On 2026-11-07 the user explicitly approved applying the authored attack-event markers as gameplay defaults for all 17 unit entries. These are stored in `GameTools.timingDefaults`: the hero releases at 0.1667 seconds; all 12 enemy/boss entries and four allied types use 0.5 seconds. `GameTools.timings` holds custom values and takes priority, including an explicit zero. Resetting a custom value restores the saved default. Opening panels never reseeds either table.

Optional settings are stored under `GameTools` in the existing A configuration. No extra runtime asset is loaded. When neither a saved default nor custom timing exists, attacks retain the original synchronous code path. Delayed effects handle pause, cancellation, death, pooling, form changes and replaced animations. Game speed scales the animation and timing together. Existing projectile/target/damage implementations remain in use.

## Map editing

Maps opens the runtime prefab, not the separate map-authoring scene copies. Edits remain drafts until Save. The header lists stages sharing a map. Moving an object transforms its existing collision geometry; editing scenery alone does not invent collision geometry.

Green shapes represent active registered navigation obstacles. Disabled/sensor/unregistered shapes are distinguished. A route test uses the game's existing navigation planner against the authored geometry; battle unlocks and building upgrades can change that geometry at runtime.

**Reveal prefab** selects the actual asset in Creator without switching the active scene or saving it. Use Creator's own Prefab mode for unrestricted component/art authoring. In the Maps panel, duplicating an obstacle remaps its serialized subtree references; removing an obstacle deactivates it to preserve existing reference indices.

## Verification

Run `node packages/game-data-editor/test/run.js` from the project root. The tests exercise source-preserving saves, conflicts/rollback/recovery, semantic and resource validation, map edits and route planning, scoped timing, original attack traces, and actual Spine poses. Save tests use temporary project copies.

Live Creator checks cover all dockable panels, shared draft editing/undo, and silent visual previews. A muted isolated browser loaded all 17 saved animation defaults, and controlled actors exercised their hit/release dispatch through the compiled runtime. The live Units panel was checked for resetting gold to the saved default and moving gold independently of green; the user's drafts and history were restored afterward. Native verification runs the helper in real Windows JSB with injected actors; it is not a complete interactive native combat certification.

Other project work may modify UI assets concurrently. The tools never restore unrelated files to the captured baseline. Current game balance, map and animation files are not rewritten as part of installation.
