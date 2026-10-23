import {z} from 'zod';
import {PublicKey} from '@agentic-economy/shared';
const index=z.number().int().min(0).max(65535);
const instruction=z.object({programIdIndex:index,accounts:z.array(index).max(1024),data:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]*$/).max(200000)});
const addresses=z.object({writable:z.array(PublicKey).max(256),readonly:z.array(PublicKey).max(256)});
const transaction=z.object({version:z.union([z.literal('legacy'),z.literal(0),z.literal(1)]).optional(),slot:z.number().int().nonnegative().safe(),blockTime:z.number().int().nonnegative().safe(),transaction:z.object({signatures:z.array(z.string()).min(1).max(256),message:z.object({accountKeys:z.array(PublicKey).min(1).max(1024),instructions:z.array(instruction).max(2048),transactionConfig:z.unknown().optional()})}),meta:z.object({err:z.literal(null),loadedAddresses:addresses.nullish(),innerInstructions:z.array(z.object({index,instructions:z.array(instruction).max(4096)})).nullable()})});
/** JSON RPC read evidence only. v1 resource configuration must never enter signing/fee authorization
 * through this adapter; market notionals and protocol fees come from authenticated program events. */
export function marketTransaction(raw:unknown,signature:string){
 const tx=transaction.parse(raw);
 if(tx.transaction.signatures[0]!==signature)throw Error('Transaction signature mismatch');
 const loaded=tx.meta.loadedAddresses;
 if(tx.version===1&&((loaded?.writable.length??0)+(loaded?.readonly.length??0)>0||!tx.transaction.message.transactionConfig))throw Error('Invalid v1 message structure');
 const keys=[...tx.transaction.message.accountKeys,...(loaded?.writable??[]),...(loaded?.readonly??[])];
 const all=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions??[]).flatMap(g=>g.instructions)];
 for(const ix of all)if(ix.programIdIndex>=keys.length||ix.accounts.some(i=>i>=keys.length))throw Error('Invalid compiled market account index');
 return {slot:tx.slot,blockTime:tx.blockTime,keys,instructions:tx.transaction.message.instructions,innerInstructions:tx.meta.innerInstructions??[]};
}
