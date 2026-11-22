# Canyon Chimes

*Touch the stone. Hear the canyon answer.*

A Codevember project for the theme **Echo**. Explore a procedural sandstone canyon and play the walls like an instrument. Each strike chooses a pentatonic note and sends quieter reflections across the canyon. Sound starts with a wall strike, a sample chime, or the Sound button.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To build and preview the static site:

```sh
npm run build
npm run preview
```

The output is in `dist/`. Serve that directory over HTTP. The build uses relative asset paths, so its contents can also go in a GitHub Pages subfolder such as `21/`. The ZIP includes the production build. From the extracted project, you can serve that build with Python 3 using `python3 -m http.server 8000 --directory dist` and open `http://localhost:8000`.

## Controls

| Action | Desktop and keyboard | Touch |
| --- | --- | --- |
| Look around | Drag, I/J/K/L, or Shift + arrow keys | Drag the canyon |
| Move along the floor | WASD or arrow keys | Tap or hold the directional pad |
| Change height | Q down, E up | Use the stacked height buttons |
| Play a chime | Click a wall, or focus the canyon, aim the center marker, and press Enter or Space | Tap a wall |
| Return to the starting view | Reset view | Reset view icon |

Tab into the canyon or choose **Use keyboard aim** in Controls. Tab moves focus out of the 3D area. The Controls panel also has a movement-pad toggle, a reduced-motion option, and three accessible sample buttons. The visual note indicator works while muted. The sample buttons also work if WebGL 2 is unavailable.

## Source

- `src/canyon.js` generates the terrain, prepares pickable meshes, and defines camera boundaries.
- `src/camera.js` handles camera movement, looking, and reset.
- `src/ripples.js` draws the strike and its reflected ripples against the rock.
- `src/audio.js` synthesizes the chimes and calculates the stereo reflections and reverb.
- `src/main.js` connects the interface, raycasting, browser input, and renderer lifecycle.

The site bundles Three.js, its fonts, and a still rendered from the procedural canyon for the graphics fallback. It needs no server code, asset downloads, or API keys at runtime.
