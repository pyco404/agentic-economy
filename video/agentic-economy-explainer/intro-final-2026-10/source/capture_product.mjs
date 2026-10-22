import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../cache',import.meta.url));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
try{const page=await browser.newPage({viewport:{width:1080,height:900}});for(const route of ['launchpad','explore','communities']){await page.goto('http://127.0.0.1:5173/'+route+'?source=backend',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-testid="city-canvas"]')?.dataset.worldState==='FULLY_ACTIVE',null,{timeout:180000});await page.screenshot({path:`${root}/${route}-current.png`});console.log(route);}}finally{await browser.close();}
