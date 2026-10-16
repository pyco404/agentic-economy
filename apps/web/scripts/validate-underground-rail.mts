import { writeFileSync } from 'node:fs';
import { numericSeed, worldChunkToVisual } from '../src/api/adapter.ts';
import { generateFrontier } from '../src/world/frontier.ts';
import { planStreets } from '../src/world/streets.ts';
import { planRiversideRail } from '../src/world/riversideRail.ts';
import { planUndergroundRail, undergroundService } from '../src/world/undergroundRail.ts';
const base='http://127.0.0.1:8787/api/v1';
const bootstrap=await (await fetch(base+'/world/bootstrap')).json();
const payload=await (await fetch(base+'/world/chunks?x=1&y=1&radius=4')).json();
const chunks=payload.chunks.map(worldChunkToVisual),seed=numericSeed(bootstrap.seed);
const frontier=generateFrontier(seed,chunks,bootstrap.chunks), streets=planStreets(chunks,seed);
const original=planRiversideRail(chunks,frontier,seed,streets);
const next=planUndergroundRail(original,chunks,frontier,seed,streets);
const result={ worldId:bootstrap.worldId,buildings:chunks.flatMap(c=>c.buildings).length, base:original.report,
  proposed:next.report, service:next.underground&&next.path?undergroundService(0,next.path,next.underground):null };
writeFileSync('reviews/underground-rail-validation.json',JSON.stringify(result,null,2));
writeFileSync('/tmp/rail-live-world.json',JSON.stringify({chunks,seed,catalog:bootstrap.chunks}));
console.log(JSON.stringify(result,null,2));
