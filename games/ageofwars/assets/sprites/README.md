# Sprite-sheet mode (render-path B)
Blender-rendered side-view sprite sheets go here, one atlas + one manifest per class.
Files: <class>.png  (e.g. soldier.png)  and  manifest.json
See ../../dev/ASSET-SPEC-skeletal.md for clip names, anchor (feet-centered), skins per era.
The game auto-loads manifest.json on start; until it exists, the game uses the procedural rig (no change).
