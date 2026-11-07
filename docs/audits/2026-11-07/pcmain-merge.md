# PCMain â†’ AcerMain merge verification â€” 2026-11-07

Integrated PCMain `c9f3d997da6c28498f6f42505ac0750a88f64d08` with AcerMain's audited checkpoint `020afc66ce58db8e7d3def6700677e95c2e000e0`. The merge base is `b2ea0e99717c5978c25cf9b7ee88acf6e35928a1`. This is a normal two-parent merge preserving the history from both branches.

## Resolution and preservation

The one text conflict was `KinghtFallDepthView.js`. The resolution retains PCMain's native JSB animated bounds, material-based silhouettes, shared per-actor GPU captures and cleanup, together with AcerMain's browser pose/vertex caching and reusable scratch storage. Native capture records keep a per-draw identity instead of retaining a whole browser frame cache. A combined regression covers two native occluders, successive frames and actor removal.

The automatically merged code was also reviewed against both parents. Durable map-ready battle admission, required-dialog retry/once-only reward handling and building cancellation/refunds coexist with PCMain's safe lobby teardown, modal-owned native texture-frame wrappers and authored badge sizing. All 8,890 catalog fields/atomic array values form the exact union: two AcerMain changes, 30 PCMain changes and zero overlapping changed fields. PCMain's prefab, font policy, shader and metadata are preserved. No new UI style changes or gameplay rebalancing were added while resolving the merge.

Only four of the 210 runtime modules differ from the audited checkpoint; the remaining 206 are identical after line-ending normalization. Approved timing defaults/overrides and unrelated authored gameplay configuration are unchanged. The previous [ten-pass audit](backend-audit.md) and its source snapshot remain a frozen pre-merge record, rather than a new audit of these integrated changes.

## Checks

| Verification | Result |
|---|---|
| Node 24.20.0, installed Creator integrations | 706/706 entries passed; zero skips; 6/6 groups |
| Node 22.23.4, Creator deliberately unavailable | 676 passed, 24 explicit optional integration skips, zero failures; 6/6 groups |
| Python 3.12.10 bridge | 18/18 with websockets 12.0 and 18/18 with 17.4 |
| Authored navigation | 702/702 legs; 24 detours; zero missing/projected goals |
| Serialized/source assets | 5,687 files, 210 scripts, 102 serialized assets; zero syntax/import/UUID/reference errors |
| Focused merge checks | 78 popup/admission/localization entries and 45 depth/render/control entries passed; included in broader validation rather than counted as unique additional tests |

The suites cover rally/follow, gate exclusion, bounded navigation scheduling, natural barracks revival and inherited orders, retaliation, persistence failures, rewards, resources, networking and editor data safety. Bridge tests use inert transports. Conditional engine placeholders explain the differing Node totals; script-file entries can include additional internal assertions.

Additional footer UI edits appeared locally while verification was running. They are preserved unstaged. The shared catalog was staged from its previously tested three-way merge without writing over the later working file. Full checks were repeated on an exact index export; all 210 preview module bodies also match the staged merge after line-ending normalization.

## Muted actual-game and GPU verification

The connected Creator 2.4.13 editor recognizes the new effect. Its fresh preview on port 7457 supplied the unmodified resource descriptor and the real imported `OcclusionSilhouette` asset. Current runtime bodies were inserted into existing preview wrappers with regenerated dependencies; all 210 source hashes matched. Storage was isolated in memory, audio was muted before navigation, and no desktop control was used.

An actual Sprite, MaterialVariant, Camera and RenderTexture produced the exact four expected framebuffer samples from transparent, half-alpha, red opaque and blue opaque texels. This verifies the shader's tint and alpha on WebGL 1. An initial far-camera arrangement produced transparent samples; the successful isolated probe used centered geometry, camera Z=1 and a normal draw pass. This does not prove native capture-camera placement or JSB rendering.

Normal paid battle entry retained its map-ready debit and six-silver checkpoint. The actual perk popup had three cards, and the building-choice popup retained both authored branch IDs and sliced badge backgrounds. Pause opened; the active Follow ring accompanied 33.71 pixels of measured hero movement. A 14.431-second wave-8Ã—2 sample peaked at 40 enemies and 30 allies, recorded 336 attack starts, zero low-motion flags, and zero enemy gate-exclusion violations. There were zero JavaScript/observer errors and zero external requests.

These were bounded activity samples. The four-second Follow segment recorded 3/30 crossings and zero settled units before cutoff. Of six planned deaths, one unit had naturally revived and inherited its order by cutoff; no post-respawn/en-route attack was observed in that short interval. Full all-unit settling, all-six respawn completion, complete wave clearing and sustained FPS are not claimed by this smoke. The broader automated order/respawn tests passed separately.

All three owned test browsers exited successfully and their local proxies closed. Earlier attempts against stale port 7456 are retained privately as diagnostic controls; they are not the final unmodified-manifest shader evidence. The user's editor and preview servers were left running.

Actual native JSB GPU capture, target-device drivers/orientation, a fresh native release export, audible output and real platform SDKs remain release checks. See [exact verification data](pcmain-merge-verification.json) for source hashes, samples, counters and qualifications.
