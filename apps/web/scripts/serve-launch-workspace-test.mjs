// Isolated CI fixture. Never imported by the app, server entrypoint or deployment.
// Uses real authentication/routes and memory persistence; only Pinata is mocked.
import { loadConfig } from '../../server/dist/config.js';
import { createContext } from '../../server/dist/context.js';
import { buildApp } from '../../server/dist/http/app.js';
import { seedDemo } from '../../server/dist/demo-seed.js';
globalThis.fetch=async(input,options)=>{
 if(String(input)!=='https://uploads.pinata.cloud/v3/files')throw new Error('External network is disabled in this fixture');
 const file=options.body.get('file');await file.arrayBuffer();
 return Response.json({data:{cid:'bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m'}});
};
const config=loadConfig({MODE:'demo',ROLE:'all',HOST:'127.0.0.1',PORT:'8796',AUTH_DOMAIN:'127.0.0.1:5186',AUTH_URI:'http://127.0.0.1:5186',CORS_ORIGINS:'http://127.0.0.1:5186',PINATA_JWT:'isolated-test-only-no-live-pinata',FEE_ROUTING_VERIFIED:'false',LOG_LEVEL:'silent'});
const context=await createContext(config);const app=await buildApp(context);
await app.listen({host:config.host,port:config.port});context.runtime.start();await seedDemo(context);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await context.close();process.exit(0);});
