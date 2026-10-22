"""Rebuild compositor frames from the included real continuous recordings."""
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
for name,seconds,directory in [('full-field-continuous',120,'frames'),('economy-recording',20,'economy-frames'),('launchpad-recording',20,'launchpad-frames'),('treasury-recording',4,'treasury-frames'),('actual-agent-recording',20,'actual-agent-frames')]:
    out=ROOT/'cache'/directory;out.mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-sseof',str(-seconds),'-i',str(ROOT/'cache'/f'{name}.webm'),'-an','-vf','fps=30','-frames:v',str(seconds*30),'-q:v','3','-start_number','0',str(out/'%05d.jpg')],check=True)
    assert len(list(out.glob('*.jpg')))==seconds*30
    print(f'{name}: {seconds*30} frames')
