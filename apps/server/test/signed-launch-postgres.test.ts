import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {SignedLaunchStore} from '../src/store/signed-launch.js';
import {newWallet} from './helpers.js';
const url=process.env.TEST_DATABASE_URL;
(url?describe:describe.skip)('signed launch payload persistence (existing isolated schema only)',()=>{
 let pool:pg.Pool;const wallet=newWallet().wallet;
 beforeAll(async()=>{
  if(!url?.includes('aeco_launch_execution_20261018_test'))throw Error('Only the existing approved isolated database is permitted');
  pool=new pg.Pool({connectionString:url});
  expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toBe('aeco_launch_execution_20261018_test');
  expect((await pool.query("SELECT name FROM schema_migrations WHERE name='004_launchpad_workspace.sql'")).rowCount).toBe(1);
 });
 afterAll(async()=>{if(pool){await pool.query("DELETE FROM launchpad_operations WHERE wallet=$1 AND kind='signed_launch'",[wallet]);await pool.end();}});
 it('survives actual process restart, isolates ownership and persists one exact payload under concurrent writes',async()=>{
  const receipt={wallet,launchId:'lch_'+randomUUID().replaceAll('-',''),mint:newWallet().wallet,genesisHash:newWallet().wallet,signature:'2'.repeat(88),transaction:'test-only-exact-payload-'+randomUUID()};
  const store=new SignedLaunchStore(pool);await Promise.all([store.put(receipt),store.put(receipt)]);
  const replicaPool=new pg.Pool({connectionString:url});try{
   const replica=new SignedLaunchStore(replicaPool);expect(await replica.get(wallet,receipt.launchId)).toMatchObject(receipt);
   await expect(replica.put({...receipt,transaction:'changed'})).rejects.toThrow('different signed');
   expect(await replica.get(newWallet().wallet,receipt.launchId)).toBeNull();
  }finally{await replicaPool.end();}
  // New OS process and new PostgreSQL connection; output a hash only, never signed bytes.
  const code=`import pg from 'pg';import{createHash}from'node:crypto';import{SignedLaunchStore}from'./src/store/signed-launch.ts';void(async()=>{const p=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});const r=await new SignedLaunchStore(p).get(process.env.RECOVERY_TEST_WALLET,process.env.RECOVERY_TEST_ID);console.log(createHash('sha256').update(r.transaction).digest('hex'));await p.end();})();`;
  const result=await promisify(execFile)('pnpm',['exec','tsx','--conditions=@agentic-economy/source','--eval',code],{cwd:process.cwd(),env:{...process.env,RECOVERY_TEST_WALLET:wallet,RECOVERY_TEST_ID:receipt.launchId}});
  expect(result.stdout.trim()).toBe(createHash('sha256').update(receipt.transaction).digest('hex'));
  await store.erase(wallet,receipt.launchId);expect((await new SignedLaunchStore(pool).get(wallet,receipt.launchId))!.transaction).toBeUndefined();
 });
});
