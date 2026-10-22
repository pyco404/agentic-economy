# Activity revision verification

Both revised films passed:

- Exactly 120.000 seconds, 3,600 frames, 1080 × 1350, constant 30 fps; H.264 video and stereo AAC audio.
- Full FFmpeg decode without errors. Chrome playback and seeks through 119 seconds succeeded for both final files.
- Approved sample-scale opening/closing camera, with smooth closer street, waterfront and rail-corridor views. Representative actual encoded frames inspected at 5, 25, 50, 75, 95 and 115 seconds.
- Opening-frame green city pixel area increased 3.31× in the introduction and 4.25× in the explainer, measured in the same image region. These are visible pixel-area ratios, not linear zoom factors.
- Stationary-camera source comparisons at 5–10, 25–30 and 75–80 seconds show 6117, 8322, 9626 changing pixels above threshold. Motion is present independently of the camera and editorial overlays.
- Fresh continuous real-world footage; earlier 15-second samples were not looped or stretched.
- Core, joined/outer terrain, water and both railways fully prepared before recording. Geometry build count remained 16; no browser errors or delayed structural reveal.
- Original complete narration/music source retained, with the same 27 introduction and 32 explainer cue timestamps. Caption text enlarged and editorial panels moved upward; close-angle information panels have ivory backing.
- Source browser capture is 25 fps, conformed to 30 fps. A boundary hold of at most 0.08 seconds resolves final frame conversion; no long frozen padding is used.
- Application geometry, camera defaults, financial configuration, deployment settings and databases unchanged. Isolated memory demo backend reports financialFeaturesEnabled=false.
- Previous videos and previews preserved. Revised outputs use explicit Activity-Revision filenames.

## Final file hashes

Introduction: `d03b4af899dfc57d972b851ad238ded8aa42be5f8c2942cc2937177f9d78c3d6`

Explainer: `5e563bdccaca971faf66ae6e07039aaf1c7ee38345d65c9a319657ef9175a987`

Detailed evidence: output/verification.json, output/*-browser-playback.json, output/*-before-after.jpg and cache/capture-evidence.json.

Resource licensing follows the existing parent films. This revision reuses their licensed narration, original score, fonts and logo. No new wallet signature, financial transaction or external image upload was performed.
