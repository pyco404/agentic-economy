"""Reframe both complete films around visible activity; reuse approved speech/timelines.
Text renders only when it changes. FFmpeg composites genuine continuous footage.
"""
from pathlib import Path
import json,subprocess,sys,hashlib
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];PARENT=ROOT.parent;CACHE=ROOT/'cache';OUT=ROOT/'output'
MODE=sys.argv[1] if len(sys.argv)>1 else 'intro'
ORIGINAL=PARENT/('intro-final-2026-10' if MODE=='intro' else 'explainer-final-2026-10')
NAME='Agentic-Economy-A-World-That-Works-120s-Activity-Revision' if MODE=='intro' else 'Agentic-Economy-How-It-Works-120s-Activity-Revision'
W,H=1080,1350

def ffprobe(path):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
def overlays():
 source=ORIGINAL/'source/render.py';code=source.read_text()
 # Read existing film content as transparent editorial overlays. Original files stay untouched.
 if MODE=='intro':
  a=code.index(" image=Image.new('RGB',(W,H),IVORY)");b=code.index(' image.alpha_composite(logo',a)
  code=code[:a]+" image=Image.new('RGBA',(W,H),(0,0,0,0))\n"+code[b:]
  code=code.replace(" return image.convert('RGB')"," return image")
  code=code.replace('font=font(101,True)','font=font(85,True)').replace('213+k*101','201+k*86')
 else:code=code.replace('font=font(87,True)','font=font(76,True)').replace('213+k*101','201+k*82')
 code=code.replace('font(33)','font(37)').replace('len(lines)*45+34','len(lines)*51+34').replace('n*45),line','n*51),line')
 ns={'__file__':str(source),'__name__':'film_overlay'};exec(compile(code,str(source),'exec'),ns)
 scenes=ns['scenes'];cues=ns['cues'];smooth=ns['smooth'];folder=CACHE/(MODE+'-overlays');folder.mkdir(exist_ok=True)
 entries=[];previous=None;last_png=None;start=0;count=0
 for i in range(3600):
  t=i/30;scene=next(s for s in scenes if s['start']<=t<s['end'])
  # Quantization only affects short editorial fades, never actual footage or speech.
  a=round(15*min(smooth((t-scene['start']+.15)/.65),smooth((scene['end']-t)/.4)))
  current=next(((n,c) for n,c in enumerate(cues) if c['start']<=t<c['end']),(-1,None))
  ca=round(15*min(smooth((t-current[1]['start'])/.12),smooth((current[1]['end']-t)/.12))) if current[1] and MODE!='intro' else 15 if current[1] else 0
  la=tuple(round(a*smooth((t-scene['start']-1-n*.4)/.7)) for n in range(len(scene['labels'])))
  key=(scene['start'],a,la,current[0],ca,t>=38,t>=43,t>=44)
  if key!=previous:
   if last_png is not None:entries.append((last_png,(i-start)/30))
   image=ns['frame'](i) if MODE=='intro' else ns['frame'](i,overlay_only=True)
   # Move product diagrams into upper clear space. Keep the city large beneath them.
   band=image.crop((0,420,W,640));ImageDraw.Draw(image).rectangle((0,420,W,640),fill=(0,0,0,0));image.alpha_composite(band,(0,360))
   if MODE=='explainer' and scene['start'] not in [0,114]:
    backing=Image.new('RGBA',(W,H));bd=ImageDraw.Draw(backing)
    bd.rounded_rectangle((60,355,1020,590),18,fill=(249,243,230,248),outline=(210,220,199,230))
    holes=[]
    if scene['start']==12:holes=[(76,365,386,555)]
    if scene['start']==32 and t<44:holes=[(76,364,441,559)]
    if scene['start']==70:holes=[(140,488,405,574)]
    for hole in holes:bd.rectangle(hole,fill=(0,0,0,0))
    image=Image.alpha_composite(backing,image)
   # Intro label chips also move up, along with the existing product panels.
   png=folder/f'{count:04}.png';image.save(png,compress_level=1);last_png=png;count+=1;start=i;previous=key
  if i%900==0:print(MODE,'prepared editorial frames',i,'/3600',flush=True)
 entries.append((last_png,(3600-start)/30))
 concat=folder/'timeline.ffconcat';concat.write_text('ffconcat version 1.0\n'+''.join(f"file '{p.resolve()}'\noption framerate 30\nduration {duration:.9f}\n" for p,duration in entries)+f"file '{last_png.resolve()}'\noption framerate 30\n")
 (folder/'timeline.json').write_text(json.dumps({'duration':sum(d for _,d in entries),'overlays':len(entries),'source':str(source)},indent=2))
 return concat

