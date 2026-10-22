"""120-second native compositor: continuous real world, safe title/caption zones."""
from pathlib import Path
import json, math, subprocess
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageOps
from resources import ASSETS
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output';CACHE=ROOT/'cache'
W,H,FPS=1080,1350,30
IVORY=(249,243,230);GREEN=(38,74,54);SAGE=(103,125,91)
scenes=json.loads((ROOT/'source/scenes.json').read_text())
cues=json.loads((OUT/'final-cues.json').read_text())
fonts={}
def font(size,serif=False):
 k=(size,serif)
 if k not in fonts:fonts[k]=ImageFont.truetype(str(ASSETS/('LibreCaslonDisplay-Regular.ttf' if serif else 'DMSans.ttf')),size)
 return fonts[k]
def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def wrap(text,f,width):
 lines=[];line=''
 for word in text.split():
  trial=(line+' '+word).strip()
  if f.getlength(trial)>width and line:lines.append(line);line=word
  else:line=trial
 return lines+[line]
insets={name:Image.open(CACHE/f'{name}-current.png').convert('RGB') for name in ['launchpad','explore','communities','economy','treasury','roadmap']}
verified={name:Image.open(CACHE/f'{name}.png').convert('RGB') for name in ['verified-devnet-review','archived-developer-buy','verified-community-zapper']}
SKIP_MOTION=False
def video_plate(name,at,rect,draw,image):
    if SKIP_MOTION:return
    x,y,w,h=rect
    source=CACHE/name/f'{min(int(max(at,0)*30),599):05}.jpg'
    if source.exists():
        with Image.open(source) as opened:plate=opened.convert('RGB')
    else:raise RuntimeError(f'Missing actual product recording frame: {source}')
    plate=ImageOps.contain(plate,(w,h),Image.Resampling.LANCZOS)
    image.paste(plate,(x+(w-plate.width)//2,y+(h-plate.height)//2))
logo=Image.open(ASSETS/'logo.png').convert('RGBA');logo.thumbnail((54,54),Image.Resampling.LANCZOS)
# Fade only the empty viewport margins: actual full field remains at full opacity.
veil=Image.new('RGBA',(W,H));d=ImageDraw.Draw(veil)
for y in range(H):
 local=y-325
 a=255 if local<0 or local>=760 else round(255*(1-smooth(local/180))) if local<180 else round(255*smooth((local-675)/85)) if local>675 else 0
 if a:d.line((0,y,W,y),fill=(*IVORY,a))
def frame(index,overlay_only=False):
 global SKIP_MOTION
 SKIP_MOTION=overlay_only
 t=index/FPS;scene=next(s for s in scenes if s['start']<=t<s['end'])
 image=Image.new('RGBA',(W,H),(0,0,0,0))
 image.alpha_composite(logo,(72,55));d=ImageDraw.Draw(image)
 d.text((145,58),'Agentic Economy',font=font(30),fill=GREEN)
 d.text((146,102),'A WORLD THAT WORKS',font=font(14),fill=SAGE)
 d.rounded_rectangle((811,65,1008,107),21,fill='#e8eddd',outline='#d4dec8')
 d.text((831,73),'DEMO WORLD',font=font(19),fill=GREEN)
 # The city never fades or cuts: only the editorial layer transitions.
 opacity=min(smooth((t-scene['start']+.15)/.65),smooth((scene['end']-t)/.4))
 layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer);a=round(255*opacity)
 ld.text((76,171),scene['eyebrow'],font=font(19),fill=(*SAGE,a))
 for k,line in enumerate(scene['title'].split('\n')):ld.text((70,213+k*101),line,font=font(87,True),fill=(*GREEN,a))
 # Small editorial panels are in clear space above the actual terrain.
 labels=scene['labels'] if scene['start'] in [0,86] else [];total=sum(font(21).getlength(x)+42 for x in labels)+14*(len(labels)-1);x=(W-total)/2
 for n,label in enumerate(labels):
  width=font(21).getlength(label)+42;la=round(a*smooth((t-scene['start']-1-n*.4)/.7))
  ld.rounded_rectangle((x,493,x+width,540),15,fill=(238,240,222,la),outline=(183,199,168,la))
  ld.text((x+21,505),label,font=font(21),fill=(*GREEN,la));x+=width+14
 if scene['start']==12:
  video_plate('economy-frames' if t<22 else 'actual-agent-frames',t-12 if t<22 else t-22,(76,425,310,190),ld,layer)
  ld.text((412,446),'Wheat → Flour → Bread → Residents',font=font(23),fill=(*GREEN,a))
  ld.text((412,495),'Assignments · deliveries · maintenance',font=font(21),fill=(*GREEN,a))
  ld.text((412,537),'Work receipts & resource markets',font=font(21),fill=(*SAGE,a))
  ld.text((412,579),'Current rule-based simulation',font=font(20),fill=(*SAGE,a))
 if scene['start']==32:
  if t<44:
   video_plate('launchpad-frames',t-32,(76,424,365,195),ld,layer)
  else:
   plate=ImageOps.contain(verified['verified-devnet-review'],(290,155),Image.Resampling.LANCZOS)
   layer.paste(plate,(76,425));ld.text((76,594),'Recorded Devnet verification',font=font(18),fill=(*SAGE,a))
  steps=[('Local artwork preview',32),('Create Coin → IPFS',38),('Review → approve in wallet',43)]
  for n,(text,start) in enumerate(steps):
   color=GREEN if t>=start else SAGE
   ld.text((464,435+n*43),text,font=font(25),fill=(*color,a))
  ld.text((464,574),'TOKEN/SOL · 0.05 SOL platform charge',font=font(21),fill=(*GREEN,a))
  ld.text((464,604),'Optional Developer Buy ≤ 3.5%',font=font(21),fill=(*SAGE,a))
 if scene['start']==52:
  plate=ImageOps.contain(verified['verified-community-zapper'],(150,194),Image.Resampling.LANCZOS)
  layer.paste(plate,(76,425))
  plate=ImageOps.contain(insets['explore'].crop((0,100,1080,900)),(270,194),Image.Resampling.LANCZOS)
  layer.paste(plate,(260,425))
  ld.text((550,435),'Verified launch → token profile',font=font(23),fill=(*GREEN,a))
  ld.text((550,480),'Community → registered HQ',font=font(23),fill=(*GREEN,a))
  ld.text((550,530),'Zappercoin: actual Devnet record',font=font(19),fill=(*SAGE,a))
  ld.text((550,573),'No invented prices or services',font=font(21),fill=(*SAGE,a))
 if scene['start']==70:
  width=800;left=140
  ld.rounded_rectangle((left,435,left+width,481),14,fill=(211,224,195,a))
  ld.rounded_rectangle((left,435,left+width*.6,481),14,fill=(103,125,91,a))
  ld.text((left+17,445),'60% Agent Rewards',font=font(22),fill=(255,250,242,a))
  ld.text((left+width*.6+17,445),'40% Platform',font=font(22),fill=(*GREEN,a))
  ld.text((140,501),'0.05 SOL launch charge → 100% Platform',font=font(25),fill=(*GREEN,a))
  video_plate('treasury-frames',min(t-70,3.9),(140,548,265,86),ld,layer)
  ld.text((435,552),'Allocation ≠ collection ≠ balance',font=font(23),fill=(*GREEN,a))
  ld.text((435,591),'Future agent payouts: not enabled',font=font(21),fill=(*SAGE,a))
 if scene['start']==86:
  ld.text((140,574),'Eligible holdings → activation → economic work',font=font(25),fill=(*GREEN,a))
  ld.text((140,612),'Concept illustration · $AECO utility is planned',font=font(21),fill=(*SAGE,a))
 if scene['start']==102:
  for n,text in enumerate(['Reasoning · research · services','Authorized wallets · payments · launches','Rent by locking $AECO','Identity & launch portfolio persist']):
   ld.text((110,430+n*45),text,font=font(26),fill=(*GREEN,a))
  ld.text((110,617),'Planned rental fee participation · no live execution',font=font(20),fill=(*SAGE,a))
 if scene['start']==114:
  ld.text((76,441),'@useaeco',font=font(27),fill=(*GREEN,a))
 image=Image.alpha_composite(image,layer)
 d=ImageDraw.Draw(image)
 for cue in cues:
  if cue['start']<=t<cue['end']:
   lines=wrap(cue['text'],font(33),884);height=len(lines)*45+34;y=1220-height
   cap=Image.new('RGBA',(W,H));cd=ImageDraw.Draw(cap)
   ca=round(255*min(smooth((t-cue['start'])/.12),smooth((cue['end']-t)/.12)))
   cd.rounded_rectangle((65,y,1015,1220),18,fill=(250,246,236,ca),outline=(208,216,196,ca))
   for n,line in enumerate(lines):cd.text(((W-font(33).getlength(line))/2,y+15+n*45),line,font=font(33),fill=(*GREEN,ca))
   image=Image.alpha_composite(image,cap)
 d=ImageDraw.Draw(image)

 d.text((74,1272),'staging.useaeco.xyz',font=font(25),fill=GREEN)
 note='PUBLIC DEMO · FUTURE FEATURES PLANNED';d.text((1006-font(15).getlength(note),1278),note,font=font(15),fill=SAGE)
 return image
_last_key=None
_last_overlay=None
def composed_frame(index):
 global _last_key,_last_overlay,SKIP_MOTION
 t=index/FPS;scene=next(s for s in scenes if s['start']<=t<s['end'])
 opacity=min(smooth((t-scene['start']+.15)/.65),smooth((scene['end']-t)/.4));a=round(255*opacity)
 current=next(((n,c) for n,c in enumerate(cues) if c['start']<=t<c['end']),(-1,None))
 ca=round(255*min(smooth((t-current[1]['start'])/.12),smooth((current[1]['end']-t)/.12))) if current[1] else 0
 labels=tuple(round(a*smooth((t-scene['start']-1-n*.4)/.7)) for n in range(len(scene['labels'])))
 key=(scene['start'],a,labels,current[0],ca,t>=38,t>=43,t>=44)
 if key!=_last_key:
  _last_overlay=frame(index,overlay_only=True);_last_key=key
 image=Image.new('RGB',(W,H),IVORY)
 with Image.open(CACHE/'frames'/f'{index:05}.jpg') as source:city=source.convert('RGB')
 city=ImageEnhance.Brightness(city).enhance(1.07);city=ImageEnhance.Color(city).enhance(1.06)
 image.paste(city,(0,325));image=Image.alpha_composite(image.convert('RGBA'),veil)
 SKIP_MOTION=False
 if scene['start']==12:video_plate('economy-frames' if t<22 else 'actual-agent-frames',t-12 if t<22 else t-22,(76,425,310,190),None,image)
 if scene['start']==32 and t<44:video_plate('launchpad-frames',t-32,(76,424,365,195),None,image)
 if scene['start']==70:video_plate('treasury-frames',min(t-70,3.9),(140,548,265,86),None,image)
 image=Image.alpha_composite(image,_last_overlay)
 d=ImageDraw.Draw(image);d.line((74,1247,1006,1247),fill='#d6dcc9',width=2);d.line((74,1247,74+932*t/120,1247),fill=SAGE,width=3)
 return image.convert('RGB')

if __name__=='__main__':
 target=OUT/'Agentic-Economy-How-It-Works-120s.mp4'
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgb24','-video_size','1080x1350','-framerate','30','-i','pipe:0','-i',str(OUT/'final-mix.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-threads','4','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-t','120','-movflags','+faststart','-metadata','title=Agentic Economy — How It Works',str(target)]
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 try:
  for i in range(3600):
   picture=composed_frame(i)
   if i in [150,660,1260,1830,2340,2820,3240,3510]:picture.save(OUT/f'verification-frame-{i//30:03}.png')
   if i==150:picture.save(OUT/'thumbnail.png')
   p.stdin.write(picture.tobytes())
   if i%150==0:print(f'Rendered {i}/3600 frames',flush=True)
  p.stdin.close()
  if p.wait()!=0:raise RuntimeError('MP4 export failed')
 finally:
  if p.poll() is None:p.terminate()
 print(target)
