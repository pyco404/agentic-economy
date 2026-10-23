import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {describe,it,expect} from 'vitest';
import {MarketJournal} from '../src/services/market-journal.js';
import type {MarketTrade} from '../src/chain/market-types.js';
const url=process.env.MARKET_TEST_DATABASE_URL;
describe.skipIf(!url)('isolated market database persistence',()=>{
 it('restores cursor state across process objects, deduplicates events and rolls back failed page writes',async()=>{
  const pool=new pg.Pool({connectionString:url});
  try{
   const db=await pool.query('SELECT current_database() AS name');expect(db.rows[0].name).toMatch(/^aeco_market_.*_test$/);
   await pool.query(await readFile(new URL('../docs/sql/005_token_market.sql',import.meta.url),'utf8'));
   const now=Date.now(),trade:MarketTrade={signature:'sig',eventIndex:0,pool:'pool',venue:'bonding_curve',slot:1,blockTime:Math.floor(now/1000)-10,side:'buy',user:'user',tokenAmount:'100',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'1',protocolFee:'1',buybackFee:'0',timestamp:Math.floor(now/1000)-10};
   const page={trades:[trade],signatures:['sig'],oldestTime:trade.blockTime,exhausted:true};
   await new MarketJournal(pool,()=>now).sync('mainnet','mint',['pool'],async()=>page);
   const restarted=new MarketJournal(pool,()=>now);await restarted.sync('mainnet','mint',['pool'],async()=>page);
   expect(await restarted.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,durable:true,transactions:1,buys:1,volumeSol:0.1});
   await expect(restarted.sync('mainnet','mint',['pool'],async()=>({...page,trades:[{...trade,signature:'new'},{...trade,quoteAmount:'1'}],signatures:['new','sig']}))).rejects.toThrow(/Conflicting/);
   expect((await pool.query('SELECT count(*)::int AS n FROM token_market_trades')).rows[0].n).toBe(1);
   const restored=new MarketJournal(pool,()=>now);expect(await restored.activity('mainnet','mint',['pool'])).toMatchObject({transactions:1,volumeSol:0.1});
  }finally{await pool.end();}
 });
});
