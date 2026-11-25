# Native Release preview

Build and run a normal Start preview with a Windows x86 Release simulator. Build outputs and preview sessions stay outside the project. Scenes, normal player progress and the installed SDK remain unchanged. The build process does not install software or change global settings.

Prerequisites: Windows, Node 22+, the original Cocos Creator 2.4.13 SDK, Visual Studio 2022 Desktop C++ tools with the x64-hosted x86 compiler, and a Windows 10 SDK with x86 libraries. `vswhere` discovers Visual Studio unless `--vs-root` is supplied. Missing tools produce a clear error; this script does not install them.

From the project root:

```powershell
node tools/native/build-native-preview.cjs --sdk-root 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/cocos2d-x' --output-root "$env:USERPROFILE/Documents/Codex Artifacts/HeroKingdomDefense/native-preview-stock"
```

Use a fresh output directory each time. Optional arguments: `--project-root`, `--vs-root`, `--windows-sdk-root`, and `--windows-sdk-version`. An explicit SDK root supports a separately unpacked toolchain without changing Program Files, the registry, or the user's environment. If this tool is outside `tools/native`, pass `--project-root <your project folder>` explicitly.

The tool checks the three original SDK project hashes and a deterministic digest of all 3,909 implementation/header files, rejects modified/unsupported SDKs, refuses output inside the project, tool directory or installed SDK, and preserves previous/partial builds. It copies the SDK, verifies the copy, then edits only copied project metadata by default. Installed implementations must remain pristine throughout the build. Copied implementations must match stock bytes or the exact optional patch set described below. The SDK must remain stable during copying/building.

The three project transformations reproduce the validated Release/O2/MD/fp:precise/C++14 configuration, unique object paths, matching static/Release ABI, missing compatibility includes, and removed SDK build events. Compiler concurrency is capped at six workers. No fast-math, simulation-clock, source-art, worker-threshold, swap-interval, or diagnostic-profiler changes are included.

The stock build uses Cocos's original matrix workers. All build variants use the same presentation behavior and timer pacing.

For native Spine lifetime validation, add the value-free `--spine-inline-color-cleanup` flag and use a separate fresh output directory. This opt-in applies an exact, hash-guarded 11-file patch only to the external SDK copy. It retires the seven inline Color handles owned by Skeleton, Slot, SlotData, RegionAttachment and MeshAttachment when those owners are destroyed. Generic Color/base destructors, renderer loops, simulation timing and the installed SDK remain unchanged. Omit the flag for a stock engine build.

All 11 original and resulting source hashes are checked in memory before any feature source is written. Exact originals are retained under `source-patch-backups/spine-inline-color-cleanup/`; `spine-inline-color-cleanup-diff.json` records the literal before/after replacements. Preparation and build manifests record the feature, source hashes, diff hash and separate original/copied implementation digests. Every other copied implementation must remain stock. Modified input SDKs and already-patched inputs are refused.

This option is a native lifetime correction candidate, not an FPS optimization. A successful source transform or tooling test does not establish native correctness or performance. Compiler validation, controlled native lifetime/reuse tests, the gameplay suite and matched frame measurements are required before using its executable as a deployed preview. The builder never launches it or selects it as the default engine.

### Optional native unit health bounds

Add `--unit-region-bounds` when building a separate Windows x86 Release preview with the verified Creator 2.4.13 SDK. This enables native Spine bounds helpers for health bars and occlusion matching. The health-bar helper reads live region geometry and can explicitly include weighted meshes for the stock hero mount. Other rigs with visible meshes and unsupported geometry use the JavaScript path. Occlusion matching also uses the JavaScript path for rigs with authored aperture lights. Use the stock build for custom JavaScript overrides of Spine attachment and slot behavior.

The builder patches one binding file in the external SDK copy. It keeps the original file under `source-patch-backups/unit-region-bounds/` and writes `unit-region-bounds-diff.json` for review. The build manifest records the opt-in and the diff hash. You can combine this flag with `--spine-inline-color-cleanup`. The installed SDK requires no changes.

