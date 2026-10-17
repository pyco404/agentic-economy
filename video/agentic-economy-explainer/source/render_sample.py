"""Native 1080×1350 motion typography over genuine animated Three.js city frames."""
from pathlib import Path
import json, math, subprocess, time
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output';ASSETS=ROOT/'assets'
W,H,FPS=1080,1350,30
IVORY=(249,243,230);GREEN=(38,74,54);SAGE=(103,125,91);MUTED=(104,113,96)
fonts={}
def font(size,serif=False):
    key=(size,serif)
    if key not in fonts: fonts[key]=ImageFont.truetype(str(ASSETS/('LibreCaslonDisplay-Regular.ttf' if serif else 'DMSans.ttf')),size)
    return fonts[key]
logo=Image.open(ASSETS/'logo.png').convert('RGBA');logo.thumbnail((54,54),Image.Resampling.LANCZOS)
cues=json.loads((OUT/'sample-cues.json').read_text())

def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)
def wrap(text,f,max_width):
    lines=[];line=''
    for word in text.split():
        trial=(line+' '+word).strip()
        if f.getlength(trial)>max_width and line:lines.append(line);line=word
        else:line=trial
    return lines+[line]
def spaced(draw,pos,text,f,fill,gap=3):
    x,y=pos
    for letter in text:
        draw.text((x,y),letter,font=f,fill=fill);x+=f.getlength(letter)+gap

def frame(index):
    t=index/FPS
    image=Image.new('RGB',(W,H),IVORY)
    source=ROOT/'cache/city'/f'{index//2:05}.jpg'
    deadline=time.monotonic()+180
    while True:
        try:
            with Image.open(source) as opened: city=opened.convert('RGB')
            break
        except (OSError, FileNotFoundError):
            if time.monotonic()>deadline: raise RuntimeError(f'City capture missing or incomplete: {source}')
            time.sleep(.15)
    # Gentle film grade only; scene materials and the live website are untouched.
    city=ImageEnhance.Brightness(city).enhance(1.07)
    city=ImageEnhance.Color(city).enhance(1.06)
    city=city.resize((1080,1080),Image.Resampling.LANCZOS)
    image.paste(city,(0,185))
    # Feather the city into the same ivory used by the actual site/header.
    fade=Image.new('RGBA',(W,H),(0,0,0,0));fd=ImageDraw.Draw(fade)
    for y in range(H):
        alpha=255 if y<185 else round(255*(1-smooth((y-185)/240))) if y<425 else round(255*smooth((y-990)/270)) if y>990 else 0
        if alpha:fd.line((0,y,W,y),fill=(*IVORY,alpha))
    image=Image.alpha_composite(image.convert('RGBA'),fade)
    draw=ImageDraw.Draw(image)
    image.alpha_composite(logo,(72,55));draw.text((145,58),'Agentic Economy',font=font(30),fill=GREEN)
    spaced(draw,(146,101),'A WORLD THAT WORKS',font(13),MUTED,2.4)
    draw.rounded_rectangle((797,65,1008,107),21,fill='#e8eddd',outline='#d4dec8')
    draw.ellipse((814,82,823,91),fill='#64875f');draw.text((836,73),'DEMO CITY',font=font(20),fill=GREEN)
    # Restrained editorial title transition into the second scene.
    transition=smooth((t-11.7)/.6)
    for title,eyebrow,opacity,shift in [('A world\nthat works.','INTELLIGENCE, MADE VISIBLE',1-transition,0),('One living\neconomy.','WELCOME TO AGENTIC ECONOMY',transition,12*(1-transition))]:
        layer=Image.new('RGBA',(W,H),(0,0,0,0));ld=ImageDraw.Draw(layer)
        intro=smooth((t+.25)/1.1);alpha=round(255*opacity*intro)
        spaced(ld,(76,174+shift),eyebrow,font(17),(*SAGE,alpha),2.8)
        for n,line in enumerate(title.split('\n')):ld.text((70,218+n*97+shift+10*(1-intro)),line,font=font(104,True),fill=(*GREEN,alpha))
        image=Image.alpha_composite(image,layer)
    draw=ImageDraw.Draw(image)
    # These are labels for the concept, never fabricated economic counts.
    labels=[('AI AGENTS',74,3.2),('USEFUL WORK',338,5.8),('SHARED WORLD',642,8.4)]
    for text,x,at in labels:
        alpha=round(245*smooth((t-at)/.65));layer=Image.new('RGBA',(W,H),(0,0,0,0));ld=ImageDraw.Draw(layer)
        width=round(font(22).getlength(text))+58
        ld.rounded_rectangle((x,970,x+width,1025),16,fill=(*IVORY,alpha),outline=(*SAGE,alpha))
        ld.text((x+29,983),text,font=font(22),fill=(*GREEN,alpha));image=Image.alpha_composite(image,layer)
    # Exact cue boundaries come from actual generated speech durations.
    for cue in cues:
        if cue['start']<=t<=cue['end']:
            layer=Image.new('RGBA',(W,H),(0,0,0,0));ld=ImageDraw.Draw(layer)
            opacity=min(smooth((t-cue['start'])/.12),smooth((cue['end']-t)/.12));alpha=round(255*opacity)
            lines=wrap(cue['text'],font(37),880);height=len(lines)*51+42;y=1196-height
            ld.rounded_rectangle((65,y,1015,1208),22,fill=(250,246,236,round(alpha*.97)),outline=(208,216,196,alpha),width=1)
            for i,line in enumerate(lines):ld.text(((W-font(37).getlength(line))/2,y+20+i*51),line,font=font(37),fill=(*GREEN,alpha))
            image=Image.alpha_composite(image,layer)
    draw=ImageDraw.Draw(image)
    draw.line((74,1247,1006,1247),fill='#d6dcc9',width=2)
    draw.line((74,1247,74+932*min(t/15,1),1247),fill='#69876a',width=3)
    draw.text((74,1272),'useaeco.xyz',font=font(25),fill=GREEN)
    text='LIVING DEMO · FUTURE FEATURES PLANNED';draw.text((1006-font(16).getlength(text),1278),text,font=font(16),fill=MUTED)
    return image.convert('RGB')

if __name__=='__main__':
    cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(OUT/'sample-mix.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-threads','4','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-t','15','-movflags','+faststart',str(OUT/'agentic-economy-15s-review.mp4')]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(450):
            picture=frame(i)
            if i==285:picture.save(OUT/'sample-poster.png')
            process.stdin.write(picture.tobytes())
            if i%60==0:print(f'Composed {i}/450 frames',flush=True)
        process.stdin.close()
        if process.wait()!=0:raise RuntimeError('FFmpeg export failed')
    finally:
        if process.poll() is None:process.terminate()
