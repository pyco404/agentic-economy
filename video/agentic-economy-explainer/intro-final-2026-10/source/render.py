"""120-second native compositor: continuous real world, safe title/caption zones."""
from pathlib import Path
import json, math, subprocess
from PIL import Image,ImageDraw,ImageFont,ImageEnhance
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
insets={name:Image.open(CACHE/f'{name}-current.png').convert('RGB') for name in ['launchpad','explore','communities']}
logo=Image.open(ASSETS/'logo.png').convert('RGBA');logo.thumbnail((54,54),Image.Resampling.LANCZOS)
# Fade only the empty viewport margins: actual full field remains at full opacity.
veil=Image.new('RGBA',(W,H));d=ImageDraw.Draw(veil)
for y in range(H):
 local=y-325
 a=255 if local<0 or local>=760 else round(255*(1-smooth(local/180))) if local<180 else round(255*smooth((local-675)/85)) if local>675 else 0
 if a:d.line((0,y,W,y),fill=(*IVORY,a))
def frame(index):
 t=index/FPS;scene=next(s for s in scenes if s['start']<=t<s['end'])
 image=Image.new('RGB',(W,H),IVORY)
 with Image.open(CACHE/'frames'/f'{index:05}.jpg') as source:city=source.convert('RGB')
 city=ImageEnhance.Brightness(city).enhance(1.07);city=ImageEnhance.Color(city).enhance(1.06)
 image.paste(city,(0,325));image=Image.alpha_composite(image.convert('RGBA'),veil)
 image.alpha_composite(logo,(72,55));d=ImageDraw.Draw(image)
 d.text((145,58),'Agentic Economy',font=font(30),fill=GREEN)
 d.text((146,102),'A WORLD THAT WORKS',font=font(14),fill=SAGE)
 d.rounded_rectangle((811,65,1008,107),21,fill='#e8eddd',outline='#d4dec8')
 d.text((831,73),'DEMO WORLD',font=font(19),fill=GREEN)
 # The city never fades or cuts: only the editorial layer transitions.
 opacity=min(smooth((t-scene['start']+.15)/.65),smooth((scene['end']-t)/.4))
 layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer);a=round(255*opacity)
 ld.text((76,171),scene['eyebrow'],font=font(19),fill=(*SAGE,a))
 for k,line in enumerate(scene['title'].split('\n')):ld.text((70,213+k*101),line,font=font(101,True),fill=(*GREEN,a))
 # Small editorial panels are in clear space above the actual terrain.
 labels=[] if scene['start']==45 else scene['labels'];total=sum(font(21).getlength(x)+42 for x in labels)+14*(len(labels)-1);x=(W-total)/2
 for n,label in enumerate(labels):
  width=font(21).getlength(label)+42;la=round(a*smooth((t-scene['start']-1-n*.4)/.7))
  ld.rounded_rectangle((x,493,x+width,540),15,fill=(238,240,222,la),outline=(183,199,168,la))
  ld.text((x+21,505),label,font=font(21),fill=(*GREEN,la));x+=width+14
 if scene['start']==45:
  for n,(name,label) in enumerate([('launchpad','Create Coin'),('explore','Explore'),('communities','Communities')]):
   x=76+n*316
   ld.rounded_rectangle((x,440,x+296,617),14,fill=(250,246,236,a),outline=(183,199,168,a))
   plate=insets[name].crop((0,105,1080,800));plate.thumbnail((280,139),Image.Resampling.LANCZOS)
   layer.paste(plate,(int(x+8),448))
   ld.text((x+16,589),label,font=font(20),fill=(*GREEN,a))
 if scene['start']==108:

  ld.text((76,430),'@useaeco',font=font(27),fill=(*GREEN,a))
 image=Image.alpha_composite(image,layer)
 d=ImageDraw.Draw(image)
 for cue in cues:
  if cue['start']<=t<cue['end']:
   lines=wrap(cue['text'],font(33),884);height=len(lines)*45+34;y=1220-height
   d.rounded_rectangle((65,y,1015,1220),18,fill=(250,246,236),outline=(208,216,196))
   for n,line in enumerate(lines):d.text(((W-font(33).getlength(line))/2,y+15+n*45),line,font=font(33),fill=GREEN)
 d.line((74,1247,1006,1247),fill='#d6dcc9',width=2);d.line((74,1247,74+932*t/120,1247),fill=SAGE,width=3)
 d.text((74,1272),'staging.useaeco.xyz',font=font(25),fill=GREEN)
 note='PUBLIC DEMO · FUTURE FEATURES PLANNED';d.text((1006-font(15).getlength(note),1278),note,font=font(15),fill=SAGE)
 return image.convert('RGB')
if __name__=='__main__':
 target=OUT/'Agentic-Economy-A-World-That-Works-120s.mp4'
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgb24','-video_size','1080x1350','-framerate','30','-i','pipe:0','-i',str(OUT/'final-mix.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-threads','4','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-t','120','-movflags','+faststart','-metadata','title=Agentic Economy — A World That Works',str(target)]
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 try:
  for i in range(3600):
   picture=frame(i)
   if i in [150,750,1500,2250,2970,3420]:picture.save(OUT/f'verification-frame-{i//30:03}.png')
   if i==150:picture.save(OUT/'thumbnail.png')
   p.stdin.write(picture.tobytes())
   if i%150==0:print(f'Rendered {i}/3600 frames',flush=True)
  p.stdin.close()
  if p.wait()!=0:raise RuntimeError('MP4 export failed')
 finally:
  if p.poll() is None:p.terminate()
 print(target)