### Optional manual camera matrix optimization

Add `--manual-camera-matrices` for a Windows x86 Release preview that uses the main thread for manual-camera matrix updates and skips clean local matrix slots in groups of four. Manual cameras draw into textures for effects such as unit occlusion. The main camera uses the original matrix dispatch. The optimization is most useful when a frame contains many manual captures.

The builder checks the original and patched `RenderFlow.cpp` hashes and applies the patch to the external SDK copy. The build manifest records the feature and the hash of `manual-camera-matrices-diff.json`. This option can be combined with the other Release build flags above.

### Optional foreground stencil reuse

Add `--foreground-stencil-reuse` for a Windows x86 Release preview that reuses an identical scenery stencil within the current camera view. The renderer uses spare stencil bits for eligible foreground masks and keeps the original paint order. Masks that need the stock path are drawn normally. This option can be combined with `--unit-region-bounds` and `--manual-camera-matrices`.

The builder verifies the engine sources before patching the external copy. The manifest records the feature and the hash of `foreground-stencil-reuse-diff.json`.

### Optional capture renderer inventory

Add `--capture-renderer-inventory` to build a separate Windows x86 Release preview that exposes initialized realtime Spine renderers to the game's native capture setup. The registry follows renderer initialization and destruction, including rigs temporarily removed from the middleware schedule. Each new battle or scene checks the inventory against the original renderer list and order before using it. Stock builds and unsupported capture paths use the scene walk. This option targets the game's stock Spine adapter and component queries.

The builder verifies and patches two files in its external SDK copy. It keeps originals under `source-patch-backups/capture-renderer-inventory/` and records the feature and the hash of `capture-renderer-inventory-diff.json`. The flag can be combined with `--unit-region-bounds`. In that case the binding backup for the inventory is the exact region-bounds output, and the region-bounds backup holds the stock source.

This build also lets the battle renderer reuse individual unit render targets after a switch away from the actor atlas. The native binding resets color and stencil on the exact target before the original capture. The battle keeps up to 96 idle targets within an estimated 8 MiB and releases them as actors and scenes retire. Unsupported targets use the original allocation path.

### Optional NVIDIA graphics preference

