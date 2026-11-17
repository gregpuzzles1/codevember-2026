# Pendulum

A Three.js Newton's cradle for Codevember Day 18. Lift a ball, let go, and watch momentum travel down the line of chrome spheres. The cradle is visible from every angle, including straight above and straight below.

- **Drag a ball** to lift it (balls on the pull side lift with it); release to swing
- **Drag the background** to orbit in any direction, **scroll / pinch** to zoom, **right-drag** to pan
- **Launch** 1, 2 or 3 balls, change the ball count (3–9), slow time down, turn friction on, and cycle ball finishes
- **View** buttons fly the camera to front, side, back, top, bottom and 3/4 positions; **Auto-orbit** spins the camera
- **Keyboard:** `1` `2` `3` launch balls, `Space` pause, `F` `S` `B` `T` `U` `I` front/side/back/top/bottom/3-4 view, `O` auto-orbit, `M` sound

Each ball is a pendulum integrated at 480 Hz; equal-mass elastic collisions are resolved iteratively so impulses pass through a chain of touching balls the way they do on a real cradle. Friction is off by default, so the motion is perpetual.

Run a static server from the repository root or this folder:

```sh
python -m http.server 8765
```

Open `http://localhost:8765/18/` (or `http://localhost:8765` from this folder). An internet connection is required to load Three.js and the fonts.
