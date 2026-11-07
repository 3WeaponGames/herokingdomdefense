Eight biomes / five concepts each

Open index.html to browse all forty concepts, filter by biome, and compare
variants at full size. Overview and per-biome contact sheets are also included.

Biomes: Forest, Deep Forest, Autumn, Desert, Snow, Ice, Fire and Lava.

The concepts were generated with OpenAI's built-in image_gen tool. Each prompt
uses the extracted assets referenced by that biome's original Unity demo scene,
plus a read-only render of this project's four original maps. Terrain additions
allowed in each prompt are listed in concept-jobs.json. Concept art follows the
source asset families, but final production maps must use the actual extracted
sprites for exact pixel and asset fidelity.

Source packages:
2D Minimal - Environment 1 1.0.1.unitypackage
2D Minimal - Environment 2 1.0.unitypackage

Extracted files, with original filenames and per-asset Unity metadata:
C:\Users\danny\Documents\projects\Hero Line Wars\Unity-Assets\Maps\Extracted\2D-Minimal-Environments-2026-11-07

source-manifest.json records package hashes, asset GUIDs, original Unity paths,
extracted file locations and SHA-256 hashes. All original PNG data was copied
without repainting, conversion or resampling. The reference boards contain
resized previews only; use the extracted originals when assembling maps.

concept-jobs.json records each image's prompt, reference inputs, generation
source, final path, dimensions and hash. prompts.txt is the readable initial
prompt set; any correction prompt is recorded on the corresponding job.
Earlier reviewed versions are retained under references/drafts; the gallery
shows only the forty selected concepts, five per biome.

Read PRODUCTION-PLAN.txt for the proposed authoring/export workflow and the
tradeoffs between full-map baking, individual sprites and a hybrid approach.

No runtime map prefab, game configuration, active Cocos scene or player save
was modified by this work.
