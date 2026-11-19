# A Little Light Within

*A tiny world inside a cocoon.* An interactive nighttime garden for **Codevember 2026, Day 20**.

## Run locally

In the folder containing `index.html`, start a static server:

```sh
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000` if `python3` is unavailable. Open [localhost:8000](http://localhost:8000/) in a browser with WebGL 2 support. Three.js and OrbitControls are bundled at version **0.179.1**, so the project has no install, build, or runtime CDN requirements.

## Publish under Codevember

1. If you downloaded the ZIP, extract it. Copy the complete `20` folder into the part of your `codevember-2026` repository published by GitHub Pages. If you have a source checkout with a `dist` directory instead, copy the **contents** of `dist` into `20`.
2. Commit and push the folder to the branch your Pages workflow builds. Keep the existing workflow. If its staging step lists days explicitly, add `20` to that list.
3. After the workflow finishes, visit `https://YOUR-USERNAME.github.io/codevember-2026/20/`. The import map and all asset URLs are relative to this folder.

## Explore

Click or tap the cocoon to enter. In **Explore**, drag to orbit, right-drag to pan, and scroll to zoom. On a touchscreen, drag with one finger to orbit, move two fingers together to pan, and pinch to zoom. Tap empty garden space to send a spark. Tap a flower, mushroom, or the pool to interact with it.

Open **Controls** to switch views, choose **Attract fireflies**, or adjust the camera. In Attract mode, hold on the garden to gather nearby fireflies. The on-screen **Gather fireflies** toggle also works with the keyboard.

| Key | Action |
| --- | --- |
| Arrow keys | Pan |
| `+` / `-` | Zoom in or out |
| `R` | Reset the current view |
| `F` | Gather or release fireflies |
| `W` | Wake the next closed flower |
| Escape | Close the controls and restore focus |

Sound starts off. The project follows the operating system’s reduced-motion preference.

## Project files

- `index.html` and `style.css` contain the interface.
- `js/main.js` handles the scene, camera, picking, and controls.
- `js/art.js` builds the forest, branch, and silk.
- `js/garden.js` builds the plants, stones, terrain, and water.
- `js/fireflies.js` handles insects, glowing spores, and local light.
- `js/sound.js` synthesizes the ambience and chimes.
- `vendor/` contains the pinned Three.js modules and their MIT license.

The geometry, materials, textures, and sounds are generated from code.
