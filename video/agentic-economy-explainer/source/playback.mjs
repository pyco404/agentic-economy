/* global document, setTimeout */
/** Browser decoding/playback check for the actual MP4, including a middle-frame seek. */
import http from 'node:http';
import { stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { chromium } from '../../../apps/web/node_modules/@playwright/test/index.mjs';
const file=new URL('../output/agentic-economy-15s-review.mp4',import.meta.url), size=(await stat(file)).size;
const server=http.createServer((req,res)=>{
 if(req.url!=='/sample.mp4'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<video controls playsinline src="/sample.mp4" style="max-height:95vh"></video>');return;}
 const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
 const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
 res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});createReadStream(file,{start,end}).pipe(res);
});await new Promise(resolve=>server.listen(5190,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5190/');
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const result=await page.locator('video').evaluate(async video=>{
  video.muted=true;await video.play();await new Promise(resolve=>setTimeout(resolve,800));
  const playing=video.currentTime>0&&!video.paused;video.pause();
  for(const time of [7,14]){const seek=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));video.currentTime=time;await seek;}
  return {playing,duration:video.duration,width:video.videoWidth,height:video.videoHeight,lastSeek:video.currentTime,decodedFrames:video.getVideoPlaybackQuality().totalVideoFrames,error:video.error?.message??null};
 });
 if(!result.playing||result.duration!==15||result.width!==1080||result.height!==1350||result.error)throw new Error(JSON.stringify(result));
 await writeFile(new URL('../output/browser-playback.json',import.meta.url),JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();server.close();}
