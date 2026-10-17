/** Read-only local demo snapshot. Never sends commands or connects to a wallet. */
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.VIDEO_DEMO_API??'http://127.0.0.1:8787';
const get=async route=>{const response=await fetch(`${base}/api/v1/world/${route}`);if(!response.ok)throw new Error(`Snapshot HTTP ${response.status}`);return response.json();};
const bootstrap=await get('bootstrap');
if(bootstrap.mode!=='demo')throw new Error('Video snapshots must come from an explicitly identified demo server.');
const x=Math.floor(bootstrap.chunks.reduce((n,c)=>n+c.cx,0)/bootstrap.chunks.length),y=Math.floor(bootstrap.chunks.reduce((n,c)=>n+c.cy,0)/bootstrap.chunks.length);
const [chunks,agents]=await Promise.all([get(`chunks?x=${x}&y=${y}&radius=4`),get('agents')]);
const output=new URL('../cache/',import.meta.url);await mkdir(output,{recursive:true});
for(const [name,data] of Object.entries({bootstrap,chunks,agents}))await writeFile(new URL(`${name}.json`,output),JSON.stringify(data));
console.log('Saved read-only demo snapshot. All footage is a presentation of demo state, not a blockchain execution.');
