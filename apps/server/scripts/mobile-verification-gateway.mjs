/** Temporary private mobile test gateway. Never imported by application/deployment entrypoints. */
import http from 'node:http';
import {Buffer} from 'node:buffer';
import {URLSearchParams} from 'node:url';
import {setTimeout,clearTimeout} from 'node:timers';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,stat,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookieName='__Host-aeco_mobile_gate';
export function createMobileGateway({origin,accessCode,gatewayToken,dist,backendPort=8797,lifetimeMs=30*60_000,now=Date.now}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw Error('An exact HTTPS verification origin is required');
 if(!/^[a-f0-9]{64}$/.test(accessCode)||!/^[a-f0-9]{64}$/.test(gatewayToken))throw Error('Separate 256-bit access and backend gateway secrets required');
 if(!Number.isInteger(backendPort)||backendPort<1024||backendPort>65535)throw Error('Invalid loopback API port');
 const started=now(),session=randomBytes(32).toString('hex');let failures=0,windowEnd=started+60_000;
 const permitted=req=>now()-started<lifetimeMs&&req.headers.host===url.host&&equal((req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1),session);
 // Native form POSTs serialize Origin as null under no-referrer. Preserve the same-origin
 // origin while withholding referrers from other sites; never accept null/missing Origin.
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"};
 const send=(res,status,body)=>{res.writeHead(status,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(body);};
 const forwardHeaders=req=>{
  const h={...req.headers,host:'127.0.0.1:'+backendPort,'x-aeco-verification-gateway':gatewayToken};
  delete h['x-forwarded-for'];delete h['x-forwarded-host'];delete h['x-forwarded-proto'];
  // Remove the gateway credential from backend cookies; preserve only the application's own cookies.
  h.cookie=(h.cookie??'').split(';').filter(s=>!s.trim().startsWith(cookieName+'=')).join(';');return h;
 };
 const server=http.createServer(async(req,res)=>{
  if(now()-started>=lifetimeMs)return send(res,410,'This temporary verification session has ended.');
  if(req.headers.host!==url.host)return send(res,403,'Invalid verification host.');
  if(req.url==='/_verification/access'&&req.method==='POST'){
   if(req.headers.origin!==origin)return send(res,403,'Invalid verification origin.');
   if(now()>windowEnd){failures=0;windowEnd=now()+60_000;}
   if(failures>=10)return send(res,429,'Too many access attempts. Try again in a minute.');
   let body='';try{for await(const part of req){body+=part;if(body.length>512)return send(res,413,'Access form too large.');}}catch{return res.destroy();}
   if(!equal(new URLSearchParams(body).get('code'),accessCode)){failures++;return send(res,403,'Incorrect access code.');}
   res.writeHead(303,{...headers,Location:'/launchpad','Set-Cookie':`${cookieName}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(lifetimeMs/1000)}`});return res.end();
  }
  if(!permitted(req))return send(res,401,'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private Devnet verification</title><style>body{background:#f6efdf;color:#244334;font:16px system-ui;margin:0;padding:24px}main{max-width:440px;margin:12vh auto;background:#fffaf1;padding:28px;border:1px solid #d7ddc8;border-radius:16px}h1{font:32px Georgia}p{line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border-radius:8px;margin-top:12px;border:1px solid #cad4bd}button{background:#486b50;color:#fff}small{display:block;margin-top:20px}</style><main><h1>Private Devnet verification</h1><p>Enter the temporary access code supplied locally. Never enter a wallet recovery phrase.</p><form method="post" action="/_verification/access"><label>Temporary access code <input name="code" type="password" autocomplete="off" required></label><button>Continue</button></form><small>Agentic Economy · Devnet testing only</small></main></html>');
  if(req.url?.startsWith('/api/')||req.url==='/healthz'||req.url==='/readyz'){
   if(!['GET','POST','PATCH','DELETE','OPTIONS'].includes(req.method))return send(res,405,'Unsupported method.');
   const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:forwardHeaders(req)},response=>{res.writeHead(response.statusCode??502,{...response.headers,'Cache-Control':'no-store'});response.pipe(res);});
   upstream.setTimeout(30_000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)send(res,502,'Verification API unavailable.');else res.destroy();});return req.pipe(upstream);
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,'Unsupported method.');
  try{
   const pathname=decodeURIComponent(new URL(req.url,origin).pathname);
   const candidate=resolve(dist,'.'+pathname);if(!candidate.startsWith(resolve(dist)+'/')&&candidate!==resolve(dist))return send(res,404,'Not found.');
   let file=candidate;try{if(!(await stat(file)).isFile())file=join(dist,'index.html');}catch{file=join(dist,'index.html');}
   const data=await readFile(file),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'}[extname(file)]??'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);
  }catch{send(res,404,'Not found.');}
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!permitted(req)||req.headers.origin!==origin||req.url!=='/api/v1/ws')return socket.destroy();
  const expiry=setTimeout(()=>socket.destroy(),Math.max(1,lifetimeMs-(now()-started)));expiry.unref();socket.on('close',()=>clearTimeout(expiry));
  const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,headers:forwardHeaders(req)});
  upstream.setTimeout(10_000,()=>upstream.destroy());upstream.on('response',()=>{upstream.destroy();socket.destroy();});
  upstream.on('upgrade',(response,remote,upstreamHead)=>{
   socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
   if(upstreamHead.length)socket.write(upstreamHead);if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket);
   socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.on('close',()=>remote.destroy());
  });upstream.on('error',()=>socket.destroy());upstream.end();
 });
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const origin=process.env.AECO_MOBILE_ORIGIN,token=process.env.AECO_VERIFICATION_GATEWAY_TOKEN;
 if(!origin||!token)throw Error('Explicit mobile origin and backend gateway token required');
 const code=randomBytes(32).toString('hex'),dir=await mkdtemp(join(tmpdir(),'aeco-mobile-access-'));
 const path=join(dir,'access-code.txt');await writeFile(path,code+'\n',{mode:0o600});
 const server=createMobileGateway({origin,accessCode:code,gatewayToken:token,dist:process.env.AECO_MOBILE_DIST_DIR??resolve(import.meta.dirname,'../../web/dist')});
 server.listen(5190,'127.0.0.1',()=>console.log('Private gateway listening on loopback 5190. Access code is in '+path+'; share it only with your physical test device. Session expires in 30 minutes.'));
 const expiry=setTimeout(()=>{server.close();server.closeAllConnections();},30*60_000);expiry.unref();
}
