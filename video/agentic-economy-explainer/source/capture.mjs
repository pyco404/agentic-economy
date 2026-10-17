import { createServer } from '../../../apps/web/node_modules/vite/dist/node/index.js';
import { chromium } from '../../../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'), base=path.join(root,'video/agentic-economy-explainer');
const server=await createServer({configFile:false,root,resolve:{alias:{three:path.join(root,'apps/web/node_modules/three')}},server:{host:'127.0.0.1',port:5188,strictPort:true}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:720,height:720},deviceScaleFactor:1});
 page.on('pageerror',e=>console.error(e));
 await page.goto('http://127.0.0.1:5188/video/agentic-economy-explainer/source/city.html');
 await page.waitForFunction(()=>window.cityReady,{},{timeout:180000});
 const dir=path.join(base,'cache/city');await mkdir(dir,{recursive:true});
 const fps=15,frames=process.env.PREVIEW_ONLY?1:225;let metrics;
 for(let i=0;i<frames;i++){
  const result=await page.evaluate(t=>({metrics:window.renderCity(t),image:document.querySelector('canvas').toDataURL('image/jpeg',.94).split(',')[1]}),i/fps);
  metrics=result.metrics; const file=path.join(dir,`${String(i).padStart(5,'0')}.jpg`);
  await writeFile(`${file}.partial`,Buffer.from(result.image,'base64'));await rename(`${file}.partial`,file);
  if(i%30===0)console.log(`City frames ${i}/${frames}`,metrics);
 }
 await writeFile(path.join(base,'cache/capture.json'),JSON.stringify({fps,frames,metrics,source:'Read-only local demo snapshot; real procedural generators; visual ambient animation only.'},null,2));
}finally{await browser.close();await server.close();}
