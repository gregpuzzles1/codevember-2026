# Kelp Courier

A small Three.js game for Codevember Day 17. Steer a courier fish through the gaps in a swaying kelp forest, collect pearls, and swim through the golden ring at each drop-off to deliver your parcel (and win back a life).

- **Mouse:** move up and down to swim
- **Touch:** drag anywhere
- **Keyboard:** `↑` `↓` or `W` `S`; `P` or `Esc` to pause; `M` to toggle music; `Space` / `Enter` to start

The game plays an original, lively orchestral-style soundtrack during each run. Use the music button or press `M` to mute or resume it.

Run a static server from this folder:

```sh
python -m http.server 8765
```

Open `http://localhost:8765`. An internet connection is required to load Three.js and the fonts.
