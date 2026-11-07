# Backend audit — 2026-11-07

Complete: nine inspection/repair cycles were followed by an entire tenth inspection with no further actionable backend findings. The final source snapshot covers 210 runtime scripts and 299 project tool, test, configuration and data paths.

## Scope and method

The review covers the project's runtime JavaScript, gameplay and navigation, combat and pooling, progression and persistence, SDK/network adapters, resources and input ownership, and developer/editor backend tools. It includes active and legacy game modes. Serialized assets, imported identifiers, authored routes, configuration references, localization and artwork availability are checked by the automated audits.

Each inspection pass completes before its fixes begin. Later passes rotate reviewers and examine the new implementations together with their callers. File inventories record SHA-256 hashes and distinguish fresh source reads from reuse of earlier complete reads of byte-identical files. Structural parsing, configuration traversal and regression execution supplement source review; none is described as engine execution by itself. Generated engine/import caches and the external Creator SDK are dependencies, rather than project source to rewrite.

Visual styling, text placement, HUD layout and artwork changes are excluded from this audit's repairs. The commit also preserves work that was already present when this audit began, including earlier authorized fixes and authored character/item assets. It does not revert concurrent content to a test baseline. The approved saved attack timing defaults and custom overrides are retained.

## Backend changes

- Navigation uses bounded, fairly scheduled path searches and cached geometry. Friendly orders route through gates in either direction; enemy ground units remain excluded while the gate is intact. Orders survive natural barracks respawns, and allies acquire and retaliate against enemies along their routes. Two actual physics defects were repaired: opposing clearance escape could pin units, and interrupted gate upgrades could recreate disabled collision fixtures.
- Actor, projectile, HP-resource, animation and pooled-effect work is tied to the correct lifetime. Stale asynchronous completions cannot affect a reused actor. Healing effects return to the pool when their recipient dies. Boss transformation retains its authored movement hold.
- Concurrent cold prefab deliveries reuse the pool already created by the first callback. Ten simultaneous healing effects now allocate 12 nodes and destroy none, compared with 120 allocations and 99 destructions before the fix. All requested effects still receive distinct nodes. Intentional scene-template replacement and pool clearing retain their existing behavior.
- Projectiles detect a step that crosses completely through the existing impact circle. The reproduced tower arrow hits on tick 3 at 10 FPS instead of tick 26; its tick-14 result at 60 FPS is unchanged. Adjacent projectiles no longer lose an update when a preceding shot retires. Speeds, impact radius and authored attack markers are retained, and the isolated authoring simulation follows the repaired controller.
- Battle entry, purchases, rewards, claims and settlement use durable one-time records and recovery. A fresh battle's stamina debit, initial silver achievement and resumable checkpoint are committed together after map readiness. Resuming a checkpoint does not credit its initial silver again. Canceled building choices refund only their own reservation.
- Required perk/result decisions retain an actionable Retry path after failed loads. Optional pause cancellation releases its own pause. Old screen completions cannot cancel newer transitions; queued requests and input claims settle even across failure or listener exceptions.
- Cloud saves retain failed dirty data, scope acknowledgements to the current request and protect reset ordering. Storage, day rollover, segmented records, receipt validation and transaction rollback have failure-path regressions. No new remote backend or ad provider is invented.
- Native save failures do not publish rejected data to either the SDK's file dictionary or the local mirror. Both mini-app adapter simulations preserve a later independent 17-gold gain after a rejected 123-gold reward journal; a subsequent explicit claim yields 140 exactly once. Successful authoritative native writes remain successful if the optional mirror fails. Actual host bootstrap and device behavior remain unverified.
- Audio, resource requests, callbacks, event subscriptions and SDK/network operations have bounded work and explicit ownership. Missing appearance textures use shared retry timing rather than loading on every frame. Completed terminal mission reads no longer rewrite unchanged records.
- Editor tools preserve drafts, unknown data, identifiers, revision checks and backups. Stale save/import replies cannot regress a newer draft. Untouched Apply→Save preserves omitted defaults and performs no catalog write or backup. Artwork compilation validates snapshots and rolls back owned writes without overwriting concurrent edits. Tests remove only temporary projects created by their current process.
- No-op template/layout/import/save actions preserve an offered recovery draft. Unchanged CSV round trips retain omitted context and locale fields. Rejected artwork additions do not create optional sections. Layout search reads each binding table once, reducing 292,370 binding reads to 865 for the shipped catalog, with identical results; blank searches read neither table. The UTC date formatter uses a UTC year consistently at New Year.
- Equipment panels unsubscribe from pending item-catalog loads when destroyed, including the frame-end destruction window. Managed test previews record ownership before native setup, handle failed promise navigation, preserve reset generations and attempt cleanup of all owned windows despite an individual failure. These repairs were verified with inert windows; no managed desktop window was launched for this audit.

The [finding ledger](backend-findings.json) records individual reproductions and fixes. The [validation record](validation.json) contains exact test and game results, and the [source inventory](source-snapshot.json) records every reviewed path and its checksums.

