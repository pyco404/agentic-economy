# Agentic Economy cinematic explainer production

**Current gate: 15-second voice/music/animation sample for approval.** The 120-second final is not yet rendered. The user has authorized a source-only Git checkpoint; rendered media remains local, and the full-film approval gate is unchanged. `source/scenes.json` preserves the complete eight-scene, 120-second brief and spoken script for the next stage.

This directory is separate from application runtime. It imports the existing city geometry, roads, water, frontier, citizens, and ambient transport without editing any of them. There are no video dependencies in the live website, backend writes, wallet actions, or deployment changes.

## Review outputs

- `output/agentic-economy-15s-review.mp4` — 15 seconds, 1080×1350, 30 FPS, H.264/AAC, synchronized burned-in captions.
- `output/sample-narration.wav` — actual locally synthesized speech.
- `output/sample-original-score.wav` — original instrumental underscore and chimes.
- `output/sample-subtitles.srt` and `sample-cues.json` — timings measured from the generated speech, with deliberate editorial pauses.
- `output/sample-poster.png` — representative frame.
- `output/validation.json` — final media validation.

Media, models, private local snapshots, fonts, and intermediate frames are ignored by this directory's `.gitignore`. Do not commit large generated media without approval.

## Sample creative direction

Kokoro `af_heart`: warm English narration, synthesis speed 0.96, no post-generation time compression. The opening hook resolves into “Welcome to Agentic Economy.” Original Cmaj7 / Am7 / Fmaj7 / Gsus / Cmaj9 piano-and-pad music ducks under the narration, with a final loudness normalization pass.

The film-only camera orbits slowly across the real 413-building demo snapshot. Citizens are decorative visual animation, not claims about authoritative work events. City plates are captured at 720×720 and 15 FPS for CPU practicality; native 1080×1350 typography and compositing run at 30 FPS. This is an intentional preview-quality compromise. Consider a higher-resolution city plate for the final master after approval.

The approved website emblem, X-header colors, DM Sans and Libre Caslon Display are reused. The live website camera preset and controls are never changed.

## Reproduce

From repository root, with the existing workspace Node dependencies installed and FFmpeg/ffprobe/Chrome available:

1. Run `bash video/agentic-economy-explainer/source/setup.sh`. It creates an isolated cached environment, bootstraps pip if needed, downloads the licensed model/fonts/notices, and verifies the model/voice SHA-256 hashes. It does not change website dependencies. The existing review environment is `/tmp/aeco-video-venv`; new setups use `video/agentic-economy-explainer/cache/venv`.
2. Inspect the licensing sources in `LICENSES.md`. The setup script copies the approved logo from the frontend public assets only if the production copy is absent. The X banner remains a locally supplied art-direction reference.
3. Start the existing local demo backend. Snapshot it with `node video/agentic-economy-explainer/source/snapshot.mjs`. Only an explicit `mode: demo` snapshot is accepted. Default read-only API: `http://127.0.0.1:8787`.
4. Run `node video/agentic-economy-explainer/source/capture.mjs`. This uses its own temporary local Vite server on port 5188 and CPU-compatible Chromium. `PREVIEW_ONLY=1` renders one test frame.
5. Run `/tmp/aeco-video-venv/bin/python video/agentic-economy-explainer/source/audio.py`.
6. Run `/tmp/aeco-video-venv/bin/python video/agentic-economy-explainer/source/render_sample.py`.
7. Run `/tmp/aeco-video-venv/bin/python video/agentic-economy-explainer/source/validate.py`, then `node video/agentic-economy-explainer/source/playback.mjs` for actual browser decoding, playback and seeking. Substitute `video/agentic-economy-explainer/cache/venv/bin/python` on a fresh setup.

Steps 4 and 5 are independent. Capture and synthesis use explicit elapsed times and a fixed random seed. Freeze the demo snapshot to reproduce scene geometry. H.264 encoding bytes may vary by FFmpeg version, but frame and scene timing are fixed.

## Full-film approval scope

Review the voice, pacing, music level, captions, city framing, and overall branding in the sample first. After approval, extend the renderer with the remaining seven scenes, concept interfaces, roadmap labels, creator-fee diagrams, and the closing brand reveal. Never imply token launches, holder-access agents, rewards, rentals, or trading are already live. Proposed creator-fee percentages apply only to eligible creator fees; no real payout statistics or prices may be invented.
