# Spore Alignment

An interactive Three.js anamorph for Codevember 2026, Day 26.

## Run locally

Run `python -m http.server 8080 --directory dist` from a source checkout and open http://localhost:8080/. In the GitHub Pages ZIP, the contents of `dist` are already inside `26/`. To preview that archive, extract it, run `python -m http.server 8080` from the parent of `26/`, and open http://localhost:8080/26/.

To publish on GitHub Pages, copy the archive's `26/` directory to the repository's Pages publishing root. All modules, fonts, and assets are bundled and use relative URLs.

## Explore

- Drag with a mouse or one finger to orbit. With the exhibit focused, use the arrow keys. Hold Shift for larger keyboard steps.
- Use **Reveal** to go to the aligned view. Use **Play** for a guided orbit, or take control to pause it.
- With reduced motion enabled, Reveal jumps to the target, spores stay still, and the guided orbit steps between views.
- A text alternative is available to screen readers and is displayed if WebGL 2 is unavailable.

The light fragments are irregular cells cut from a shared word mask. Each cell is placed at a different depth by extending the viewing rays from the reveal camera. The camera orbits the static fragments. Only some of the surrounding blue spores drift.
