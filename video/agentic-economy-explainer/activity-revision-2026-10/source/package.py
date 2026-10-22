"""Preserve an editable revision project and reused original narration/resources."""
from pathlib import Path
import zipfile
from resources import ASSETS
ROOT=Path(__file__).resolve().parents[1];PARENT=ROOT.parent;OUT=ROOT/'output'
files=[]
def add(path,name):
 assert path.is_file(),path
 files.append((path,name))
for name in ['README.md','VERIFICATION.md']:add(ROOT/name,ROOT.name+'/'+name)
for p in (ROOT/'source').iterdir():
 if p.is_file():add(p,ROOT.name+'/source/'+p.name)
for name in ['city-activity-continuous.webm','capture-evidence.json']:add(ROOT/'cache'/name,ROOT.name+'/cache/'+name)
for name in ['verification.json','intro-browser-playback.json','explainer-browser-playback.json','intro-before-after.jpg','explainer-before-after.jpg','intro-thumbnail.png','explainer-thumbnail.png']:add(OUT/name,ROOT.name+'/output/'+name)
for film in ['intro-final-2026-10','explainer-final-2026-10']:
 root=PARENT/film
 for name in ['README.md','LICENSES.md','NARRATION.txt','STORYBOARD.md']:add(root/name,film+'/'+name)
 for name in ['render.py','resources.py','scenes.json']:add(root/'source'/name,film+'/source/'+name)
 for name in ['final-mix.wav','final-narration.wav','final-original-score.wav','final-cues.json','final-subtitles.srt']:add(root/'output'/name,film+'/output/'+name)
 for p in (root/'cache').glob('*.png'):add(p,film+'/cache/'+p.name)
 if film=='explainer-final-2026-10':
  for name in ['economy','actual-agent','launchpad','treasury']:add(root/'cache'/(name+'-recording.webm'),film+'/cache/'+name+'-recording.webm')
for p in ASSETS.iterdir():
 if p.name in ['logo.png','DMSans.ttf','LibreCaslonDisplay-Regular.ttf'] or any(x in p.name.lower() for x in ['ofl','license','model-card']):add(p,'resources/assets/'+p.name)
target=OUT/'Agentic-Economy-Activity-Revisions-Production.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for source,name in files:z.write(source,name)
 z.writestr('PORTABLE-EDITING.txt','Keep the three project folders beside one another. Set AECO_VIDEO_RESOURCES to the included resources directory, install Pillow and FFmpeg, and run activity-revision-2026-10/source/render.py intro or explainer. All original narration, timing, product recordings and fresh city footage are included. Existing MP4s are delivered separately. No voice model weights or credentials are included.\n')
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(target)
