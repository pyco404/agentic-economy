# How Agentic Economy Works — second official film

21 October 2026. **Approval stage: new 15-second sample.** The complete 120-second edit is deliberately not rendered until the owner reviews this sample, as required by the production brief. The first introductory video and its outputs are preserved.

## Review material

- `output/how-agentic-economy-works-15s-review.mp4`: actual spoken English narration, original instrumental score, animated captions and real current staging footage; 1080 × 1350, 30 FPS, exactly 15 seconds.
- `output/sample-narration.wav`, `sample-original-score.wav`, `sample-mix.wav`.
- `output/sample-subtitles.srt`, `sample-cues.json`, `sample-thumbnail.png`.
- `NARRATION.txt`: complete 279-word, eight-scene narration draft.
- `STORYBOARD.md` and `source/scenes.json`: exact 0–120-second editorial slots and evidence/footage requirements.
- `VERIFICATION.md`, `LICENSES.md`: factual scope, source attribution, licenses and remaining gates.

The sample is a new product explainer opening, not a reused export of the first introduction. The city is recorded from the live staging product, including its current airport apron, buildings, water and railway. The next scene transitions to the actual Economy dashboard. Voice: local Kokoro `af_heart`, CPU, speed 1.02. The approved project emblem, X banner art direction, DM Sans and Libre Caslon Display are reused. Music reuses the project's original procedural piano/pad composition with narration ducking.

The current official root/www domains return 404, so this version displays **staging.useaeco.xyz**, the verified live demo. No production domain or deployment settings are changed for the video.

## Reproduce the sample

Prerequisites: workspace Node dependencies, Chrome, FFmpeg/ffprobe and an isolated Python environment with the parent `requirements.txt`. Existing resources may be reused through `AECO_VIDEO_RESOURCES=/path/to/agentic-economy-explainer` (contains `assets/` and `cache/` model files). Otherwise run the parent `source/setup.sh` to acquire resources and notices. No dependencies enter the financial application.

From repository root:

```bash
node video/agentic-economy-explainer/how-it-works-2026-10/source/capture.mjs
```

Extract the final 12 seconds of actual recorded city motion at 15 FPS, starting file numbers at zero:

```bash
mkdir -p video/agentic-economy-explainer/how-it-works-2026-10/cache/city
ffmpeg -y -sseof -12 -i video/agentic-economy-explainer/how-it-works-2026-10/cache/city-recording.webm -vf fps=15 -frames:v 180 -start_number 0 -q:v 2 video/agentic-economy-explainer/how-it-works-2026-10/cache/city/%05d.jpg
```

Using the production environment's Python (this session: `/tmp/aeco-how-it-works-venv/bin/python`):

```bash
python source/audio.py
python source/render_sample.py
python source/validate.py
```

Run those three Python commands from this project directory. Then, from repository root:

```bash
node video/agentic-economy-explainer/how-it-works-2026-10/source/playback.mjs
node video/agentic-economy-explainer/how-it-works-2026-10/source/audit.mjs
```

`capture.mjs` is read-only: it hides surrounding UI only inside the capture browser to make a city plate, then captures product screens. `audit.mjs` can refresh page evidence independently. Neither invokes wallet authentication, Pinata uploads, token creation, financial execution, deployments or database changes. The city and interface are not modified in application source. Actual city recording is sampled at 15 FPS; editorial titles and captions are composed at native 30 FPS. This is a sample-quality motion compromise to review before the final master.

## After sample approval

Record the remaining product demonstrations with appropriate live-demo/Devnet labels. Reuse existing verified Devnet evidence, not a new unauthorized launch. An actual Phantom approval recording is still needed if no suitable previous recording is available; do not manufacture a wallet popup or imply automated signing was Phantom. Future Common Agent and Super Agent visuals must say Planned. Render/tune full narration within each slot, create the full SRT, render exactly 3,600 frames, mix and validate the 120-second master, and provide its thumbnail, separate voiceover, editable source and report.

Rendered media, private snapshots, model weights and cache stay ignored. Commit source/docs only, one file per Conventional Commit. No application or financial configuration changes are required.
