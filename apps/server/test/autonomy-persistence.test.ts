import { describe,it,expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store/memory.js';
import { LocalAutonomyCoordinator } from '../src/ops/local-autonomy-store.js';
const exec=promisify(execFile);
describe('local prototype process persistence',()=>{
 it('restores the exact five-agent state, memories, relationships and activity after a separate process restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aeco-autonomy-restart-'));
  const run=async(mode:string)=>{const out=await exec('node',['--import','tsx','--conditions=@agentic-economy/source','test/fixtures/autonomy-process.ts',dir,mode],{timeout:40000,maxBuffer:2_000_000});return JSON.parse(out.stdout.trim().split('\n').at(-1)!);};
  const before=await run('create'),after=await run('recover');expect(before.memories).toBeGreaterThan(0);expect(before.socialEvents).toBeGreaterThan(0);expect(after).toEqual(before);
  const packet=JSON.parse(await readFile(join(dir,'checkpoint.json'),'utf8'));const snapshot=JSON.parse(packet.recovery.snapshot.state);expect(Object.keys(snapshot.autonomy.profiles)).toHaveLength(5);expect(snapshot.society?.enabled??false).toBe(false);
 },90000);
 it('fails closed on corrupted checkpoints rather than resetting identities',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aeco-autonomy-corrupt-'));const file=join(dir,'checkpoint.json');await writeFile(file,JSON.stringify({format:'aeco-local-autonomy-v1',actions:[],events:[],recovery:{snapshot:{state:'{}',hash:'bad',tick:1}}}));
  await expect(new LocalAutonomyCoordinator(new MemoryStore(),file).restore()).rejects.toThrow('hash mismatch');
 });
});
