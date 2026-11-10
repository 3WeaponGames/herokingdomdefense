# Sound Editor

Open **Tools → Hero Kingdom Defense → Sound Editor** in Cocos Creator.
The dockable panel indexes all audio under `assets/`, including effects, music and unit voices.
Opening or selecting a clip starts no playback. Click its play button, double-click its row, or press Space to listen.

| Action | Shortcut |
| --- | --- |
| Play / Pause | Space |
| Previous sound | Shift+Q |
| Next sound | Shift+E |
| Cycle Once → Loop → Autoplay next | Shift+W |
| Toggle green dot | Shift+A |
| Toggle yellow dot | Shift+S |
| Toggle red dot | Shift+D |

Each shortcut has a matching labeled button. Shortcuts apply inside this panel and leave text fields and selectors alone.
Previous, Next and Autoplay follow the displayed filtered order. Autoplay stops at the last clip.
Closing the panel releases its audio; losing window focus pauses it.

Use category, source, type, biome, search and review filters together. Sorting by dot color switches to an ungrouped list so colors sort across categories.
Original sounds are identified by their unchanged audio bytes in the first project checkpoint; added or replaced clips are New.
The baseline in `original-audio.json` works without Git installed and continues to identify renamed original clips.

Review dots appear after clip names and in the checklist filters. A clip has one color; pressing its current color again clears it.
Marks remain drafts until **Save Checklist**. They are stored in `authoring/audio-review.json`, keyed by stable asset UUID when available.
Unchanged saves write nothing. Saves preserve unknown fields, check revisions, and use the shared transaction helper with external backups.
The panel changes no gameplay configuration, player progress, active scene, or game volume.

Run `node --test tools/testing/sound-editor.test.cjs` for catalog, checklist, keyboard, player and Creator extension checks.
`tools/audio/verify-editor.cjs` exercises the actual panel in a muted browser with an external fixture and screenshots.
Its browser dependencies and output directory can be supplied through `PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE` and `HKD_ARTIFACT_DIR`.
