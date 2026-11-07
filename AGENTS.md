# Agent instructions

## Use computer control only when necessary

- Use the computer-use skill only when absolutely necessary, after checking whether a suitable API, connector, or CLI can complete the task.
- As soon as the required UI result is achieved, immediately close or release the computer-use session before continuing other work. Do not leave computer control active for unrelated code edits, checks, or discussion.

## Keep MCP sessions silent

- Keep game audio muted whenever using MCP to launch, run, inspect, or test this project. This includes browser previews, hidden previews, and native simulator sessions.
- Apply mute **before** loading or starting the game so startup music and sound effects cannot play. For an Electron preview, call `webContents.setAudioMuted(true)` before `loadURL()`.
- Do not unmute audio or increase volume unless the user explicitly requests an audio test.
- Use game or application audio controls; do not change the user's Windows master volume or other applications' audio.
- If silent playback cannot be guaranteed, use another verification method until the preview or simulator can be muted.
- Close any temporary preview sessions you created when verification is finished.

## Preserve gameplay when building authoring tools

- Installing, opening, browsing, or previewing editor panels must not save game data, change player progress, or modify the active scene.
- Keep edits in drafts until the user explicitly saves them in a panel. A save with no changes must perform no writes.
- Preserve the existing data format, identifiers, unknown fields, and current gameplay behavior. Do not rebalance, normalize, or automatically repair legacy content while adding tools.
- Runtime support for previously scripted settings must retain the original behavior when no saved default or override exists.
- Attack timing defaults were explicitly approved from authored animation attack events on 2026-11-07. Saved `GameTools.timingDefaults` supplies each unit's default; `GameTools.timings` supplies custom values. Do not automatically reseed either table while opening panels. Gold is the editable gameplay timing; green is the fixed animation reference. Reset removes the custom value and returns to the saved default.
- Protect concurrent work with revision checks and backups. Do not revert unrelated changes to match a test baseline.

## Keep generated artifacts outside the project

- Store concept art, image-generation prompts and galleries, contact sheets, screenshots, recordings, temporary test exports, diagnostic reports/logs, one-off scripts, and backup snapshots outside this repository. Use `%USERPROFILE%\Documents\Codex Artifacts\HeroKingdomDefense\` with a dated task subfolder, or an operating-system temporary directory.
- Do not create these artifacts under `output/`, `local/`, `docs/`, package test folders, or `assets/`, and do not stage or commit them. Configure output paths before running tools; if a tool cannot redirect its disposable output, move that output outside the project when it finishes.
- Keep maintained automated tests, their required fixtures, production game assets, source/configuration files, and required Cocos-managed caches/state in their proper project locations. A file's name alone is not evidence that it is disposable.
- Before moving existing artifacts, check for active processes and references, preserve their contents in the external archive, and verify the resolved source/destination paths. Keep files required by an active editor/simulator session in place until that session ends, then archive its disposable output.
- Cleanup is local unless the user explicitly authorizes a repository cleanup commit and push. Do not rewrite Git history. Preserve unrelated work and record what was moved and where outside the repository.
