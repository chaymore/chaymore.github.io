"""Build a stippled bust from Caleb's local textured scan (no video is published)."""
import json
import sys
from pathlib import Path
import numpy as np
import trimesh
from PIL import Image

root, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
source = trimesh.load(root / 'head.obj', force='mesh', process=False)
# Restore the complete chin, neck, collar and shoulders from the original scan.
mask = np.all(source.vertices[source.faces][..., 1] > .575, axis=1)
mesh = source.submesh([np.flatnonzero(mask)], append=True)
a = -.58
rotation = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
origin = np.array([.0345, .82, .03])
scale = 6.
vertices = (mesh.vertices @ rotation.T - origin) * scale
mouth_x, mouth_y = .015, .018
# Calibrated on the original textured scan: the closed lip line, below the philtrum.
tex = np.asarray(Image.open(next((root/'unpacked/0').glob('*tex*'))).convert('RGB')) / 255.

# One continuous sampling density avoids a visible head/neck boundary.
parts = []
for count, seed in [(190000, 37)]:
    part = mesh
    p, fi = trimesh.sample.sample_surface_even(part, count, seed=seed)
    bary = trimesh.triangles.points_to_barycentric(part.triangles[fi], p)
    uv = (part.visual.uv[part.faces[fi]] * bary[:, :, None]).sum(axis=1)
    n = (part.vertex_normals[part.faces[fi]] * bary[:, :, None]).sum(axis=1)
    n /= np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-8)
    c = tex[((1-uv[:, 1])*(tex.shape[0]-1)).astype(int).clip(0, tex.shape[0]-1),
            (uv[:, 0]*(tex.shape[1]-1)).astype(int).clip(0, tex.shape[1]-1)]
    luma = c @ np.array([.2126, .7152, .0722])
    p = (p @ rotation.T - origin) * scale
    n = n @ rotation.T
    # The scan's window casts a strong side shadow. Lift that low-frequency cast,
    # retaining local contrast in eyebrows, eyes, lips, and hair.
    skin = (p[:,1] > -.3) & (p[:,1] < .62) & (p[:,2] > .2)
    luma[skin] = np.clip(luma[skin] + .10 * np.clip(p[skin,0] + .1, 0, 1), 0, 1)
    # Fade the shoulder/chest edge by removing samples, never by turning dots gray.
    fade = np.clip((p[:,1] + 1.45) / .50, 0, 1)
    fade = fade*fade*(3-2*fade)
    keep = np.random.default_rng(seed).random(len(p)) < fade
    parts.append(np.column_stack([p[keep], n[keep], luma[keep]]))
points = np.concatenate(parts)
# Shuffle keeps each quality-level prefix spatially representative.
np.random.default_rng(123).shuffle(points)
encoded = points.copy()
encoded[:,:3] *= 8192
encoded[:,3:6] *= 32767
encoded[:,6] *= 32767
assert np.isfinite(encoded).all() and np.max(abs(encoded)) <= 32767
np.rint(encoded).astype('<i2').tofile(out/'bust-points.bin')
np.rint(vertices[mesh.faces] * 8192).astype('<i2').tofile(out/'bust-surface.bin')
meta = dict(version=2, count=len(points), scale=8192, mouth=[mouth_x, mouth_y, .702],
            bounds=[points[:,:3].min(axis=0).tolist(),points[:,:3].max(axis=0).tolist()])
(out/'bust.json').write_text(json.dumps(meta, indent=2)+'\n')
print(json.dumps(meta))
