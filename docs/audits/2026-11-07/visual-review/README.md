# Visual review kit

Open [index.html](index.html) to compare the seven original screenshots supplied in this chat. These are historical reports, not fresh captures or proof that the current game still has each issue. No additional visual styling fixes are part of this backend audit.

Source-only visual observations awaiting manual review:

- `UITips.refreshUI` computes a translation but assigns the raw argument to the label.
- `UIGuide` treats direction zero as absent, so a previous pointer orientation may persist.
- A transient display-font load failure is cached as a fallback for the session.
- A recycled `ItemGood` row can receive an earlier icon callback after a different item has replaced it. The observed symptom is an old icon; the review found no reward mutation.
- `UtilLayout` can leave old child nodes visible when its requested row count shrinks.
- The home character panel's next-level label calculation may display the wrong threshold between multiples of five.

These additional observations come from source review and controlled component probes. They are not presented as new screenshots or confirmed defects in the current rendered game. No styling or layout repair has been applied for them. Resource ownership, retry, input and combat lifecycle repairs are covered by the backend tests separately.

The audit report records any fresh, silent automated captures separately. Original filenames and provenance are in [sources.json](sources.json).

Latest exact captures on 2026-11-07:

- `08-current-pause.png`: first-open Pause backgrounds/buttons present. Empty perks are expected in the fixture.
- `09-current-crowded-gate.png`: short wave 8×2 crowd stress, with a scenario peak of 40 enemies and 30 allies. The screenshot was taken after six planned ally deaths. The distinct 160-actor acceptance sample is in the backend report.
- `10-current-follow.png`: active Follow ring with 28.38px measured hero movement before capture. A single frame is not continuous-tracking approval.

All three are unchanged 375×667 canvas PNGs from the final current-source smoke; source hashes matched 210/210. No game UI source, screenshot pixels or styles were edited. The private-save tutorial overlay was hidden to expose the inspected UI, and enemy health/population were stress fixtures. The muted browser and proxy were closed. Controls and layout are retained exactly as observed for your review.

Additional source-only manual observation: the Equipment authoring preview does not consume the caller-selected `heroLevels` when initializing its model; its displayed tier may remain the default until its internal preview selectors are changed. No gameplay balance or progression mutation was found.
