import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMobileGateway} from './mobile-verification-gateway.mjs';
const origin='https://private.example.test',code='a'.repeat(64),gatewayToken='b'.repeat(64);
test('private HTTPS gateway blocks uninvited access and proxies only after origin-bound access',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aeco-gateway-test-'));await writeFile(join(dir,'index.html'),'<h1>Test application</h1>');
 const upstream=http.createServer((req,res)=>res.end(JSON.stringify({path:req.url,secretMatches:req.headers['x-aeco-verification-gateway']===gatewayToken,cookie:req.headers.cookie})));
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');let time=0;
 const server=createMobileGateway({origin,accessCode:code,gatewayToken,dist:dir,backendPort:upstream.address().port,lifetimeMs:1000,now:()=>time});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 const request=(path,headers={},body='')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method:body?'POST':'GET',headers:{host:new URL(origin).host,...headers}},res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));});req.on('error',reject);req.end(body);});
 try{
  const gate=await request('/api/v1/launchpad/capabilities');
  assert.equal(gate.status,401);assert.equal(gate.headers['referrer-policy'],'same-origin');
  for(const origin of [undefined,'null','http://private.example.test','https://private.example.test.attacker.test']){
   assert.equal((await request('/_verification/access',origin===undefined?{}:{origin},'code='+code)).status,403);
  }
  assert.equal((await request('/',{host:'attacker.test'})).status,403);
  assert.equal((await request('/_verification/access',{origin:'https://attacker.test'},'code='+code)).status,403);
  assert.equal((await request('/_verification/access',{origin},'code=wrong')).status,403);
  const login=await request('/_verification/access',{origin},'code='+code);assert.equal(login.status,303);
  const setCookie=login.headers['set-cookie'][0];assert.match(setCookie,/HttpOnly; Secure; SameSite=Strict/);const cookie=setCookie.split(';')[0];
  assert.match((await request('/launchpad',{cookie})).body,/Test application/);
  const proxied=await request('/api/v1/launchpad/capabilities',{cookie,'x-aeco-verification-gateway':'attacker'});assert.equal(proxied.status,200);const received=JSON.parse(proxied.body);assert.equal(received.secretMatches,true);assert.equal(received.cookie,'');
  assert.equal((await request('/_verification/access',{origin},'code='+'x'.repeat(600))).status,413);
  time=1001;assert.equal((await request('/launchpad',{cookie})).status,410);
 }finally{server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();await rm(dir,{recursive:true,force:true});}
});
