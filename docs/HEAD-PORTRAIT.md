# Caleb’s reconstructed portrait

Reconstructed locally from Caleb’s supplied 24.94-second orbit video, IMG_6219.MOV, using 100 frames and Apple RealityKit Object Capture. The September 2026 revision restores the chin, neck, collar, and shoulders from the same scan.

The portrait uses 176,340 black stipples on white. Texture luminance and surface lighting control dot size rather than gray color. An invisible surface occludes rear-facing points. The lower chest fades through decreasing point density. ASCII remains an optional rendering mode.

Visual reference: [Phantom’s 3D face particle system](https://tympanus.net/codrops/2025/06/30/invisible-forces-the-making-of-phantom-lands-interactive-grid-and-3d-face-particle-system/), particularly its use of contrast to retain facial features. This implementation uses Caleb’s own scan and original rendering code.

Public asset format (version 2, little-endian):

- `bust.json`: point count, position scale, bounds, and mouth center.
- `bust-points.bin`: seven int16 values per point: xyz / 8192, normal xyz / 32767, luminance / 32767.
- `bust-surface.bin`: unindexed triangle xyz positions, int16 / 8192.
- `speech-preview.mp3`: generic system voice demonstration, not a voice clone.

The source movie, full-body mesh, and original color textures remain outside the public website. Public geometry contains only the cropped bust. Uneven capture lighting and expression changes remain limitations of the scan.

The mouth and jaw deform together, with a recessed stippled mouth interior. This is a stylized rig, not a full anatomical facial model. Audio amplitude drives the preview; timed mouth shapes are available for a future voice provider. See [voice integration](PORTRAIT-VOICE.md). Floating page navigation is deferred.
