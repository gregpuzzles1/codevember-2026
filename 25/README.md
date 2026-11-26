# The Three Gossips

Codevember 2026, Day 25 · Veil

The interactive scene uses Three.js and WebGL 2. The sandstone is built from
hand-shaped 3D profiles and procedural surface detail. The veil is ray-marched
in world space and composited against scene depth. The supplied photograph is
the visual reference and the fallback when WebGL is unavailable.

To run the project locally, serve the static files over HTTP:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. To host the experience under a subdirectory, copy
the contents of `dist/` there. All runtime assets are included.

Click or tap the veil, or use its on-screen button. Drag or swipe to orbit,
and use the wheel or pinch to zoom. With the scene focused, the arrow keys orbit
and plus and minus zoom. Restore veil to replay the reveal. Your system's
reduced-motion preference turns off drift and makes the reveal immediate.

Three.js and OrbitControls are included under the MIT license in `dist/vendor/`.
