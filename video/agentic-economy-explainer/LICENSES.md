# Audio and artwork provenance

The review sample uses **Kokoro-82M v1.0**, `af_heart`, at synthesis speed 0.96, through a CPU-only ONNX Runtime session. This is a supplied synthetic voice, not a clone commissioned from a named person.

The publisher identifies the **model weights as Apache-2.0**, with commercial and production deployments explicitly contemplated:
- https://huggingface.co/hexgrad/Kokoro-82M
- https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md

The downloaded ONNX model and voice embeddings come from the official `kokoro-onnx` v1.0 asset release:
- https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

The **kokoro-onnx runner is MIT**:
- https://github.com/thewh1teagle/kokoro-onnx/blob/main/LICENSE

Retain the corresponding license and attribution notices when redistributing model/engine software. The model card and runner license are archived under ignored `assets/`; weights and embeddings are ignored under `cache/`. Do not commit these large files.

The score and reveal chimes are **original deterministic synthesis** authored in `source/audio.py`: piano-like harmonic envelopes, a soft detuned pad, and reveal tones. No stock recordings, commercial songs, third-party music samples, or licensed sample libraries are used. The audio is created specifically for this project; no exclusivity claim about an AI-generated work is implied.

DM Sans and Libre Caslon Display are under the **SIL Open Font License 1.1**. Font files and notices are archived in `assets/`. Sources:
- https://github.com/google/fonts/tree/main/ofl/dmsans
- https://github.com/google/fonts/tree/main/ofl/librecaslondisplay

The approved Agentic Economy emblem and banner were supplied locally by the project owner. The banner is a reference asset; the footage is rendered from the actual procedural generators and a read-only local demo snapshot. Existing project code and artwork retain their original ownership and licensing.

The initial Piper fallback was investigated but is **not used** in this sample. No Lessac voice is used; its source-data licensing was unsuitable for this promotional task.
