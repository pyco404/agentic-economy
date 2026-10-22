"""Bundle editable source and authentic media; final MP4 delivered separately."""
from pathlib import Path
import zipfile
from resources import ROOT,ASSETS
OUT=ROOT/'output';files=[]
for name in ['README.md','NARRATION.txt','STORYBOARD.md','LICENSES.md','VERIFICATION.md']:files.append((ROOT/name,name))
for p in (ROOT/'source').glob('*'):
 if p.is_file():files.append((p,'source/'+p.name))
for name in ['final-narration.wav','final-original-score.wav','final-mix.wav','final-subtitles.srt','final-cues.json','audio-validation.json','verification.json','browser-playback.json','thumbnail.png','scene-contact-sheet.jpg']:files.append((OUT/name,'output/'+name))
for name in ['full-field-continuous.webm','capture-evidence.json','product-evidence.json','actual-agent-evidence.json','economy-recording.webm','launchpad-recording.webm','treasury-recording.webm','actual-agent-recording.webm','launchpad-current.png','explore-current.png','communities-current.png','economy-current.png','treasury-current.png','roadmap-current.png','verified-devnet-review.png','archived-developer-buy.png','verified-community-zapper.png']:files.append((ROOT/'cache'/name,'cache/'+name))
for name in ['logo.png','DMSans.ttf','LibreCaslonDisplay-Regular.ttf']:files.append((ASSETS/name,'resources/assets/'+name))
for p in ASSETS.glob('*'):
 if p.is_file() and any(x in p.name.lower() for x in ['ofl','license','model-card']):files.append((p,'resources/assets/'+p.name))
parent=ROOT.parent/'LICENSES.md'
if parent.exists():files.append((parent,'resources/Original-Provenance.md'))
with zipfile.ZipFile(OUT/'Agentic-Economy-How-It-Works-120s-Production.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=4) as z:
 for source,dest in files:
  assert source.is_file(),source
  z.write(source,dest)
 z.writestr('PORTABLE-EDITING.txt','Extract this project, install Pillow/NumPy/FFmpeg and set AECO_VIDEO_RESOURCES to the included resources directory. Run source/prepare_frames.py to rebuild frames from the included genuine recordings; then source/render.py uses the complete included narration and music. Regenerating narration requires the existing licensed Kokoro weights, not bundled here. MP4 delivered separately in Downloads.\n')
print(OUT/'Agentic-Economy-How-It-Works-120s-Production.zip')
