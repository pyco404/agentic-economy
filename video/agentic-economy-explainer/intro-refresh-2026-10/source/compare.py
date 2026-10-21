"""Editorial old/current comparison; this image is not used as video footage."""
from PIL import Image,ImageDraw,ImageFont,ImageOps
from resources import ROOT,LEGACY,ASSETS
out=Image.new('RGB',(1920,1130),'#faf5e8');d=ImageDraw.Draw(out)
f=ImageFont.truetype(str(ASSETS/'DMSans.ttf'),35)
for x,title,path in [(0,'Original intro — older city',LEGACY/'cache/city/00140.jpg'),(960,'Refreshed intro — current application',ROOT/'cache/current-city-wide.png')]:
 im=ImageOps.contain(Image.open(path).convert('RGB'),(920,950),Image.Resampling.LANCZOS);out.paste(im,(x+(960-im.width)//2,100+(950-im.height)//2));d.text((x+28,35),title,font=f,fill='#263d31')
f=ImageFont.truetype(str(ASSETS/'DMSans.ttf'),23)
d.text((28,1074),'Different capture framing; comparison only. Updated video uses fresh application recordings.',font=f,fill='#52634f')
out.save(ROOT/'output/old-vs-current-city.jpg',quality=94)
