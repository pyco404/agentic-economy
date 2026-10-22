"""Fail export acceptance on wrong duration, framing, missing frames or silent narration."""
from pathlib import Path
import json,subprocess,wave,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output';CACHE=ROOT/'cache'
p=OUT/'Agentic-Economy-How-It-Works-120s.mp4'
def probe(path):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
d=probe(p);v=next(s for s in d['streams'] if s['codec_type']=='video');a=next(s for s in d['streams'] if s['codec_type']=='audio')
assert float(d['format']['duration'])==120
assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_frames']))==(1080,1350,'30/1',3600)
assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p' and a['codec_name']=='aac'
assert float(v['duration'])==120
capture=json.loads((CACHE/'capture-evidence.json').read_text());assert capture['errors']==[]
assert capture['initial']['geometryBuilds']==capture['final']['geometryBuilds']
assert capture['initial']['worldState']==capture['final']['worldState']=='FULLY_ACTIVE'
assert capture['initial']['railway'] and capture['initial']['mirroredRailway']
assert all(abs(x)<=.900001 and abs(y)<=.900001 for x,y,z in capture['fit']['projected'])
assert all(int(b['frame'])>int(a['frame']) and float(b['rail'])>float(a['rail']) for a,b in zip(capture['snapshots'],capture['snapshots'][1:]))
product=json.loads((CACHE/'product-evidence.json').read_text());assert product['requestsBlocked']==[]
agent=json.loads((CACHE/'actual-agent-evidence.json').read_text());assert agent['agent']['distance']>.05
frames=list((CACHE/'frames').glob('*.jpg'));assert len(frames)==3600
# Same camera, continuous city motion: independent samples across the full 120s.
measurements=[];last=None;hashes=[]
for second in range(0,120,5):
 path=CACHE/'frames'/f'{second*30:05}.jpg';arr=np.asarray(Image.open(path).convert('RGB').crop((160,300,1020,660)),dtype=float)
 hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
 if last is not None:
  diff=np.abs(arr-last);changed=int(np.count_nonzero(diff.max(axis=2)>8));assert changed>20,(second,changed)
  measurements.append({'second':second,'changedCityPixels':changed,'meanAbsoluteDifference':float(diff.mean())})
 last=arr
assert len(hashes)==len(set(hashes))
cues=json.loads((OUT/'final-cues.json').read_text());assert len(cues)>=20
assert all(0<=c['start']<c['end']<=120 for c in cues)
assert all(a['end']<=b['start'] for a,b in zip(cues,cues[1:]))
with wave.open(str(OUT/'final-narration.wav')) as w:
 assert w.getnframes()/w.getframerate()==120
 narration=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2')/32768
 assert np.max(np.abs(narration))<.99 and np.sqrt(np.mean(narration**2))>.02
with wave.open(str(OUT/'final-original-score.wav')) as w:
 assert w.getnframes()/w.getframerate()==120 and w.getnchannels()==2
 music=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2')/32768
 assert np.sqrt(np.mean(music**2))>.001
subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True)
result={'sourceRecordingSha256':hashlib.sha256((CACHE/'full-field-continuous.webm').read_bytes()).hexdigest(),'productCaptureMutations':product['requestsBlocked'],'actualObservedAgent':agent['agent'],'video':v,'audio':a,'duration':d['format']['duration'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source':'Continuous actual current local Three.js world; no repeated 15s loops.','sourceRecordingFrameRate':'25fps browser capture conformed to constant 30fps output; actual app frame rate varies.','framing':capture['fit'],'sceneBuildsStable':capture['initial']['geometryBuilds'],'motionChecks':measurements,'subtitleCues':len(cues),'domain':{'useaeco.xyz':'404 DEPLOYMENT_NOT_FOUND at export check','staging.useaeco.xyz':'HTTPS 200; used for CTA'},'limits':'No unseen reference image was assumed. Genuine current UI and labeled historical Devnet captures are used. No new wallet action was filmed; local anonymous preview only.'}
(OUT/'verification.json').write_text(json.dumps(result,indent=2));print(json.dumps({'duration':120,'size':[1080,1350],'fps':30,'frames':3600,'motionSamples':len(measurements),'cues':len(cues),'sha256':result['sha256']},indent=2))
