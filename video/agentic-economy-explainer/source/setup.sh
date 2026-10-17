#!/usr/bin/env bash
# Isolated production tools and openly licensed assets. No app dependency changes.
set -euo pipefail
production_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repository_root="$(cd -- "$production_root/../.." && pwd)"
mkdir -p "$production_root/cache" "$production_root/assets" "$production_root/output"
fetch_asset() {
  if [[ ! -s "$2" ]]; then
    curl -fL --retry 2 "$1" -o "$2.partial"
    mv -- "$2.partial" "$2"
  fi
}
if [[ ! -x "$production_root/cache/venv/bin/python" ]]; then
  python3 -m venv --without-pip "$production_root/cache/venv"
fi
if ! "$production_root/cache/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  fetch_asset https://bootstrap.pypa.io/get-pip.py "$production_root/cache/get-pip.py"
  "$production_root/cache/venv/bin/python" "$production_root/cache/get-pip.py"
fi
"$production_root/cache/venv/bin/python" -m pip install -r "$production_root/requirements.txt"
release=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
fetch_asset "$release/kokoro-v1.0.onnx" "$production_root/cache/kokoro-v1.0.onnx"
fetch_asset "$release/voices-v1.0.bin" "$production_root/cache/voices-v1.0.bin"
(cd "$production_root/cache" && sha256sum --check <<'HASHES'
7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5  kokoro-v1.0.onnx
bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin
HASHES
)
fetch_asset https://raw.githubusercontent.com/google/fonts/main/ofl/librecaslondisplay/LibreCaslonDisplay-Regular.ttf "$production_root/assets/LibreCaslonDisplay-Regular.ttf"
fetch_asset 'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf' "$production_root/assets/DMSans.ttf"
fetch_asset https://raw.githubusercontent.com/google/fonts/main/ofl/librecaslondisplay/OFL.txt "$production_root/assets/LibreCaslon-OFL.txt"
fetch_asset https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt "$production_root/assets/DMSans-OFL.txt"
fetch_asset https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md "$production_root/assets/kokoro-model-card.txt"
fetch_asset https://raw.githubusercontent.com/thewh1teagle/kokoro-onnx/main/LICENSE "$production_root/assets/kokoro-onnx-license.txt"
if [[ ! -s "$production_root/assets/logo.png" ]]; then
  cp -- "$repository_root/apps/web/public/aeco-website-logo.png" "$production_root/assets/logo.png"
fi
printf '%s\n' 'Production toolchain ready. See README.md for snapshot, capture, synthesis, export and validation commands.'
