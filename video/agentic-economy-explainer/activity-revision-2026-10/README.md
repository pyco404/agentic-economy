# Activity-focused revisions of the two complete videos

The user's latest approved reference is `Agentic-Economy-How-It-Works-15s-Sample.mp4`: larger city, visible activity, preserved introductory/explanatory storytelling and full two-minute duration. The earlier requirement to keep every edge simultaneously inside a distant frame has been superseded by that correction.

Both revised films open and close at the sample's camera scale. Between those holds the existing city is gently framed closer around streets, waterways and the rail corridor. The complete static world is prepared before recording; application geometry, camera defaults, financial systems, data and deployment settings are unchanged. The recording hook changes only its isolated browser response.

- 120 seconds each; 1080 × 1350; constant 30 fps; H.264/AAC fast-start MP4.
- Actual continuous 121-second activity tour, not a 15-second loop or enlarged still.
- Existing narration, music and subtitle cue timing retained from each completed film.
- City viewport 1080 × 1080 placed at y=185, matching the approved sample composition; no geometric stretching.
- Camera zoom 1.16 for the sample view, moving smoothly to 1.62/1.65 for activity shots and 1.48 along the rail corridor.
- Editorial panels moved upward, with an ivory backing to preserve readability at close angles; subtitle text enlarged to 37px.
- Existing genuine product footage and labeled Devnet evidence retained in the explainer. No new wallet action, upload, transaction, migration or financial execution.
- Earlier previews and 120-second versions are preserved.

## Reproduce

Use the current main application with the isolated memory-only demo API on 8795 and Vite frontend on 5173. Financial execution stays disabled.

```bash
node source/capture.mjs
python3 source/render.py intro --prepare-only
python3 source/render.py explainer --prepare-only
python3 source/render.py intro --encode-only
python3 source/render.py explainer --encode-only
python3 source/verify.py
node source/playback.mjs intro
node source/playback.mjs explainer
```

The renderer uses the existing parent film source, narration and captured product resources. It prepares cached transparent editorial frames and uses FFmpeg to compose the fresh continuous scene, preserving the original narration timestamps. The output frame conversion includes at most 0.08 seconds of end-frame hold to resolve 25-to-30 fps boundary rounding; the scene content itself is a continuous two-minute recording.

Python requires Pillow. FFmpeg/FFprobe and the existing Playwright/Chrome setup are also required. Existing font/logo resources and their licensing notes remain unchanged. Regenerating narration is unnecessary for this revision.

Final outputs use `-Activity-Revision` filenames in Downloads so users can distinguish them from the earlier distant compositions. The verification report includes measured city-area increases, stationary-camera animation checks, complete file decoding, media format and browser playback results.
