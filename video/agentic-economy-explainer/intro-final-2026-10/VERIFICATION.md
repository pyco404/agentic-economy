# Final verification

- Complete introductory film: exactly 120.000 seconds; 3,600 frames; 1080 × 1350; constant 30 fps; H.264 yuv420p video and AAC stereo audio; fast-start MP4.
- Complete FFmpeg decode passed without errors.
- Chrome playback succeeded; seeking to 5, 25, 50, 75, 99, 114 and 119 seconds succeeded without media errors.
- All six representative scenes inspected at 5, 25, 50, 75, 99 and 114 seconds. Full landmass stays visible; no city-camera zoom or source cuts.
- Actual static-world geometry measured and projected within ±0.88 NDC. Core, outer frontier and both railway systems ready before recording. Geometry build count remained 16 throughout.
- Continuous 121-second capture, final uninterrupted 120 seconds used. Motion verified independently at 23 five-second intervals; each comparison has more than 4,000 changing city pixels. No repeated 15-second loop or still-photo motion.
- Twenty-seven narration/subtitle cues, measured against generated speech lengths, non-overlapping and within the 120-second duration. Final spoken cue ends at 119.600 seconds.
- Newly synthesized full-length narration and music; no stretched preview audio. Same approved narrator identity, speed 1.02 for natural scene timing. Instrumental underscore ducks beneath speech.
- Source browser recording is 25 fps, conformed to constant 30 fps in the final MP4. Runtime GPU rendering cadence varies; this does not represent a native 30 fps source capture.
- Current rule-based simulation described accurately; future capabilities labeled Planned. Mainnet launch and financial execution remain disabled. No wallet, treasury, migration or deployment operations performed.
- Root domain HTTPS check returned 404 DEPLOYMENT_NOT_FOUND. Working staging HTTPS returned 200, and its URL is used in the film. This is the outstanding public-domain issue, not a video-rendering failure.
- Original introductions and review samples preserved.

SHA-256: `12cb13d3ecfbf81086d535b8fda2e11ef7eb9529322d531e95f0dfd23710fd58`

Detailed measurements: output/verification.json, output/browser-playback.json and cache/capture-evidence.json.
