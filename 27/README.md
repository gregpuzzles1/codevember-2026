# Beneath the Prairie

Codevember 2026, Day 27 · burrow

Copy the `27` folder into the root of your Codevember site. The page uses relative paths and includes Three.js, fonts, and the baked 3D mesh.

To preview locally, open a terminal in the folder containing `27`, then run:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/27/ in a browser with WebGL 2 support.

The tour includes the latest reduced-motion controls. The camera holds its current view when you enable Reduce motion. Use Previous and Next to move between stops. Turn the setting off and select Resume tour to continue the animated route.

The baked mesh is ready to use. If you change the tunnel layout in `layout.json`, you can rebuild the mesh from inside `27` with `python3 tools/bake-burrow.py`. The optional baker uses NumPy, SciPy, and scikit-image.
