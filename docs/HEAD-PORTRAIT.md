# Caleb’s reconstructed portrait

Reconstructed locally from Caleb’s supplied 24.94-second orbit video, IMG_6219.MOV, using 100 frames and Apple RealityKit Object Capture. The September 2026 revision restores the chin, neck, collar, and shoulders from the same scan.

The portrait uses 165,605 black stipples on white. The entire bust uses continuous surface sampling. Texture luminance and surface lighting subtly control dot size rather than gray color. An invisible surface occludes rear-facing points. The lower chest fades through decreasing point density. ASCII remains an optional rendering mode.

Visual reference: [Phantom’s 3D face particle system](https://tympanus.net/codrops/2025/06/30/invisible-forces-the-making-of-phantom-lands-interactive-grid-and-3d-face-particle-system/), particularly its use of contrast to retain facial features. This implementation uses Caleb’s own scan and original rendering code.

Public asset format (version 2, little-endian):

- `bust.json`: point count, position scale, bounds, and mouth center.
- `bust-points.bin`: seven int16 values per point: xyz / 8192, normal xyz / 32767, luminance / 32767.
- `bust-surface.bin`: unindexed triangle xyz positions, int16 / 8192.
- `speech-preview.mp3`: unused generic sample kept with the portrait assets. The homepage does not play it.

The source movie, full-body mesh, and original color textures remain outside the public website. Public geometry contains only the cropped bust. Uneven capture lighting and expression changes remain limitations of the scan.

The jaw hinges near the ears, so the chin swings down and back while the cheeks stretch with it; the lips add their own small shaping. A shared analytic lens-shaped opening in the visible points and depth surface reveals a recessed stippled mouth interior, with a pale band of upper teeth and a lighter tongue, over a white backdrop that hides the far side of the head. The scan cannot capture eyes, so each eye is a modeled eyeball with a stippled iris, pupil, and fixed catchlight, clipped by analytic lids. Inside the open lids the scan's smeared eye becomes pale sclera; a blink slides the upper lid down and turns that area into lid skin. This is a stylized rig, not a full anatomical facial model. See [voice integration](PORTRAIT-VOICE.md). Floating page navigation is deferred.

## Mouth calibration

The mouth is placed from `MOUTH_FIT` in `src/scripts/portrait-mouth.ts`: the scan's lip line (center, half width to the corners, slope), the x it is moved to (under the nose), and the modeled upper and lower lip heights. The shader levels and recenters the scan's lips onto that frame, draws the lips with the scan's own stipples, and sizes the opening to 68% of the lip width.

Open the site with `?mouth` to calibrate. With **Raw scan** on, drag the two red dots onto the corners of the mouth in the scan. Turn it off to preview the lips, use **Open** to test speech, and adjust the sliders. The URL updates as you go; **Copy link** gives a `?mouth=cx,cy,halfWidth,slope,center,upper,lower` link that previews those values for anyone, and the same numbers can be pasted into `MOUTH_FIT` to make them the default.
