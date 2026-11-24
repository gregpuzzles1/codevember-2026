# First Peck

Codevember 2026, Day 24. Explore an American robin’s nest in spring and tap the cracked egg to watch it hatch.

## Run locally

From the folder containing `Codevember-2026`, run `python -m http.server 8000` and open http://localhost:8000/Codevember-2026/24/. Serve the page over HTTP so the browser can load its JavaScript modules.

## Publish on GitHub Pages

Copy the contents of this `24/` folder to `24/` at the root of your `codevember-2026` repository. Include the `assets/` and `vendor/` folders. The page works as a static site. It uses relative links and bundles its fonts and Three.js locally.

## Controls

- Tap or click the cracked egg, or activate **Hatch egg** with Enter or Space.
- Drag to orbit. The automatic orbit picks up from the new angle when you let go and motion is enabled. Pinch or scroll to zoom. The arrow keys orbit, and **+** and **−** zoom.
- **Reset view** restores the starting angle and zoom. The automatic orbit continues when motion is enabled. **Replay** restarts the hatch.
- **Pause motion** stops the camera’s automatic orbit and the ambient animation. While paused, a new hatch plays as a handful of still poses. A hatch already in progress resumes when motion is resumed.
- Browsers with reduced motion enabled start still and use the staged hatch. Browsers without WebGL 2 show a text description.

The scene geometry is built procedurally. Three.js and font licenses are included.
