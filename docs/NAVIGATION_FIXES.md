# Navigation fixes — 2026-11-06

Two problems contributed to units becoming stuck. Units previously steered straight toward destinations without routing around solid geometry. Separately, Creator 2.4's Widget layout could move a map ancestor after Rigidbody initialization; the next physics synchronization then wrote the old world position back into the node's local coordinates. The installed-engine regression reproduces a **166.667-unit vertical shift**, matching the observed first-map terrain/collider drift.

`KinghtFallUIGame` now settles the map parent's Widget before instantiating map bodies. `KinghtFallGameCtrl` checks the map's world transform before each physics step. When an ancestor transform changes, it synchronizes body position/rotation and reapplies collider shapes after a scale change. Unchanged transforms do not overwrite normal body simulation; the listener is removed when the controller is destroyed.

The shared `KinghtFallNavigation` adapter and polygon-aware `NavigationGrid` serve all **10 enemy classes and 4 soldier classes** through their base movement paths, including combat pursuit and allied rallies. They use active, non-sensor physics geometry in one map coordinate system. Gate wall pieces referenced through `ndAniOther` are included even when they are sibling nodes outside the gate hierarchy. Units intentionally configured with physics disabled retain their existing ability to cross buildings.

Clearance comes from each unit's actual transformed physics collider, including offsets, plus a 2-unit margin, rounded upward to a multiple of 4. The 14 inspected unit prefabs have an approximately **15.297-unit body radius**, producing **20-unit navigation clearance** at their authored scale. Attack/search trigger circles are not mistaken for body size. Paths avoid corner cutting, smooth only along clear segments, and move gradually out of an initially overlapping collider; blocked goals resolve to an accessible boundary. Cached paths are invalidated after relevant geometry/target changes, pooling, revival, and new rallies.

When a pursuing enemy disengages, it now discards the combat path and rejoins the nearest visible forward route segment from its current position. This skips obsolete waypoints passed while chasing, rather than returning to the old route destination. The segment's endpoint and final objective still require normal obstacle-aware movement. A wall-blocked rejoin or a position before the next segment conservatively retains the existing waypoint. Both auxiliary enemy classes share this route helper without gaining hero-chasing behavior.

The upper-left Map02 gate also exposed a separate building-target problem. A side wall's node origin can be unreachable behind adjoining wall/cliff geometry even though its exterior can be attacked. Enemies now approach the same selected polygon used by combat range checks, with the normal planner providing body clearance. Exact authored fixtures reproduce the old no-path selection at three level-3 gate positions and four level-2 positions with neighboring buildings constructed. Every case now moves along clear segments into unchanged attack range and enters an attack through the normal update. This preserves target selection, attack range, gate colliders, and the requirement to attack a closed gate. The regression uses the installed Creator collision-intersection implementation when available.

A separate **live Cocos preview** verified the level-2 gate case with the built-structure fixture and an actual `ItemEnemy02`, using normal physics and `onUpdate`. From `(-275, 725)`, it approached the selected `cq3` gate wing and entered attack range at approximately `(-286.574, 739.351)` after 305 ms. It then entered attack state normally: gate HP fell from **700 to 688 at 1.5 s, 676 at 3.1 s, and 664 at 4.6 s**. The 60-sample trace is saved in `local/navigation-audit-20261106/stage2-live-gate-fix.json`. This verifies the reproduced stall in the running engine; the user's original live clump had already ended before capture and is not claimed as a directly recorded before/after comparison.

Verified checks:

- **702/702** spawn-to-route and route-edge checks passed across all four authored maps at radii 16, 20, and 30; no unreachable segments or blocked authored waypoints were found.
- **10 planner checks** passed, including concave geometry, negative coordinates, larger units, unreachable targets, overlap escape, and bounded search.
- **29 runtime checks** passed, covering transformed geometry, external gate walls, moving targets, pooled units, all enemy/soldier classes, the installed-engine Widget/physics regression, combat-to-route resumption across all eight pursuing enemy types, and the Map02 gate approach failures at levels 2 and 3.
- **7 HUD-indicator checks** passed. Moving Next Wave indicators avoid visible controls and each other while their arrows continue pointing toward their spawn locations.

Run the checks from the project root:

```powershell
node tools/navigation/navigation-grid.test.cjs
node tools/navigation/runtime.test.cjs
node tools/navigation/audit-authored-routes.cjs
node tools/localization/enemy-indicators.test.cjs
```

The authored-map audit writes its detailed results to `local/navigation-audit-20261106/authored-route-audit.json`. These checks establish route/adapter correctness for the covered geometry; they do not prove every crowded battle is deadlock-free. Extended live crowd play, larger crowds at narrow gates, map resizing on target devices, and mobile performance still need testing. The planner does not implement unit-to-unit crowd avoidance, and desktop test timings are not device-performance measurements.
