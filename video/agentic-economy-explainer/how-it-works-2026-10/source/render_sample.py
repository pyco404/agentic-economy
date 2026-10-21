"""15-second approval edit; genuine deployed footage, native 4:5 motion titles/captions."""
import json,math,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
from resources import ROOT,ASSETS
OUT=ROOT/'output';CACHE=ROOT/'cache';W,H,FPS=1080,1350,30
IVORY='#faf5e8';GREEN='#263d31';SAGE='#627857'
fonts={}
def font(size,serif=False):
 key=(size,serif)
 if key not in fonts:fonts[key]=ImageFont.truetype(str(ASSETS/('LibreCaslonDisplay-Regular.ttf' if serif else 'DMSans.ttf')),size)
 return fonts[key]
def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def wrap(text,f,width):
 lines=[];line=''
 for word in text.split():
  trial=(line+' '+word).strip()
  if f.getlength(trial)>width and line:lines.append(line);line=word
  else:line=trial
 return lines+[line]
logo=Image.open(ASSETS/'logo.png').convert('RGBA');logo.thumbnail((54,54),Image.Resampling.LANCZOS)
cues=json.loads((OUT/'sample-cues.json').read_text())
economy=Image.open(CACHE/'economy-current.png').convert('RGB')
def frame(i):
 t=i/FPS;image=Image.new('RGB',(W,H),IVORY).convert('RGBA')
 if t<12:
  city=Image.open(CACHE/'city'/f'{min(i//2,179):05}.jpg').convert('RGB')
  image.paste(city,(0,125))
  veil=Image.new('RGBA',(W,H));vd=ImageDraw.Draw(veil)
  for y in range(H):
   a=255 if y<130 else round(255*(1-smooth((y-130)/330))) if y<460 else round(255*smooth((y-940)/240)) if y>940 else 0
   if a:vd.line((0,y,W,y),fill=(250,245,232,a))
  image=Image.alpha_composite(image,veil)
 else:
  # Actual dashboard; no invented figures, values or receipts.
  plate=ImageOps.contain(economy.crop((0,120,1080,1000)),(952,730),Image.Resampling.LANCZOS)
  image.paste(plate,((W-plate.width)//2,350))
 d=ImageDraw.Draw(image);image.alpha_composite(logo,(64,53))
 d.text((137,57),'Agentic Economy',font=font(31),fill=GREEN)
 d.text((138,101),'A WORLD THAT WORKS',font=font(14),fill=SAGE,spacing=3)
 d.rounded_rectangle((794,61,1016,105),22,fill='#e8edde');d.text((817,71),'LIVE DEMO',font=font(20),fill=GREEN)
 d.text((66,164),'HOW AGENTIC ECONOMY WORKS',font=font(20),fill=SAGE)
 if t<12:
  title=['A city built around','useful work.'];f=font(85,True)
  for k,line in enumerate(title):d.text((61,201+k*86),line,font=f,fill=GREEN)
  # Editorial relation labels; no fabricated activity metrics.
  for n,(word,start) in enumerate([('WORK',3.3),('TOKENS',6.9),('COMMUNITIES',9.2)]):
   a=round(255*smooth((t-start)/.45));layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer);x=64+n*318
   ld.rounded_rectangle((x,976,x+299,1032),16,fill=(250,245,232,a),outline=(179,194,163,a))
   ld.text((x+22,991),word,font=font(23),fill=(38,61,49,a));image=Image.alpha_composite(image,layer)
 else:
  d.text((61,203),'Agents get to work.',font=font(84,True),fill=GREEN)
  d.text((65,307),'RULE-BASED DEMO SIMULATION',font=font(20),fill=SAGE)
 d=ImageDraw.Draw(image)
 for cue in cues:
  if cue['start']<=t<cue['end']:
   opacity=min(smooth((t-cue['start'])/.1),smooth((cue['end']-t)/.1));a=round(255*opacity)
   layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer);lines=wrap(cue['text'],font(37),870);height=len(lines)*51+38;y=1208-height
   ld.rounded_rectangle((64,y,1016,1208),18,fill=(255,250,242,round(a*.99)),outline=(206,217,196,a))
   for n,line in enumerate(lines):ld.text(((W-font(37).getlength(line))/2,y+17+n*51),line,font=font(37),fill=(38,61,49,a))
   image=Image.alpha_composite(image,layer)
 d=ImageDraw.Draw(image);d.line((64,1240,1016,1240),fill='#d3dcc7',width=2);d.line((64,1240,64+952*t/15,1240),fill=SAGE,width=3)
 d.text((64,1270),'staging.useaeco.xyz',font=font(25),fill=GREEN)
 note='PUBLIC DEMO · NO MAINNET EXECUTION';d.text((1016-font(16).getlength(note),1277),note,font=font(16),fill=SAGE)
 return image.convert('RGB')
if __name__=='__main__':
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgb24','-video_size','1080x1350','-framerate','30','-i','pipe:0','-i',str(OUT/'sample-mix.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-threads','4','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-t','15','-movflags','+faststart',str(OUT/'how-agentic-economy-works-15s-review.mp4')]
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 try:
  for i in range(450):
   f=frame(i)
   if i in [240,390]:f.save(OUT/('sample-thumbnail.png' if i==240 else 'economy-proof.png'))
   p.stdin.write(f.tobytes())
   if i%90==0:print(f'Rendered {i}/450 frames',flush=True)
  p.stdin.close()
  if p.wait()!=0:raise RuntimeError('FFmpeg render failed')
 finally:
  if p.poll() is None:p.terminate()