def render(concat):
 recording=CACHE/'city-activity-continuous.webm';duration=float(ffprobe(recording)['format']['duration']);start=duration-120
 # Preserve sample framing and proportions. Feather only the viewport margins.
 veil=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(veil)
 smooth=lambda x:max(0,min(1,x))**2*(3-2*max(0,min(1,x)))
 for y in range(H):
  alpha=255 if y<390 else round(255*(1-smooth((y-390)/130))) if y<520 else round(255*smooth((y-1120)/140)) if y>1120 else 0
  if alpha:draw.line((0,y,W,y),fill=(249,243,230,alpha))
 veil.save(CACHE/(MODE+'-sample-style-veil.png'))
 cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-threads','2','-i',str(recording),'-f','concat','-safe','0','-i',str(concat),'-loop','1','-i',str(CACHE/(MODE+'-sample-style-veil.png')),'-i',str(ORIGINAL/'output/final-mix.wav')]
 filters=[f'[0:v]trim=start={start:.6f}:duration=120,setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.08,trim=duration=120,eq=brightness=0.025:saturation=1.06,pad=1080:1350:0:185:color=0xf9f3e6[city]','[city][2:v]overlay=shortest=1[base]']
 base='base'
 if MODE=='explainer':
  for n,(kind,at,length,x,y,w,h) in enumerate([('economy',12,10,76,365,310,190),('actual-agent',22,10,76,365,310,190),('launchpad',32,12,76,364,365,195),('treasury',70,16,140,488,265,86)]):
   file=ORIGINAL/'cache'/f'{kind}-recording.webm';seconds=float(ffprobe(file)['format']['duration']);tail=4 if kind=='treasury' else 20
   cmd+=['-threads','1','-i',str(file)];idx=4+n
   hold=',tpad=stop_mode=clone:stop_duration=12' if kind=='treasury' else ''
   filters.append(f'[{idx}:v]trim=start={max(0,seconds-tail):.6f},setpts=PTS-STARTPTS{hold},scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0xf9f3e6,setpts=PTS+{at}/TB[panel{n}]')
   filters.append(f'[{base}][panel{n}]overlay=x={x}:y={y}:enable=\'gte(t,{at})*lt(t,{at+length})\':eof_action=pass[base{n}]');base=f'base{n}'
 filters+=['[1:v]fps=30,format=rgba[text]',f'[{base}][text]overlay=shortest=1,format=yuv420p[final]']
 target=OUT/(NAME+'.mp4')
 cmd+=['-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','[final]','-map','3:a','-c:v','libx264','-preset','veryfast','-threads','4','-crf','18','-r','30','-fps_mode','cfr','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-t','120','-movflags','+faststart','-progress',str(OUT/(MODE+'-encoding-progress.txt')),str(target)]
 (OUT/(MODE+'-ffmpeg-command.json')).write_text(json.dumps(cmd,indent=2));subprocess.run(cmd,check=True)
 print(target,flush=True)
if __name__=='__main__':
 concat=CACHE/(MODE+'-overlays')/'timeline.ffconcat'
 if '--encode-only' not in sys.argv:concat=overlays()
 if '--prepare-only' not in sys.argv:render(concat)