Add `--prefer-nvidia` and use a fresh build output directory to request high-performance NVIDIA graphics for the Windows x86 Release simulator on Optimus systems. The NVIDIA driver reads the `NvOptimusEnablement` export at startup. The active adapter still depends on the machine and its graphics policy. [NVIDIA Optimus rendering policies](https://developer.download.nvidia.com/devzone/devcenter/gamegraphics/files/OptimusRenderingPolicies.pdf)

The build tool adds the export to `main.cpp` in its external SDK copy and verifies the executable contains the exported DWORD with value 1. The build manifest records the source diff and executable hashes, with the export receipt under `runtime.nvidiaOptimusPreference`. Select that build's manifest when launching the preview. The option can be combined with the other Release build flags.

### Launch a Release preview

Keep Creator open on this project and let it finish compiling/importing. The launcher consumes Creator's existing native-preview files; it does not generate them. Its checks require the generated `simulator/win32/main.js`, `preview-scene.json` for the normal Start scene, and current `temp/quick-scripts/dst` source maps. Refresh those files through Creator's native preview when needed, then close the stock simulator before launching:

```powershell
node tools/native/launch-optimized-preview.cjs --creator-project-root . --creator-sdk-root 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/cocos2d-x' --release-manifest "$env:USERPROFILE/Documents/Codex Artifacts/HeroKingdomDefense/native-preview-stock/build-manifest.json" --output-root "$env:USERPROFILE/Documents/Codex Artifacts/HeroKingdomDefense/native-preview-sessions"
```

Add `--prepare-only` to validate and snapshot the current project without launching. The launcher checks the Release manifest and runtime hashes, then verifies Creator's compiled source maps against current game scripts. Stale scripts, a different project or scene, missing assets, or changed inputs cause a clear refusal; refresh the native preview in Creator and retry. It does not replace stale compiled modules with raw source.

Add `--grouped-mask-queue` to enable grouped mask preparation in a Release preview session. The launcher applies the patch to the isolated copy of a supported Creator 2.4.13 adapter and points the copied Start entry at that file. The session's `preview-proof.json` records the source adapter, deployed adapter, and Start entry hashes under `patches.groupedMaskQueue`. Combine the option with `--prepare-only` to inspect the prepared session.

The preview starts at the normal Start screen with audio muted before loading. It does not navigate menus, seed battles, grant progress, or change pause behavior. A persistent, separate preview save is used under the chosen output root; normal project progress is never copied. Imported assets, compiled scripts and runtime resources are snapshotted into each external session so subsequent editor imports cannot silently change a running preview. Allow space for those snapshots and the SDK build. Close the preview window when finished. Session proof, snapshots and logs remain outside the project for review.

Output stays outside the repository: SDK clone, object/libs, build logs, source/toolchain/patch manifests, and a local Release DLL deployment. The tool audits all 346 compile commands, checks x86 architecture and Release CRTs, and resolves the executable's transitive local DLL imports. `build-manifest.json` is emitted only after success, with executable/runtime/source/toolchain hashes. It contains absolute paths for a separate normal-preview launcher; no game entry or compiled game assets are generated by this build tool. The original installed SDK and all pre-existing executable deployments remain untouched.

No SDK copy, executable, DLL, generated entry, benchmark fixture, screenshot, log, or machine-specific manifest belongs in Git. Maintained delivery consists only of parameterized tooling, the PE inspection helper, focused regression tests, and documentation.

## Android release size

Creator packages the contents of `resources` and custom asset bundles. The Android staging tool copies the project to a fresh external directory and follows the paths and UUIDs used by the shipped scenes, prefabs, and configuration. It skips unreferenced files in the imported unit library, baked equipment, character editor thumbnails, generated map artwork, and two icon libraries. Add new dynamically constructed paths in those folders to the staging roots when introducing a runtime loader.

Use Node 22+, `cwebp` from [libwebp](https://developers.google.com/speed/webp/download), and FFmpeg with the `libvorbis` encoder. With both programs on `PATH`, run this from the project root. Use a Git working tree or a UTF-8-aware extractor for a frozen source snapshot. The stage loader uses exact resource paths, so staging checks that projectile trail paths still match their texture IDs.

```powershell
$release = Join-Path $env:TEMP ("hkd-android-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node tools/native/prepare-android-release.cjs --out $release --cwebp cwebp --ffmpeg ffmpeg
```

The build copy uses WebP for selected large artwork at its original dimensions with lossless alpha. Other eligible textures use lossless WebP when it saves space. The music pass uses a lower Vorbis bitrate with the original sample rate and channels. The `android-asset-report.json` file in the copy lists the exact omissions and conversions. Authoring uses the source project, which retains every asset and its original encoding.

Open the generated directory in Creator **2.4.13**. Build Android in **Release** mode from this copy with a clean output directory. The project selects **Portrait**. For an APK for modern ARM devices, select **arm64-v8a**. Use the existing package name and signing key for an update. If you need 32-bit support, measure a separate **armeabi-v7a** APK or let Google Play deliver the device-specific APK from an App Bundle. [Cocos Android build options](https://docs.cocos.com/creator/2.4/manual/en/publish/publish-native.html)

Measure the signed APK against the 200 MB budget on the build PC.

```powershell
$size = (Get-Item -LiteralPath $apk).Length
"{0:N1} MB" -f ($size / 1000000)
if ($size -gt 200000000) { throw 'APK exceeds the 200 MB budget' }
```
