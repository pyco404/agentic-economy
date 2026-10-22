"""Verify both complete revisions and the visible improvement over distant framing."""
from pathlib import Path
import json,subprocess,hashlib
from PIL import Image,ImageChops,ImageDraw
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output';CACHE=ROOT/'cache';PARENT=ROOT.parent
NAMES={'intro':'Agentic-Economy-A-World-That-Works-120s-Activity-Revision','explainer':'Agentic-Economy-How-It-Works-120s-Activity-Revision'}
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def extract(p,at,target):
 subprocess.run(['ffmpeg','-y','-v','error','-ss',str(at),'-i',str(p),'-frames:v','1',str(target)],check=True)
 return Image.open(target).convert('RGB')
def green_pixels(im):
 return sum(1 for r,g,b in im.crop((0,500,1080,1080)).getdata() if g>r+2 and g>b+12 and r<225)
capture=json.loads((CACHE/'capture-evidence.json').read_text());assert capture['errors']==[]
assert capture['initial']['worldState']==capture['final']['worldState']=='FULLY_ACTIVE'
assert capture['initial']['geometryBuilds']==capture['final']['geometryBuilds']
assert capture['initial']['railway'] and capture['initial']['mirroredRailway']
assert not capture['health']['financialFeaturesEnabled'] and capture['health']['store']=='memory'
result={'capture':{'seconds':capture['recordedSeconds'],'geometryBuilds':capture['final']['geometryBuilds'],'errors':capture['errors'],'camera':capture['shots']},'films':{}}
for mode,name in NAMES.items():
 p=OUT/(name+'.mp4');d=probe(p);v=next(s for s in d['streams'] if s['codec_type']=='video');a=next(s for s in d['streams'] if s['codec_type']=='audio')
 assert float(d['format']['duration'])==120,(mode,d['format']['duration'])
 assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_frames']))==(1080,1350,'30/1',3600),(mode,v)
 assert a['codec_name']=='aac' and a['channels']==2
 subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True)
 film_dir=PARENT/('intro-final-2026-10' if mode=='intro' else 'explainer-final-2026-10')
 cues=json.loads((film_dir/'output/final-cues.json').read_text());assert all(0<=c['start']<c['end']<=120.00001 for c in cues)
 previews=[]
 for sec in [5,25,50,75,95,115]:
  image=extract(p,sec,OUT/f'{mode}-{sec:03}.png');previews.append(image)
  if sec==5:image.save(OUT/(mode+'-thumbnail.png'))
 oldname='Agentic-Economy-A-World-That-Works-120s' if mode=='intro' else 'Agentic-Economy-How-It-Works-120s'
 old=extract(film_dir/'output'/(oldname+'.mp4'),5,OUT/(mode+'-previous-distant-framing.png'))
 old_area=green_pixels(old);new_area=green_pixels(previews[0]);ratio=new_area/max(1,old_area)
 assert ratio>1.4,(mode,ratio)
 comparison=Image.new('RGB',(1080,710),'#f9f3e6');draw=ImageDraw.Draw(comparison)
 for n,(image,label) in enumerate([(old,'Previous distant framing'),(previews[0],'Revised sample framing')]):
  image=image.copy();image.thumbnail((530,663));comparison.paste(image,(n*540,30));draw.text((n*540+10,10),label,fill='#264a36')
 comparison.save(OUT/(mode+'-before-after.jpg'),quality=92)
 result['films'][mode]={'duration':120,'frames':3600,'size':[1080,1350],'fps':30,'subtitleCues':len(cues),'oldGreenArea':old_area,'newGreenArea':new_area,'greenAreaRatio':ratio,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'audioSourceSha256':hashlib.sha256((film_dir/'output/final-mix.wav').read_bytes()).hexdigest()}
 print(mode,'verified; visible green city area increased',round(ratio,2),'times',flush=True)
# Verify actual animation with a stationary camera, independently of text/camera motion.
recording=CACHE/'city-activity-continuous.webm';start=float(probe(recording)['format']['duration'])-120
motion=[]
for left,right in [(5,10),(25,30),(75,80)]:
 a=extract(recording,start+left,CACHE/f'motion-{left}.png');b=extract(recording,start+right,CACHE/f'motion-{right}.png')
 diff=ImageChops.difference(a,b).convert('L');hist=diff.histogram();changed=sum(hist[10:]);assert changed>50,(left,changed);motion.append({'seconds':[left,right],'changedPixels':changed})
result['stationaryCameraMotion']=motion
(OUT/'verification.json').write_text(json.dumps(result,indent=2));print('All video, framing and activity checks passed.')
