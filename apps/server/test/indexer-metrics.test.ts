import{expect,it}from'vitest';
import{makeEnv}from'./helpers.js';
it('exposes bounded indexer freshness/retry diagnostics without provider secrets or wallet labels',async()=>{
 const env=await makeEnv();try{const response=await env.app.inject({method:'GET',url:'/metrics'});expect(response.statusCode).toBe(200);for(const name of ['ae_market_live_lag_seconds','ae_market_backfill_pending_cursors','ae_market_stalled_cursors','ae_market_consecutive_failures','ae_rpc_requests_total','ae_rpc_retries_total','ae_rpc_queued','ae_rpc_cooldown_seconds'])expect(response.body).toContain(name);
 expect(response.body).not.toMatch(/api-key=|wallet=|secret=|https?:\/\//);
 }finally{await env.close();}
});
