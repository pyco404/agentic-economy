import {constants,closeSync,fsyncSync,lstatSync,openSync,writeFileSync}from'node:fs';
import {dirname,resolve}from'node:path';
import pg from'pg';
import {loadConfig}from'../src/config.js';
import {alignWorld,WORLD_ALIGNMENT_PLAN,WORLD_ALIGNMENT_PLAN_SHA}from'../src/ops/world-alignment.js';

// Operator-only, never application startup. Defaults to a public plan without opening a database.
const args=process.argv.slice(2);
if(args.length===0){console.log(JSON.stringify({plan:WORLD_ALIGNMENT_PLAN,sha256:WORLD_ALIGNMENT_PLAN_SHA},null,2));}
else{
 let pool:pg.Pool|undefined;
 try{
  const apply=args[0]==='--apply';if(!apply&&args[0]!=='--check')throw Error('Expected check or apply');
  const opts=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){const k=args[i]!,v=args[i+1];if(!['--approved-plan-sha256','--checkpoint'].includes(k)||!v||opts.has(k))throw Error('Invalid arguments');opts.set(k,v);}
  const cfg=loadConfig();
  if(cfg.mode!=='production'||!cfg.databaseUrl||cfg.financialFeaturesEnabled||cfg.pumpLaunch.enabled||cfg.pumpLaunch.mainnetApproved||cfg.aecoCommonAgents.enabled)
    throw Error('Production read-only financial policy is required');
  pool=new pg.Pool({connectionString:cfg.databaseUrl});
  const result=await alignWorld(pool,{database:'aeco_production',apply,approvedPlanSha:opts.get('--approved-plan-sha256'),checkpoint:apply?async data=>{
   const path=resolve(opts.get('--checkpoint')??'');if(!opts.has('--checkpoint'))throw Error('Private checkpoint required');
   const parent=lstatSync(dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0||parent.uid!==process.getuid?.())throw Error('Private operator directory required');
   const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{writeFileSync(fd,JSON.stringify(data)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   const directory=openSync(dirname(path),constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
  }:undefined});
  console.log(JSON.stringify(result));
 }catch{console.error('World alignment stopped. No credentials are printed. Verify approval hash, financial-off policy, stopped writer, database identity and private checkpoint; do not reset protected data.');process.exitCode=1;}
 finally{await pool?.end();}
}
