import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {DraftFields,type SavedLaunchDraft} from '@agentic-economy/shared';
import {LaunchpadStore} from '../src/store/launchpad.js';
import {migrate} from '../src/store/postgres.js';
import {assertDisposableTestDb,newWallet} from './helpers.js';
const url=process.env.TEST_DATABASE_URL;
const approved=!!url&&process.env.LAUNCHPAD_TEST_MIGRATIONS_APPROVED==='true';
(approved?describe:describe.skip)('Postgres launch workspace (explicit disposable-database approval required)',()=>{
 let pool:pg.Pool;const wallet=newWallet().wallet;
 beforeAll(async()=>{assertDisposableTestDb(url!);pool=new pg.Pool({connectionString:url});await migrate(pool);});
 afterAll(async()=>{if(pool){await pool.query('DELETE FROM launchpad_operations WHERE wallet=$1',[wallet]);await pool.query('DELETE FROM launchpad_drafts WHERE wallet=$1',[wallet]);await pool.end();}});
 it('persists across connections, isolates owners and atomically resolves concurrent versions and operation claims',async()=>{
  const at=new Date().toISOString();const draft:SavedLaunchDraft={id:randomUUID(),wallet,version:0,fields:DraftFields.parse({name:'Durable Moss',symbol:'MOSS'}),image:null,metadata:null,createdAt:at,updatedAt:at};
  const store=new LaunchpadStore(pool);await store.create(draft);
  const fresh=new pg.Pool({connectionString:url});try{expect(await new LaunchpadStore(fresh).get(wallet,draft.id)).toEqual(draft);}finally{await fresh.end();}
  await expect(store.get(newWallet().wallet,draft.id)).rejects.toThrow('not found');
  const next={...draft,version:1};const writes=await Promise.allSettled([store.save(next,0),store.save(next,0)]);expect(writes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const key=randomUUID(),claims=await Promise.allSettled([store.claim(wallet,key,'image','hash'),store.claim(wallet,key,'image','hash')]);expect(claims.filter(r=>r.status==='fulfilled')).toHaveLength(1);await store.finish(wallet,key,'image',{receipt:'persisted'});expect(await new LaunchpadStore(pool).claim(wallet,key,'image','hash')).toMatchObject({replayed:true,result:{receipt:'persisted'}});
  await store.remove(wallet,draft.id,1);await expect(store.get(wallet,draft.id)).rejects.toThrow('not found');
 });
 it('preserves verified media and operation receipts through reconnects and allows independent preparations past the former daily quota',async()=>{
  const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
  const asset={cid,ipfsUri:`ipfs://${cid}`,gatewayUrl:`https://gateway.pinata.cloud/ipfs/${cid}`};
  const at=new Date().toISOString();
  const draft:SavedLaunchDraft={id:randomUUID(),wallet,version:0,fields:DraftFields.parse({name:'Durable Fern',symbol:'FERN'}),image:{...asset,uploadId:randomUUID(),status:'verified',mime:'image/png',width:12,height:12},metadata:asset,createdAt:at,updatedAt:at};
  const store=new LaunchpadStore(pool);await store.create(draft);
  // Distinct pool models another API replica; no in-memory cache can satisfy this read.
  const replicaPool=new pg.Pool({connectionString:url});
  try{
   const replica=new LaunchpadStore(replicaPool);
   expect(await replica.get(wallet,draft.id)).toEqual(draft);
   for(let n=0;n<19;n++)await store.claim(wallet,`quota-${n}`,'metadata','same-content');
   const claims=await Promise.allSettled([store.claim(wallet,'quota-final-a','metadata','same-content'),replica.claim(wallet,'quota-final-b','metadata','same-content')]);
   expect(claims.filter(r=>r.status==='fulfilled')).toHaveLength(2);
   const winningKey='quota-final-a';
   await store.finish(wallet,winningKey,'metadata',asset);
   expect(await replica.claim(wallet,winningKey,'metadata','same-content')).toEqual({replayed:true,result:asset});
   await expect(replica.claim(wallet,winningKey,'metadata','different-content')).rejects.toThrow('different content');
   const edited={...draft,version:1,metadata:null,fields:{...draft.fields,name:'Latest Fern'}};
   await replica.save(edited,0);
   expect(await store.get(wallet,draft.id)).toEqual(edited);
  }finally{await replicaPool.end();}
 });
 it('rechecks migration integrity without reapplying approved SQL under concurrent startup',async()=>{
  const replica=new pg.Pool({connectionString:url});
  try{
   expect(await Promise.all([migrate(pool),migrate(replica)])).toEqual([[],[]]);
   const records=(await pool.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
   expect(records.some(r=>r.name==='004_launchpad_workspace.sql')).toBe(true);
   for(const record of records)expect(record.checksum).toMatch(/^[a-f0-9]{64}$/);
  }finally{await replica.end();}
 });
});
