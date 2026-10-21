"""Reuse existing licensed resources without changing the original production."""
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
_default=ROOT.parent
_original=Path('/home/pikoo/Desktop/agentic-economy/video/agentic-economy-explainer')
LEGACY=Path(os.environ.get('AECO_VIDEO_RESOURCES',str(_default if (_default/'cache/kokoro-v1.0.onnx').exists() else _original)))
ASSETS=LEGACY/'assets'
