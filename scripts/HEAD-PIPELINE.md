# Rebuilding the portrait

Requires an Apple Silicon Mac with Object Capture support, Swift command-line tools, ffmpeg, and Python with numpy, pillow, scipy, and trimesh.

1. Extract the source movie to a private working directory with ffmpeg, at 4 frames per second, full resolution and JPEG quality 2.
2. Compile `reconstruct-head.swift` with `swiftc -parse-as-library`; run with the frames directory and output `.usdz` path. Check for `requestComplete` and `processingComplete`.
3. Run `export-head.swift` with the USDZ source and OBJ destination using Swift. Unzip the USDZ into `unpacked/` alongside the OBJ to expose its texture files.
4. Run `prepare-head.py MODEL_DIRECTORY public/head`. It expects `head.obj` plus `unpacked/0/*tex*` from this reconstruction. The crop above y=0.575, rotation, origin, and lip anchor are specific to Caleb’s scan. Inspect a new scan before reusing them.
5. The script samples the entire bust at one continuous surface density, preserves the closed lip geometry, thins the lower chest, and emits quantized version-2 bust assets. Stable seeds preserve sampling across rebuilds of the same mesh.
6. Build the website and visually check front, profiles, back, mobile, and both rendering modes. Opening Ask Caleb should hold the bust facing the camera.

Source video and full reconstruction stay outside the repository. Public assets contain the cropped head and shoulders. See `docs/HEAD-PORTRAIT.md` for the binary format and visual reference.
