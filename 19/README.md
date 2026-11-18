# Erosion

A Three.js canyon-carving toy for Codevember Day 19. Tap the clouds to make it rain, then timelapse decades, centuries and millennia as running water cuts gullies into a Colorado Plateau landscape. A drone orbits the scene, and you can look around in every direction.

- **Tap a cloud** to start or stop its rain; **drag a cloud** to paint rain across the land
- **Drag the sky** to orbit 360° and tilt up or down, **scroll / pinch** to zoom, **right-drag / two-finger drag** to pan. The drone resumes orbiting after a few idle seconds
- **Timelapse** runs from years to millennia; the counter and the stats show how much rock has been carved away and deposited
- **Erosion map** paints carved ground orange and deposited ground blue; **Hold: before** shows the landscape as it started
- **Sun** slider moves the light so canyon shadows sweep across the walls; **Rainfall** scales how hard it pours
- **Reset** restores the landscape, **New land** generates a different canyon
- **Keyboard:** `Space` pause, `1`–`5` timelapse speed, `O` orbit, `M` erosion map, `B` peek at the original, `C` add a cloud

## How it works

The terrain is a real 3D heightfield mesh (176×176 vertices, 136×136 on touch devices) lit with shadow mapping. Each step the simulation:

1. Drops rain wherever a cloud is raining and routes water downhill across the grid
2. Cuts channels using a stream-power law, once flow is strong enough to concentrate
3. Carries the sediment downstream and deposits it where the slope flattens
4. Slumps over-steep slopes into talus, so cliffs retreat when the rock under them is undercut

Rock layers (Kaibab, Coconino, Supai, Redwall and so on) set both erodibility and the steepest slope each layer can hold. Hard caprock forms cliffs and soft shale forms slopes. Each layer's colour comes from its height, so digging deeper exposes older strata. Outside the simulated tile, the same landscape function continues to the horizon.

Plants are instanced procedural meshes: Joshua trees, giant yucca and Utah yucca on the plateau and benches, desert willow along washes, and Gambel oak at higher elevations. They fall when the ground is washed or buried from under them, and new ones sprout as simulated years pass.

Years are stylised. One grid unit is roughly 150 m horizontally and 200 m vertically.

Run a static server from the repository root or this folder:

```sh
python -m http.server 8765
```

Open `http://localhost:8765/19/` (or `http://localhost:8765` from this folder). An internet connection is required to load Three.js and the fonts. Add `?lite` to force the lighter mobile quality settings.
