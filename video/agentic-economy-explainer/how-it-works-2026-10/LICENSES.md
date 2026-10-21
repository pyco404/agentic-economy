# Voice, music and visual sources

Reviewed 21 October 2026. This edit reuses the existing production's `af_heart` synthetic voice and resources, not a newly cloned identifiable speaker.

- **Kokoro-82M v1.0 weights: Apache-2.0.** The publisher expressly permits production/commercial deployment: https://huggingface.co/hexgrad/Kokoro-82M and its model card https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md . The model card's example uses `af_heart`. Keep the complete archived model card and license notices with redistributed software/model assets.
- **ONNX model and voice embeddings:** existing official model-files-v1.0 distribution, https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 . Runner is MIT: https://github.com/thewh1teagle/kokoro-onnx/blob/main/LICENSE . Original cached SHA-256 hashes are checked by the validation report. CPUExecutionProvider is used; no hosted speech service.
- **Music:** original deterministic piano/pad/chime synthesis from the project's existing `source/audio.py`, adapted in this edit's `source/audio.py`. No stock track, third-party recording or sample library. No Content ID exclusivity or legal exclusivity claim is made.
- **Typography:** DM Sans and Libre Caslon Display, SIL Open Font License 1.1; existing archived OFL notices. https://github.com/google/fonts/tree/main/ofl/dmsans and https://github.com/google/fonts/tree/main/ofl/librecaslondisplay .
- **Brand:** owner-supplied layered forest-green emblem and X banner, reused from the original production assets. No generic city assets or generated fantasy imagery.
- **Footage:** actual https://staging.useaeco.xyz product captured read-only on 21 October 2026. Existing project code/artwork retain their ownership and licensing. Public roadmap concept illustrations will be made in code after approval and labeled Planned.

Full resources/notices remain in the original ignored `assets/` directory; this production does not overwrite those files or the first video. See the parent `LICENSES.md` for original provenance. A final publication license review should retain the notices appropriate to anything actually redistributed; model files are not embedded in the MP4.
