# Caleb’s reconstructed portrait

Generated from Caleb’s supplied 24.94-second orbit video, IMG_6219.MOV, on 2026-09-13.

100 frames extracted at 4 fps; reconstructed locally with Apple RealityKit PhotogrammetrySession, sequential ordering, high feature sensitivity, object masking, medium detail. The resulting textured mesh was cropped above y=0.775 in its reconstructed coordinates, sampled deterministically, centered, and normalized to 2.35 units tall. The short neck edge fades by thinning points. The head geometry and texture values come from the reconstruction, not an invented head model.

- `portrait.bin`: 63,422 little-endian float32 records: x, y, z, nx, ny, nz, luminance (7 floats per point).
- `surface.bin`: unindexed float32 triangle positions for depth occlusion; no visible solid surface.

The source movie, full-body mesh, and original color textures remain outside the public website. The website only serves the isolated head data.

The capture has uneven side lighting and slight expression changes; the stylized result preserves those capture limitations. Floating page navigation is deferred.
