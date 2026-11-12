# Combat power

Hero and unit scores share `assets/_script/CombatPower.js`:

`CP = sqrt(HP * (direct DPS + healing HPS + buff DPS + splash DPS + reflection DPS + prevented DPS))`

This is a comparison under the selected encounter assumptions. It does not simulate a battle, target travel, range, or wasted attacks. Display rounding is separate from the full-precision calculation.

## Attack timing

`CombatCadence.js` resolves saved gameplay hit timings and playback precedence. `AttackCadence.js` measures the controller's cooldown policy:

- Hero and support casts: cycle = hit delay / playback + cooldown.
- Melee units: cycle = max(animation duration / playback, hit delay / playback + cooldown).
- Ranged units: cycle = max(animation duration / playback, hit delay / playback, cooldown).

Cooldown is `1 / configured attack rate`. Effective attacks per second are `1 / cycle`; paused attacks have a zero release rate. Custom timings override saved defaults. An absent or invalid gameplay hit marker retains the runtime's immediate-release behavior; a reference animation event never creates a saved delay.

An explicit character animation speed overrides the older attack-only speed setting. Otherwise the existing fallback remains intact. Fantasy package defaults and ally level overrides use the same source metadata as the unit editor.

`HeroLoadout.calculate(config, user, assumptions, timingContext)` returns the account-wide CP benchmark, keeps `attackRate` as the credited cooldown stat, and exposes `effectiveAttackRate` and `attackTiming`. Gear supplies the loaded character speed through `timingContext.unitAnimationSpeed` without changing saved data. `HeroLoadout.snapshot` and `applyStyle` continue to return the actual equipped hero's stats for gameplay.

`unit-combat-power.cjs` accepts timing as its third argument, `{ settings, descriptor }`. Callers without timing metadata retain their nominal calculation. The roster exporter always supplies the resolved timing. Buffs, healing casts, and splash use the effective release rate. Separately timed boss debuffs retain their spell interval.

Wave-end hero healing adds no CP while ordinary wave transitions already restore the hero to full HP. Other healing and conditional effects follow the configured benchmark assumptions.

## Account upgrade credit

Gear displays an account-wide score. A supported type-restricted stat bonus contributes 20% of its raw amount regardless of the equipped type; an unrestricted supported bonus contributes 100%. Apply the weight once, before calculating credited HP, damage, attack speed, and prevention. Matching the currently equipped type does not increase a restricted bonus to full credit. For example, a restricted 30% damage bonus contributes a 6% damage bonus to account CP.

This includes all owned hero-style stat talents and supported soldier stat upgrades. Economy, building effects, run-perk unlocks, and unsupported utility are not assigned invented combat values. Range remains visible as utility and does not independently add CP. The score uses the equipped weapon's upgrade track and the common timing formula; it is not a sum of every weapon's equipment levels.

Account credit is a scoring proxy. It must not alter gameplay eligibility, damage, health, attack speed, or saved progression: the actual matching type still receives its full authored bonus in combat.

## Google Sheet source snapshot

The existing Google Sheet has live formulas for editable stats, equipment, ownership, assumptions, and timing. Its game configuration and animation metadata are a source snapshot, not a live connection to project files. Updating authored data requires refreshing that snapshot and checking formula parity.

Export current unit timing and CP data without launching gameplay or saving editor data:

```powershell
node tools/balance/unit-combat-power-roster.cjs --ally-levels --output "$env:USERPROFILE/Documents/Codex Artifacts/HeroKingdomDefense/unit-cp-roster.json"
```

Keep generated exports outside the repository. Preserve manual sheet inputs, source row identifiers, and floating unit icons when refreshing the snapshot. Only the equipped weapon profile contributes to hero CP; invalid inactive profiles do not block a valid active loadout. Invalid required equipment, timing, assumptions, or output components must show an unavailable score rather than a partial number.
