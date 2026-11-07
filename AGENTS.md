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
