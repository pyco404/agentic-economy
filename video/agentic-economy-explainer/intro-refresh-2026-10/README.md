# Original introductory film — current-city refresh

22 October 2026. This project updates the **original cinematic introduction**. It is separate from `how-it-works-2026-10`, the product explainer. Neither previous production nor the financial application is modified.

**Current gate: review the updated 15-second intro sample before finalizing 120 seconds.** The original workspace contains a 15-second MP4 and a planned 120-second timeline, not a finished 120-second master. This refresh supplies a new six-scene 0–120-second narration/storyboard, replacing obsolete USDC and current-agent claims without turning the introduction into a tutorial.

## Review outputs

- `output/agentic-economy-intro-refresh-15s-review.mp4`: fresh actual current-city footage, original narrator model/style, original score, new timed narration and burned-in captions. 1080 × 1350, 30 FPS, exactly 15 seconds, H.264/AAC with faststart.
- `output/sample-narration.wav`, `sample-original-score.wav`, `sample-mix.wav`.
- `output/sample-subtitles.srt`, `sample-cues.json`, `sample-poster.png`, `sample-thumbnail.png`.
- `output/old-vs-current-city.jpg`: old introductory-video frame beside fresh current main footage, labeled as a comparison only.
- `output/validation.json`, `audio-validation.json`, `browser-playback.json`.
- `NARRATION.txt`, `STORYBOARD.md`, `source/scenes.json`: complete six-scene 120-second plan.

## What changes visually

Old city plates in the original production are not used in the updated sample. New footage comes from the latest main frontend (`66e5c71` application source), served by Vite on port 5173 with a separate in-memory demo API on 8795. Capture waits for FULLY_ACTIVE, zero pending reveal work, complete scenery and both railway reports. Initial/final geometry-build counts must match. See `cache/capture-evidence.json` for exact preparation/camera metrics.

The film first shows the complete irregular landmass, then moves toward a closer city framing. Existing camera zoom/pan/orbit controls are used in an isolated browser only. Approved viewing direction and application defaults remain intact. Surrounding UI and agent-name labels are hidden only in that recording browser. No invented scenery, static generated city images, debug/editor overlays or new transaction footage is used.

The actual browser recording is conformed to 30 FPS; it is not a claim that a 30 FPS render guarantee applies to every end-user device. The new introduction retains the original ivory/green typography, emblem, restrained motion and piano/pad composition. It contains no Economy-dashboard sequence from the explanatory sample.

## Reproduce

Use existing workspace Node dependencies, Chrome, FFmpeg and the parent's Python requirements. Existing model/font/brand resources are reused read-only through `AECO_VIDEO_RESOURCES` or the original production resource folder. This session uses `/tmp/aeco-how-it-works-venv/bin/python`.

From repository root, while the current safe local app is available:

```bash
node video/agentic-economy-explainer/intro-refresh-2026-10/source/capture.mjs
mkdir -p video/agentic-economy-explainer/intro-refresh-2026-10/cache/city
ffmpeg -y -sseof -15 -i video/agentic-economy-explainer/intro-refresh-2026-10/cache/current-city-recording.webm -vf fps=30 -frames:v 450 -start_number 0 -q:v 2 video/agentic-economy-explainer/intro-refresh-2026-10/cache/city/%05d.jpg
```

From this project folder, using the isolated production Python:

```bash
python source/audio.py
python source/render_sample.py
python source/compare.py
python source/validate.py
```

Then from repository root:

```bash
node video/agentic-economy-explainer/intro-refresh-2026-10/source/playback.mjs
```

The public root still returned 404 during this refresh; staging returned 200. The sample therefore uses `staging.useaeco.xyz`. Recheck before the final closing CTA. No DNS or deployment settings are changed.

After sample approval: record the remaining current-city and short product glimpses; preserve truthful Devnet/planned labels; synthesize/tune the six-scene narration; create full captions; assemble exactly 120 seconds/3,600 frames; validate audio/visual continuity and browser playback; deliver the final thumbnail and source notes. Never perform a new wallet signature or financial operation just to obtain footage.

Media, cache, fonts and model weights remain ignored. Source/docs use main-only, one-file Conventional Commits.
