# Rebuilding the portrait

Requires an Apple Silicon Mac with Object Capture support, Swift command-line tools, ffmpeg, and Python with numpy, pillow, and trimesh.

1. Extract the source movie to a private working directory with ffmpeg, at 4 frames per second, full resolution and JPEG quality 2.
2. Compile `reconstruct-head.swift` with `swiftc -parse-as-library`; run with the frames directory and output `.usdz` path. This may take several minutes. Check for `requestComplete` and `processingComplete` in its output.
3. Run `export-head.swift` with the USDZ source and OBJ destination using Swift. Unzip the USDZ into `unpacked/` alongside the OBJ to expose its texture files.
4. Run `prepare-head.py MODEL_DIRECTORY public/head`. It expects `head.obj` plus `unpacked/0/*tex*` from this reconstruction. The crop and orientation are specific to this scan; inspect a new scan before reusing them.
5. Build the website and visually check front, profiles, and back in both rendering modes.

Source video and full reconstruction are deliberately kept outside the repository. The web assets contain only the cropped head. Stable sampling seeds preserve the portrait across rebuilds of the same mesh.
