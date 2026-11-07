# Stage stars

The lobby keeps **Best: Wave** for an incomplete stage. Completed stages show a
three-star rating above the stage art. Completed objectives light gold stars;
the remaining stars use the same full-resolution silhouette rendered in gray.
The rating reads `stageInfo` and `maxStage`. Claiming a chest never changes it.

Victory uses the frozen settlement's objective bitmask. Clearing a stage earns
at least one star; surviving with the hero and preventing castle damage earn the
other two according to that stage's `Challenge` list. Replay ratings reflect
that run; the lobby retains the existing accumulated objective achievements.
This presentation adds no currencies or progression fields.

`assets/resources/ui/stage-stars/StageStars.prefab` exposes side/center sizes,
spacing, center lift and award interval. Earned stars pop in sequentially with a
short glow and ten sparkle particles. Every effect is cancelled on close and
destroyed after its burst. It uses Cocos sprites, Graphics and tweens on native
and web; Canvas has a crisp vector fallback for unearned stars.

Artwork comes from the licensed local **GUI PRO Kit - Casual Game**:

- `ResourcesData/Sprite/Demo/Demo_Icon/Icon_ImageIcon_Star01_l.png` (323 × 325)
- `ResourcesData/Particle/Texture/fx_star_white.png`
- `ResourcesData/Particle/Texture/fx_star_light.png`

Unity's `Play_Result.prefab` contains looping particle systems, and
`Star_Rank_Large.prefab` is a static rating widget. Neither supplies a sequential
receiving-star Animator clip. The Cocos award sequence recreates that behavior;
Unity's particle components and materials are not directly imported.
