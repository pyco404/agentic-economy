import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { PinataPinning } from '../src/services/launchpad.js';

const credential='test-only-server-secret';
const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
const pinning=()=>new PinataPinning(loadConfig({PINATA_JWT:credential,IPFS_GATEWAY:'https://gateway.pinata.cloud'}).pinata);
afterEach(()=>vi.unstubAllGlobals());
describe('Pinata HTTP transport (mock provider, not a real upload)',()=>{
 it.each(['image/png','image/jpeg','image/webp','application/json'])('pins %s explicitly to public IPFS with a server-only bearer credential',async mime=>{
  const fetch=vi.fn(async()=>Response.json({data:{cid}}));vi.stubGlobal('fetch',fetch);
  const bytes=new TextEncoder().encode(mime==='application/json'?'{"name":"Moss"}':'decoded-image');
  const receipt=await pinning().pin(bytes,mime,'token-asset');
  const [url,request]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://uploads.pinata.cloud/v3/files');
  expect(request.method).toBe('POST');expect(request.headers).toEqual({Authorization:`Bearer ${credential}`});
  expect(request.signal).toBeInstanceOf(AbortSignal);
  const form=request.body as FormData,file=form.get('file') as File;
  expect(form.get('network')).toBe('public');expect(form.get('name')).toBe('token-asset');
  expect(file.type).toBe(mime);expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  expect(receipt).toEqual({cid,ipfsUri:`ipfs://${cid}`,gatewayUrl:`https://gateway.pinata.cloud/ipfs/${cid}`});
  expect(JSON.stringify(receipt)).not.toContain(credential);
 });
 it('does not make an external request without credentials',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(new PinataPinning(loadConfig({}).pinata).pin(new Uint8Array([1]),'image/png','logo')).rejects.toThrow('not configured');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('sanitizes provider failures and permits a subsequent retry',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new Error(credential)).mockResolvedValueOnce(Response.json({error:credential},{status:401})).mockResolvedValueOnce(Response.json({data:{cid}}));
  vi.stubGlobal('fetch',fetch);const service=pinning();
  for(const message of ['interrupted or timed out','could not accept']){
   const failure=await service.pin(new Uint8Array([1]),'image/png','logo').catch(e=>e as Error);
   expect(failure).toBeInstanceOf(Error);expect((failure as Error).message).toContain(message);expect((failure as Error).message).not.toContain(credential);
  }
  expect((await service.pin(new Uint8Array([1]),'image/png','logo')).cid).toBe(cid);
 });
 it.each([{}, {data:{}}, {data:{cid:'not-an-ipfs-cid'}}, {data:{cid:`${credential}/../../bad`}}])('rejects malformed receipts instead of marking assets verified: %j',async body=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(body)));
  await expect(pinning().pin(new Uint8Array([1]),'image/png','logo')).rejects.toThrow('invalid upload receipt');
 });
});
