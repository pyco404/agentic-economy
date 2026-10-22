import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {createMobileGateway} from '../../server/scripts/mobile-verification-gateway.mjs';

test('native invitation form retains exact Origin at folded and unfolded sizes',async()=>{
 const origin='https://mobile-verification.example.test',code='a'.repeat(64);
 const dir=await mkdtemp(join(tmpdir(),'aeco-invitation-browser-'));
 await writeFile(join(dir,'index.html'),'<h1>Private application</h1>');
 const server=createMobileGateway({origin,accessCode:code,gatewayToken:'b'.repeat(64),dist:dir});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome'});
  for(const viewport of [{width:344,height:882},{width:690,height:829}]){
   const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
   let submittedOrigin;
   // Route only transport to loopback; browser still creates the real HTTPS navigation/form headers.
   await context.route(origin+'/**',async route=>{
    const request=route.request(),headers=await request.allHeaders();
    if(request.method()==='POST')submittedOrigin=headers.origin;
    const response=await new Promise((resolve,reject)=>{
     const upstream=http.request({host:'127.0.0.1',port:server.address().port,path:new URL(request.url()).pathname,method:request.method(),headers:{...headers,host:new URL(origin).host}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
     });upstream.on('error',reject);upstream.end(request.postDataBuffer());
    });
    const responseHeaders=Object.fromEntries(Object.entries(response.headers).map(([k,v])=>[k,Array.isArray(v)?v.join('\n'):String(v)]));
    await route.fulfill({status:response.status,headers:responseHeaders,body:response.body});
   });
   const page=await context.newPage();await page.goto(origin+'/launchpad');
   await page.getByLabel('Temporary access code').fill(code);
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   await page.getByRole('heading',{name:'Private application'}).waitFor();
   assert.equal(submittedOrigin,origin);
   const cookie=(await context.cookies()).find(c=>c.name==='__Host-aeco_mobile_gate');
   assert.ok(cookie?.httpOnly&&cookie.secure&&cookie.sameSite==='Strict');
   await context.close();
  }
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
