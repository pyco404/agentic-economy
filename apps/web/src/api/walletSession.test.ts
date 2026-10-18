import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {Keypair,SystemProgram,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {installedWallets,jsonRequest,launchpadRequest,SessionExpired,validateWalletChallenge,walletApiOrigin} from './walletSession';
const {registry}=vi.hoisted(()=>({registry:{wallets:[] as unknown[]}}));
vi.mock('@wallet-standard/app',()=>({getWallets:()=>({get:()=>registry.wallets})}));
afterEach(()=>{registry.wallets=[];vi.restoreAllMocks();vi.unstubAllGlobals();});
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

function phantomRegistration(standardTransaction?:{supportedTransactionVersions:readonly (0|'legacy')[];signTransaction:ReturnType<typeof vi.fn>}){
 const creator=Keypair.generate(),mint=Keypair.generate(),address=creator.publicKey.toBase58();
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:creator.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)})]}).compileToV0Message());tx.sign([mint]);
 const provider={publicKey:{toBase58:()=>address},connect:async()=>({publicKey:{toBase58:()=>address}}),signMessage:vi.fn(),signTransaction:vi.fn(async(transaction:VersionedTransaction)=>{transaction.sign([creator]);return transaction;}),disconnect:async()=>{}};
 vi.stubGlobal('window',{phantom:{solana:provider},addEventListener:vi.fn(),dispatchEvent:vi.fn()});
 const account={address,publicKey:creator.publicKey.toBytes(),chains:['solana:devnet'],features:['solana:signMessage']};
 const registered={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signMessage':{signMessage:vi.fn()},...(standardTransaction?{'solana:signTransaction':standardTransaction}:{})}};
 registry.wallets=[registered];
 return{creator,mint,tx,provider,address};
}
it('uses injected Phantom sign-only fallback without losing the mint signature or v0 message',async()=>{
 const f=phantomRegistration(),wallet=installedWallets().find(w=>w.name==='Phantom')!;await wallet.connect();
 const before=f.tx.signatures[1]!.slice(),message=f.tx.message.serialize();
 const signed=VersionedTransaction.deserialize(await wallet.signTransaction!(f.tx.serialize(),'devnet'));
 expect(signed.message.serialize()).toEqual(message);expect(signed.signatures[1]).toEqual(before);expect(signed.signatures[0]!.some(n=>n!==0)).toBe(true);expect(f.provider.signTransaction).toHaveBeenCalledOnce();
});
it('rejects a changed injected account before asking Phantom to sign',async()=>{
 const f=phantomRegistration(),wallet=installedWallets().find(w=>w.name==='Phantom')!;await wallet.connect();f.provider.publicKey={toBase58:()=>Keypair.generate().publicKey.toBase58()};
 await expect(wallet.signTransaction!(f.tx.serialize(),'devnet')).rejects.toThrow('account changed');expect(f.provider.signTransaction).not.toHaveBeenCalled();
});
it('does not issue a second signing prompt after a standard-wallet rejection',async()=>{
 const signTransaction=vi.fn(async()=>{throw Error('User rejected');}),f=phantomRegistration({supportedTransactionVersions:[0],signTransaction}),wallet=installedWallets().find(w=>w.name==='Phantom')!;await wallet.connect();
 await expect(wallet.signTransaction!(f.tx.serialize(),'devnet')).rejects.toThrow('User rejected');expect(signTransaction).toHaveBeenCalledOnce();expect(f.provider.signTransaction).not.toHaveBeenCalled();
});
it('uses injected v0 support when the standard feature only declares legacy transactions',async()=>{
 const signTransaction=vi.fn(),f=phantomRegistration({supportedTransactionVersions:['legacy'],signTransaction}),wallet=installedWallets().find(w=>w.name==='Phantom')!;await wallet.connect();
 await wallet.signTransaction!(f.tx.serialize(),'devnet');expect(signTransaction).not.toHaveBeenCalled();expect(f.provider.signTransaction).toHaveBeenCalledOnce();
});
