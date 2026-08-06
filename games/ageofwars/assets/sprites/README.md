# Sprite sheets (render-path B — Blender side-view renders)

Canonical layout (matches the skeletal adapter + assets/skeletal/manifest.json):
  assets/sprites/<class>.png    one atlas per class (e.g. sword.png)
  assets/sprites/<class>.json   that class's meta: frame size, anchor, clips

Then register the class in assets/skeletal/manifest.json:
  { "classes": { "sword": { "mode":"sheet", "sheet":"../sprites/sword.png", "meta":"../sprites/sword.json" } } }

Anchor = feet, centered. Rig faces RIGHT (+x); the game mirrors for the left team.
Clip names + skins per ../../dev/ASSET-SPEC-skeletal.md.
Until manifest.json exists the adapter stays dormant and the procedural rig draws (no change).
See sword.example.json for the per-class meta shape.
