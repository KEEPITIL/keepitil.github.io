# AOW2 — playable 3D-styled vertical slice

A separate experimental sequel build for Age of Wars. It uses a custom perspective renderer and articulated procedural soldiers so it runs without external libraries.

## Included
- Orbit/zoom perspective battlefield
- Articulated role-based soldiers with era armor and weapons
- Defender, assault, ranged, and champion classes
- Form-up enemy phase, formations, marching, ranged projectiles, layered shield/armor/health
- Six visual eras, two forts, waves, economy, three stances, and 1×–3× speed
- Reference boards retained beside the build for production comparison

This is a playable vertical slice, not a finished conversion of every system and all 75 kingdoms from the 2D game. The PNG boards are design references; production 3D character meshes, UV textures, and authored animation clips will still be needed for a commercial-quality full sequel.

## Live testing build

The permanent browser build is published at:

https://keepitil.com/game/AOW2/

After changing AOW2, publish the current `index.html` to that same URL with:

```bash
./deploy-web.sh
```
