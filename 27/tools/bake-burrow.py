"""Bake the seamlessly joined burrow into an indexed mesh.

Run with NumPy and scikit-image from the project root.
"""
import json
import struct
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

root = Path(__file__).resolve().parent.parent
layout = json.loads((root / "layout.json").read_text())
step = 0.085
origin = np.array([-13.5, -8.5, -9.0], dtype=np.float32)
upper = np.array([15.0, 1.0, 8.0], dtype=np.float32)
shape = np.ceil((upper - origin) / step).astype(int) + 1
field = np.full(shape, 4, dtype=np.float32)


def stamp(lower, upper, distance):
    low = np.maximum(0, np.floor((lower - origin) / step).astype(int))
    high = np.minimum(shape, np.ceil((upper - origin) / step).astype(int) + 1)
    bounds = tuple(slice(a, b) for a, b in zip(low, high))
    point = np.ogrid[bounds]
    coordinates = [axis.astype(np.float32) * step + start for axis, start in zip(point, origin)]
    np.minimum(field[bounds], distance(*coordinates), out=field[bounds])


def spline_samples(controls):
    padded = np.concatenate((controls[:1], controls, controls[-1:]))
    for a, b, c, d in zip(padded, padded[1:], padded[2:], padded[3:]):
        for t in np.linspace(0, 1, 14, endpoint=False):
            yield 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t)
    yield controls[-1]


for tunnel in layout["tunnels"]:
    for x, y, z, radius in spline_samples(np.array(tunnel)):
        center = np.array([x, y, z])
        reach = radius + 0.36

        def distance(px, py, pz):
            return np.sqrt((px-x)**2 + (py-y)**2 + (pz-z)**2) - radius

        stamp(center - reach, center + reach, distance)

for room in layout["rooms"]:
    x, y, z, rx, ry, rz = room
    center = np.array([x, y, z])
    reach = np.array([rx, ry, rz]) * 1.25

    def distance(px, py, pz):
        return (np.sqrt(((px-x)/rx)**2 + ((py-y)/ry)**2 + ((pz-z)/rz)**2) - 1) * min(rx, ry, rz)

    stamp(center - reach, center + reach, distance)

# Blend the passage intersections before extracting the continuous interior surface.
field = gaussian_filter(np.clip(field, -0.6, 0.6), sigma=1.65)
vertices, faces, normals, _ = marching_cubes(field, level=0, spacing=(step, step, step),
                                             gradient_direction="ascent", allow_degenerate=False)
vertices += origin
# The distance increases toward soil. The marching-cubes normals face the open volumes.
# Compact unit normals to signed 16-bit values and pad them for aligned face indices.
packed_normals = np.zeros((len(vertices), 4), dtype="<i2")
packed_normals[:, :3] = np.rint(normals * 32767).astype("<i2")
with (root / "burrow.bin").open("wb") as output:
    output.write(struct.pack("<II", len(vertices), len(faces) * 3))
    output.write(vertices.astype("<f4").tobytes())
    output.write(packed_normals.tobytes())
    output.write(faces.astype("<u4").tobytes())
print(f"{len(vertices):,} vertices, {len(faces):,} triangles")