| Final verification | Result |
|---|---|
| Node 24.20.0 with installed Creator integrations | 695/695 entries passed, zero skips; 6/6 check groups |
| Portable Node 22.23.4 with Creator unavailable | 665 passed, 24 explicit optional integration skips, zero failures; 6/6 groups |
| Python 3.12.10 bridge compatibility | 18/18 with websockets 12.0 and 18/18 with 17.4; no sockets launched |
| Authored route audit | 702/702 legs solved, 24 detours, zero projected goals |
| Final whole inspection | 509/509 source hashes matched, zero new actionable findings |
| Authored game asset preservation | 5,264/5,265 byte-identical to audit start; one concurrent hero-item catalog edit preserved |

Conditional engine test files can register a single skipped placeholder for several installed-engine cases, so the two Node entry totals differ. Legacy script entries also contain additional internal assertions. Configured invalid engine paths were separately verified to fail rather than skip. These counts are not added together as unique tests.

## Actual game verification

The automated live checks run the actual game and physics in a muted headless Edge session with isolated in-memory player storage. A read-only local proxy inserts all current runtime module bodies into existing Creator preview wrappers and uses the imported assets. This is a hybrid current-source preview, not a fresh exported build.

The gate tests completed 19 crossing cases with 30 or 60 allies, covering rally/follow in both directions and multiple gate levels. Six planned deaths in the rapid-upgrade case naturally respawned, inherited the order and crossed the gate. Wave 8/10 stress cases reached 60 allies plus 100 enemies, checked combat after respawn and intact-gate exclusion, and exercised a destroyed gate. Failed runs that exposed the two physics defects were retained before the successful reruns.

A separate congestion experiment preserved three low-motion rear enemies and removed nearby *other* enemies through normal fixture teardown. All three entered valid attack range within 385 ms and repeatedly entered normal Attack state over the next ten seconds. The original 30-pixel displacement criterion remained inconclusive because only 3–13 pixels were needed to reach attack range. This supports release from reproduced crowd contact, without asserting that every stationary actor is harmless or modifying production crowd collisions.

The wave observer was corrected to include pending prefab spawns. A four-second delayed-load control remained unfinished while pending loads existed; an authored wave 6 with 30 upgraded allies completed once, with 135 attack starts and zero detected movement stalls. Earlier live `waveFinished` flags from the old observer are not used as completion evidence. Their separately measured crossings, counts and combat observations remain recorded.

After the projectile/native-save repairs, the current-source run cleared all 17 authored wave-6 enemies once with 150 attack starts. Gate-3 rally and Follow checks settled all 30 and all 60 allies. Wave 8 at five times the authored count reached 160 actors, with 5,970 attack starts, six natural respawns inheriting orders and attacking en route, and no gate-exclusion violations among 83 ground enemies observed near an open intact gate. The respawn observer confirmed direct damage for the three melee units and projectile launches for the three archers; it did not attribute each later arrow's damage to its respawned shooter.

That heavy run recorded seven five-second low-motion episodes among five enemy generations. Every episode was followed without another rally, teleport or teardown until the same actor reached valid range, invoked its real attack and reduced target HP; none remained unresolved or retired from tracking. All resolved during crowd combat; the report does not label the heavy run zero-stall or infer their cause from the flag alone. A separate earlier 100-second sample tracked 22 episodes across 14 generations to actual damage. Its original predecessor's five actors were not individually recovered. A teardown-only error in that earlier sample's diagnostic wrapper was retained and fixed; the later current-source run had zero runtime and zero diagnostic errors.

The current-source pool instrumentation counted 41 cold callback deliveries: seven pool creations, 34 reuses and zero replacements. All 210 runtime source hashes matched that run. A later repair changed only the unused UTC formatter and the sparse-catalog authoring action. The final short smoke separately verified all 210 latest runtime modules, normal paid entry, first-open Pause, and an active Follow ring with 28.38px measured movement. Its 14-second wave8×2 sample peaked at 70 actors and had two low-motion flags; it was a source/capture smoke, not the full trajectory test. The larger 160-actor result above remains distinct. Final runs reported zero runtime/observer errors and zero external host requests. All owned temporary browsers and proxies closed successfully.

## Manual visual review

Open the [screenshot gallery](visual-review/index.html), [download the kit](visual-review-kit.zip), or read its [provenance notes](visual-review/README.md). Seven historical user screenshots and three latest exact canvas captures are labeled separately. Source-only visual observations are listed for manual review; they are not presented as current rendered reproductions. No screenshot has been retouched.

## Limits

A clean complete inspection means no further actionable backend defect was found in that pass. It is not proof that every possible bug has been eliminated. Silent harness tests do not certify audible native output, real host ads/payments/cloud services, every campaign wave or device-specific behavior. The release platform remains unspecified. Creator-independent CI explicitly skips optional engine integrations; an explicitly configured invalid engine path fails.

Remote service implementations and real host SDK initialization are not present in the audited project. Their adapters and failure behavior are covered here; this is not a production infrastructure scan or a certified mini-app release.

Crowd timings from instrumented headless rendering are diagnostic and do not establish device FPS. A fresh release export and sustained target-device testing remain necessary. No desktop control, computer-use skill, user save changes or unmuted game session was used for this audit. Temporary preview processes and proxies are closed after their checks.
