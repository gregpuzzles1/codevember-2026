# Magma Pulse

Codevember Day 23 · **magma**

Tap the glowing chamber and follow the pulse through the mountain. Activate all three chambers to light the underground network.

## Run locally

Extract the ZIP and open a terminal in the folder containing this README and the `23/` folder.

```sh
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000`. Open [http://localhost:8000/23/](http://localhost:8000/23/) in a browser with WebGL 2. The project includes Three.js r180 and its MIT license. No npm install or build step is needed.

## Play

- Tap or click the outlined chamber. With a chamber focused, press Enter or Space.
- Drag the scene to orbit horizontally or tilt vertically. Use the arrow keys when the scene has keyboard focus.
- Use **Find the glow** when the next chamber is out of sight. It returns the camera to a clear view and preserves your progress.
- After the finale, keep orbiting to explore or choose **Replay** to start the sequence again from your current view.
- Sound is off by default. The experience follows your system’s reduced-motion preference.

## Deploy at `/23/` on GitHub Pages

1. Copy the entire `23/` folder into your Pages publishing root. If the publishing source is `/docs`, place it at `docs/23/`.
2. If you publish through GitHub Actions, include the complete `23/` folder in the artifact your existing Pages workflow deploys. Keep the folder structure intact.
3. Commit and push. For the `codevember-2026` project site, open `https://<username>.github.io/codevember-2026/23/` after the Pages deployment succeeds.

[GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
