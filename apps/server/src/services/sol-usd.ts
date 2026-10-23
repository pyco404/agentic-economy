import {z} from 'zod';
const ticker=z.object({price:z.string().regex(/^\d+(\.\d+)?$/),time:z.iso.datetime({offset:true})});
/** Public USD reference, not a token price source. One shared request per minute; reject stale ticks. */
export class SolUsdReference{
 private cached:{price:number;asOf:string;source:'coinbase'}|null=null;private at=0;private job:Promise<typeof this.cached>|null=null;
 constructor(private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
 async read(){
  if(this.job)return this.job;
  if(this.at&&this.now()-this.at<60000)return this.cached&&this.now()-Date.parse(this.cached.asOf)<120000?this.cached:null;
  this.at=this.now();this.cached=null;
  this.job=(async()=>{try{
   const r=await this.fetcher('https://api.exchange.coinbase.com/products/SOL-USD/ticker',{signal:AbortSignal.timeout(5000),redirect:'error',headers:{accept:'application/json'}});
   if(!r.ok)return null;const body=await r.text();if(body.length>10000)return null;
   const v=ticker.parse(JSON.parse(body)),price=Number(v.price),age=this.now()-Date.parse(v.time);
   if(!Number.isFinite(price)||price<=0||age>120000||age< -30000)return null;
   this.at=this.now();this.cached={price,asOf:v.time,source:'coinbase'};return this.cached;
  }catch{return null;}})().finally(()=>{this.job=null;});return this.job;
 }
}
