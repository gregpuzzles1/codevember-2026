# Labyrinth

An interactive Three.js garden labyrinth for Codevember Day 13. Begin at the garden gate, follow the winding stone path to the bench, sit for a while, then turn around and retrace your steps.

Run a static server from this folder:

```sh
python -m http.server 8765
```

Open `http://localhost:8765`. An internet connection is required to load Three.js and the fonts. Drag to rotate the view, scroll to zoom, and use the journey button to walk in either direction. The journey card hides during each walk and returns at the bench or the gate.
