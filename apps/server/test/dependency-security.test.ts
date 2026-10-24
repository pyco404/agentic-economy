import {createRequire} from 'node:module';
import {describe,expect,it} from 'vitest';
import {Connection,Keypair,type FetchFn} from '@solana/web3.js';

const require=createRequire(import.meta.url);
const pumpRequire=createRequire(require.resolve('@pump-fun/pump-sdk'));
const anchorRequire=createRequire(pumpRequire.resolve('@coral-xyz/anchor'));
const splRequire=createRequire(pumpRequire.resolve('@solana/spl-token'));
const layoutRequire=createRequire(splRequire.resolve('@solana/buffer-layout-utils'));

describe('security-updated SDK dependency compatibility (offline)',()=>{
 it('preserves Anchor Buffer/string TOML parsing and prevents prototype pollution',()=>{
  const toml=anchorRequire('toml') as {parse(input:string|Buffer):Record<string,unknown>};
  const text='[programs.localnet]\nexample = "11111111111111111111111111111111"\n[provider]\ncluster = "localnet"\nwallet = "fixtures/disposable.json"';
  expect(toml.parse(Buffer.from(text))).toEqual(toml.parse(text));
  expect(toml.parse(text)).toMatchObject({programs:{localnet:{example:'11111111111111111111111111111111'}},provider:{cluster:'localnet'}});
  try{toml.parse('__proto__.aecoDependencyProbe = true');}catch{/* Explicit rejection is also safe. */}
  expect(Object.hasOwn(Object.prototype,'aecoDependencyProbe')).toBe(false);
 });
 it('round-trips exact SPL integer boundaries using the production pure-JS bigint entry',()=>{
  const codec=layoutRequire('bigint-buffer/dist/browser.js') as {
   toBufferLE(n:bigint,width:number):Buffer;toBufferBE(n:bigint,width:number):Buffer;toBigIntLE(b:Buffer):bigint;toBigIntBE(b:Buffer):bigint;
  };
  for(const width of [8,16,32])for(const value of [0n,1n,(1n<<BigInt(width*8))-1n]){
   expect(codec.toBigIntLE(codec.toBufferLE(value,width))).toBe(value);
   expect(codec.toBigIntBE(codec.toBufferBE(value,width))).toBe(value);
   expect(codec.toBufferLE(value,width)).toHaveLength(width);
  }
 });
 it('preserves Solana JSON-RPC callbacks, generated request IDs and batches without a network call',async()=>{
  const requests:Array<{id:string;method:string}>=[];
  const fetch=(async(_url:unknown,init?:{body?:unknown})=>{
   const parsed=JSON.parse(String(init?.body)) as {id:string;method:string}|Array<{id:string;method:string}>;
   const reply=(request:{id:string;method:string})=>{
    requests.push(request);
    const result=request.method==='getBalance'?{context:{slot:42},value:1234}:
     request.method==='getLatestBlockhash'?{context:{slot:42},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}}:
     request.method==='getTransaction'?null:undefined;
    if(result===undefined)throw new Error('Unexpected mock RPC method');
    return{jsonrpc:'2.0',id:request.id,result};
   };
   return Response.json(Array.isArray(parsed)?parsed.map(reply):reply(parsed));
  }) as FetchFn;
  const connection=new Connection('http://127.0.0.1:1',{fetch,disableRetryOnRateLimit:true});
  expect(await connection.getBalance(Keypair.generate().publicKey)).toBe(1234);
  expect((await connection.getLatestBlockhash()).lastValidBlockHeight).toBe(100);
  expect(await connection.getParsedTransactions(['1'.repeat(64),'2'.repeat(64)])).toEqual([null,null]);
  expect(requests).toHaveLength(4);
  expect(new Set(requests.map(r=>r.id)).size).toBe(4);
  for(const request of requests)expect(request.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 });
});
