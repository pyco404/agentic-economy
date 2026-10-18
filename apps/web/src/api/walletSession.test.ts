import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {installedWallets,jsonRequest,launchpadRequest,SessionExpired,validateWalletChallenge,walletApiOrigin} from './walletSession';
afterEach(()=>vi.unstubAllGlobals());
it('keeps localhost cookies same-site without rewriting remote API origins',()=>{
 expect(walletApiOrigin('http://127.0.0.1:8791','http://localhost:5176')).toBe('http://localhost:8791');
 expect(walletApiOrigin('http://localhost:8791','http://127.0.0.1:5176')).toBe('http://127.0.0.1:8791');
 expect(walletApiOrigin('https://api-staging.useaeco.xyz','http://localhost:5176')).toBe('https://api-staging.useaeco.xyz');
 expect(walletApiOrigin('http://127.0.0.1:8791','https://localhost:5176')).toBe('http://127.0.0.1:8791');
 expect(walletApiOrigin('http://127.0.0.1:8791','http://localhost.evil.example')).toBe('http://127.0.0.1:8791');
});
it('requires the full current host and origin before asking the wallet to sign',()=>{
 const wallet='test-wallet',origin='http://localhost:5173';
 const challenge={nonce:'ABCDEFGH12345678',expiresAt:new Date(Date.now()+300000).toISOString(),
  message:`localhost:5173 wants you to sign in with your Solana account:\n${wallet}\n\nSign in\n\nURI: ${origin}\nNonce: ABCDEFGH12345678`};
 expect(()=>validateWalletChallenge(challenge,wallet,origin)).not.toThrow();
 expect(()=>validateWalletChallenge({...challenge,message:challenge.message.replace('localhost:5173 wants','localhost wants')},wallet,origin)).toThrow('including its port');
 for(const other of ['http://localhost:5174','http://127.0.0.1:5173','https://localhost:5173'])
  expect(()=>validateWalletChallenge(challenge,wallet,other)).toThrow('must match this page');
});
it('uses HttpOnly cookie credentials and clears authenticated UI on an expired session',async()=>{
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});const fetch=vi.fn(async(_url:string,_options:RequestInit)=>({status:401,ok:false}));vi.stubGlobal('fetch',fetch);
 await expect(launchpadRequest('/api/v1/auth/browser/session',z.object({}),jsonRequest('POST',{}))).rejects.toBeInstanceOf(SessionExpired);
 expect(fetch.mock.calls[0]?.[1]).toMatchObject({credentials:'include'});expect(dispatchEvent.mock.calls[0]?.[0].type).toBe('aeco:session-expired');
});
it('detects an injected Solana provider and forwards exact message bytes without transaction APIs',async()=>{
 const signMessage=vi.fn(async(message:Uint8Array)=>({signature:message}));vi.stubGlobal('window',{addEventListener:vi.fn(),dispatchEvent:vi.fn(),phantom:{solana:{connect:async()=>({publicKey:{toBase58:()=> 'verified-public-key'}}),signMessage,disconnect:async()=>{}}}});
 const wallet=installedWallets().find(w=>w.name==='Phantom')!;expect(await wallet.connect()).toBe('verified-public-key');const bytes=new TextEncoder().encode('Sign in only');expect(await wallet.sign(bytes)).toBe(bytes);expect(signMessage).toHaveBeenCalledWith(bytes,'utf8');
});
