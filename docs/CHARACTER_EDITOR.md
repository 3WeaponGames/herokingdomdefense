# Character editor

Open **Tools → Hero Kingdom Defense → Characters** in Cocos Creator 2.4.13. If the new menu has not appeared, reload the project's packages or restart Creator. A matching local review window is available with `node tools/characters/serve-editor.cjs` at `http://127.0.0.1:8790/`.

The project includes all 678 part images and 635 thumbnails from Layer Lab's **2D Minimal — Character Parts Pack Vol1 Expansion**. Unity metadata was replaced by Cocos metadata. The import catalog records the source package hash and each part's original PNG hash. The original package is not needed on another PC after pulling these assets.

**Royal Guard · parts demo** fits a helmet and sword to the existing allied foot soldier (90001), retaining its original animations and combat settings. It is assigned as that ally's appearance. Other characters keep their existing appearance until a look is explicitly assigned and saved.

1. Select any of the 17 existing characters in the left list, then **Edit this character** to start a draft. **Saved looks**, **New character**, and **Duplicate** also let you create or reuse looks.
2. Choose any existing hero, ally, enemy, or boss form as its base. Changing the base starts a new fitting with that base's original pieces.
3. Select an image in the searchable character-part library, then **Add selected part**. Use **Use library selection** to swap the image on an already fitted part. Monster Pack categories are excluded from this library and from new base-model choices; previously saved monster appearances are preserved.
4. Pick the model layer, slot to replace, and anchor bone. Use a currently empty slot to add a piece over the original artwork. **Show anchor bones** helps find the anchor in the preview.
5. Adjust offsets, scales, rotation, opacity and draw order. Drag the selected part in the preview to change its offset. **Hide original pieces** removes overlapping original pieces without editing the skeleton asset. **Adjust original model** changes an existing layer's position, size, rotation, opacity or skin even without importing a part. Reset removes that layer's overrides.
6. Check idle, movement and attack in both directions. Pause, scrub or step by a frame. The comparison shows the original beside the current look.
7. Check **Use this look for this unit**, then **Save characters**. A fresh/reloaded game session uses the saved assignment. The Units tool remains responsible for combat statistics and attack timings.

Character Maker's base head and body artwork is neutral white, with one imported base skin. **Skin tone** offers Light, Warm, Tan, Brown, Deep and Original white presets; **Skin tint** allows a custom color with a live preview. Maker characters use Warm by default. These controls color only exposed head/body slots, preserving armor, weapons, hair and beard colors. Custom choices remain drafts until Save.

**Faceless (hide eyes)** removes only normal and animated eye slots. Beards, hair, eyebrows, mouths and noses remain available. The same rule and skin colors are baked into saved native/Simulation Mode appearances.

Browsing and previewing do not write files, change the active scene, launch gameplay or play audio. Edits are drafts; Save is explicit. Saving an unchanged draft performs no writes. A save checks revisions, preserves unknown JSON fields and creates a backup under `%USERPROFILE%/Documents/Codex Artifacts/HeroKingdomDefense/character-saves/`. If another window or PC changes the file first, saving refuses to overwrite it and keeps the draft open.

The editor creates character *looks* on existing rigs. This expansion supplies equipment art, not new skeletons or animation sets. Additional gameplay unit types still need definitions in the Units tool. Appearance overrides are per instance and use the existing animation bones; shared Spine assets, player progression, colliders and authored attack timings are preserved.

Saved Character Maker and monster appearances are compiled to normal Spine assets, including equipped parts, original-model transforms, tints and skin colors. These assets work in both the browser and native Simulator. The legacy attachment-hook path is still limited on native JSB for models without an imported base source.

Saved units also retain a nonlooping `hit` reaction. Monsters use their authored recoil and white Hit artwork; assembled allies use the Maker reaction with a brief white flash over their equipped pieces. Reactions play on a separate track, leaving approved attack events and movement orders intact, and clear on completion, death or pooling. The original hero is unchanged.
