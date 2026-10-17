import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {installedWallets,jsonRequest,launchpadRequest,SessionExpired} from './walletSession';
afterEach(()=>vi.unstubAllGlobals());
it('uses HttpOnly cookie credentials and clears authenticated UI on an expired session',async()=>{
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});const fetch=vi.fn(async(_url:string,_options:RequestInit)=>({status:401,ok:false}));vi.stubGlobal('fetch',fetch);
 await expect(launchpadRequest('/api/v1/auth/browser/session',z.object({}),jsonRequest('POST',{}))).rejects.toBeInstanceOf(SessionExpired);
 expect(fetch.mock.calls[0]?.[1]).toMatchObject({credentials:'include'});expect(dispatchEvent.mock.calls[0]?.[0].type).toBe('aeco:session-expired');
});
it('detects an injected Solana provider and forwards exact message bytes without transaction APIs',async()=>{
 const signMessage=vi.fn(async(message:Uint8Array)=>({signature:message}));vi.stubGlobal('window',{addEventListener:vi.fn(),dispatchEvent:vi.fn(),phantom:{solana:{connect:async()=>({publicKey:{toBase58:()=> 'verified-public-key'}}),signMessage,disconnect:async()=>{}}}});
 const wallet=installedWallets().find(w=>w.name==='Phantom')!;expect(await wallet.connect()).toBe('verified-public-key');const bytes=new TextEncoder().encode('Sign in only');expect(await wallet.sign(bytes)).toBe(bytes);expect(signMessage).toHaveBeenCalledWith(bytes,'utf8');
});
