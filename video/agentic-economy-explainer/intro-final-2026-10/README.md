# Agentic Economy — A World That Works

Final introductory production, October 2026. Exactly 120 seconds, 1080 × 1350, 30 fps. Separate from the earlier review edits and the educational explainer.

The complete existing city stays visible in all six scenes. This is a continuous recording of the current application, with a fixed approved viewing direction. A browser-only recording hook measures the core, frontier and infrastructure geometry using Three.js Box3, projects the world bounds through the orthographic camera, then fits them within ±0.88 normalized device coordinates. It never edits application files or camera defaults. All static sections and both railways are ready before recording. The compositor preserves the viewport's aspect ratio and adds ivory space for titles and captions.

## Reproduction

Use the existing isolated memory-only API on 8795 and current main Vite UI on 5173. Financial execution must remain disabled. No wallet is required for production.

From this directory:

```bash
node source/capture.mjs
mkdir -p cache/frames
ffmpeg -y -sseof -120 -i cache/full-field-continuous.webm -an -vf fps=30 -frames:v 3600 -q:v 3 -start_number 0 cache/frames/%05d.jpg
/tmp/aeco-how-it-works-venv/bin/python source/audio.py
/tmp/aeco-how-it-works-venv/bin/python source/render.py
/tmp/aeco-how-it-works-venv/bin/python source/verify.py
```

`source/capture_product.mjs` captures read-only inset views. The actual working UI is shown in small panels during scene three; the city remains underneath throughout. No authentication, image upload, signing, token creation, migration or treasury operation is performed.

Output: `output/Agentic-Economy-A-World-That-Works-120s.mp4`. Supporting files include a complete narration WAV, original instrumental score WAV, narration script, SRT, thumbnail and JSON verification. Local recordings, fonts and models are ignored media resources; editable source is retained here. All earlier videos are preserved.

## Accuracy and publication note

Today's visible workers are rule-based simulation agents, and Credits are simulated. SOL token creation is described as Devnet verified; public mainnet launching remains disabled. Common Agents, AECO utility, Super Agents and rentals are explicitly planned. No guaranteed rewards are claimed.

At the final export availability check, `https://useaeco.xyz` returned HTTP 404 (`DEPLOYMENT_NOT_FOUND`). `https://staging.useaeco.xyz` returned HTTPS 200. The working staging address is used in the film rather than sending viewers to a broken root domain. No DNS or deployment change was made.

The browser recorder produces 25 fps source footage; the MP4 is conformed to constant 30 fps. Actual application rendering cadence depends on available GPU/CPU resources. No still-image animation or repeated 15-second city loop is used.
