import { describe, expect, it, vi } from 'vitest';
import { DraftFields, SavedLaunchDraft } from './shared';
import { prepareLaunchDraft, type PreparationPort } from './prepareLaunchDraft';
const fields = DraftFields.parse({name:'Moss',symbol:'MOSS'});
const asset = {cid:'bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra',ipfsUri:'ipfs://bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra',gatewayUrl:'https://example.com/logo.png'};
const image = {...asset,uploadId:'logo-1',status:'verified' as const,mime:'image/png' as const,width:12,height:12};
const draft = SavedLaunchDraft.parse({id:'efbccb97-e770-465b-8826-a60998f29ca1',wallet:'11111111111111111111111111111111',version:0,fields,image:null,metadata:null,createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'});
const file = new File(['test'],'logo.png');
function fixture() {
 const calls:string[]=[];
 const port:PreparationPort={check:vi.fn(),stage:vi.fn(),accept:vi.fn(),uploaded:vi.fn(),
  save:vi.fn(async(f,d)=>{calls.push('save');return {...(d??draft),fields:f,metadata:null,version:(d?.version??-1)+1};}),
  removeImage:vi.fn(async d=>{calls.push('remove');return {...d,image:null,metadata:null,version:d.version+1};}),
  upload:vi.fn(async d=>{calls.push('upload');return {...d,image,metadata:null,version:d.version+1};}),
  metadata:vi.fn(async d=>{calls.push('metadata');return {...d,metadata:asset,version:d.version+1};}),
  review:vi.fn(async d=>{calls.push('review');return {draft:d,readyForNextMilestone:true,issues:[],fieldIssues:[],launchEnabled:false as const,launchChargeSol:'0.05' as const};}),
 };
 return {port,calls,input:{fields,draft:null as SavedLaunchDraft|null,file:file as File|null,removeImage:false,uploads:true}};
}
describe('one-action token preparation',()=>{
 it('saves, uploads and prepares the latest version before review, without launch APIs',async()=>{
  const {input,port,calls}=fixture();const result=await prepareLaunchDraft(input,port);
  expect(calls).toEqual(['save','upload','metadata','review']);expect(result.review?.draft.version).toBe(2);
  expect(port.uploaded).toHaveBeenCalledOnce();expect(result.review?.launchEnabled).toBe(false);
 });
 it('saves safely when uploads are unavailable, preserving the selected file for retry',async()=>{
  const {input,port,calls}=fixture();const result=await prepareLaunchDraft({...input,uploads:false},port);
  expect(calls).toEqual(['save']);expect(result.review).toBeNull();expect(result.notice).toContain('temporarily unavailable');expect(port.uploaded).not.toHaveBeenCalled();
 });
 it('resumes after a failed upload without recreating the saved draft',async()=>{
  const {input,port,calls}=fixture();let saved:SavedLaunchDraft|null=null;port.accept=d=>{saved=d;};
  vi.mocked(port.upload).mockRejectedValueOnce(new Error('Upload interrupted'));
  await expect(prepareLaunchDraft(input,port)).rejects.toThrow('Upload interrupted');
  await prepareLaunchDraft({...input,draft:saved},port);expect(calls).toEqual(['save','upload','metadata','review']);expect(port.save).toHaveBeenCalledOnce();
 });
 it('retries metadata without reuploading an accepted logo',async()=>{
  const {input,port,calls}=fixture();let saved:SavedLaunchDraft|null=null;let pending:File|null=file;
  port.accept=d=>{saved=d;};port.uploaded=()=>{pending=null;};vi.mocked(port.metadata).mockRejectedValueOnce(new Error('Not available'));
  await expect(prepareLaunchDraft(input,port)).rejects.toThrow('Not available');
  await prepareLaunchDraft({...input,draft:saved,file:pending},port);
  expect(calls).toEqual(['save','upload','metadata','review']);expect(port.upload).toHaveBeenCalledOnce();
 });
 it('regenerates stale metadata after changing token details',async()=>{
  const {input,port,calls}=fixture();const result=await prepareLaunchDraft({...input,file:null,draft:{...draft,image,metadata:asset},fields:{...fields,description:'Latest description'}},port);
  expect(calls).toEqual(['save','metadata','review']);expect(result.review?.draft.fields.description).toBe('Latest description');
 });
 it('opens an already prepared review without new writes, even if uploads are now unavailable',async()=>{
  const {input,port,calls}=fixture();await prepareLaunchDraft({...input,file:null,uploads:false,draft:{...draft,image,metadata:asset}},port);expect(calls).toEqual(['review']);
 });
 it('requires a logo and removes old assets before reviewing a removed image',async()=>{
  const {input,port,calls}=fixture();await expect(prepareLaunchDraft({...input,file:null,removeImage:true,draft:{...draft,image,metadata:asset}},port)).rejects.toThrow('Choose a logo');expect(calls).toEqual(['remove']);
 });
 it('rejects a historical USDC choice before saving or uploading',async()=>{
  const {input,port,calls}=fixture();await expect(prepareLaunchDraft({...input,fields:{...fields,quoteAsset:'USDC'}},port)).rejects.toThrow();expect(calls).toEqual([]);
 });
 it('rejects invalid links and UTF-8 overflow before saving or uploading',async()=>{
  for(const invalid of [{...fields,name:'é'.repeat(17)},{...fields,website:'javascript:alert(1)'},{...fields,symbol:'BAD SYMBOL'}]){const {input,port,calls}=fixture();await expect(prepareLaunchDraft({...input,fields:invalid},port)).rejects.toThrow();expect(calls).toEqual([]);}
 });
 it('rejects empty details before any write',async()=>{
  const {input,port,calls}=fixture();await expect(prepareLaunchDraft({...input,fields:{...fields,name:' '}},port)).rejects.toThrow('Enter a token name');expect(calls).toEqual([]);
 });
 it('reports surrounding spaces instead of silently trimming, before any write',async()=>{
  const {input,port,calls}=fixture();await expect(prepareLaunchDraft({...input,fields:{...fields,name:'Moss '}},port)).rejects.toThrow('Remove spaces');expect(calls).toEqual([]);
 });
 it('refuses a Developer Buy the network cannot serve before any write, and keeps one that it can',async()=>{
  const blocked=fixture();await expect(prepareLaunchDraft({...blocked.input,fields:{...fields,devBuyBps:350}},blocked.port)).rejects.toThrow('Developer Buy');expect(blocked.calls).toEqual([]);
  const over=fixture();await expect(prepareLaunchDraft({...over.input,fields:{...fields,devBuyBps:351},devBuyAvailable:true},over.port)).rejects.toThrow('3.5%');expect(over.calls).toEqual([]);
  const ok=fixture();const result=await prepareLaunchDraft({...ok.input,fields:{...fields,devBuyBps:350},devBuyAvailable:true},ok.port);
  expect(ok.calls).toEqual(['save','upload','metadata','review']);expect(result.review?.draft.fields.devBuyBps).toBe(350);
 });
 it('stops after cancellation or wallet change and does not accept another owner’s response',async()=>{
  const {input,port,calls}=fixture();let cancelled=false;port.check=()=>{if(cancelled)throw new DOMException('Wallet changed','AbortError');};
  vi.mocked(port.save).mockImplementationOnce(async()=>{cancelled=true;return draft;});
  await expect(prepareLaunchDraft(input,port)).rejects.toHaveProperty('name','AbortError');expect(calls).toEqual([]);expect(port.accept).not.toHaveBeenCalled();expect(port.upload).not.toHaveBeenCalled();
 });
 it('rejects a stale review instead of presenting readiness',async()=>{
  const {input,port}=fixture();vi.mocked(port.review).mockResolvedValueOnce({draft,readyForNextMilestone:true,issues:[],fieldIssues:[],launchEnabled:false,launchChargeSol:'0.05'});
  await expect(prepareLaunchDraft(input,port)).rejects.toThrow('changed while preparing');
 });
});
