// Synthetic RPC evidence for verifier tests; never an on-chain receipt.
import {Keypair,PublicKey} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,SYSTEM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {associatedAccount,distributionEventPrefix} from '../../src/chain/creator-fees.js';
import {bondingCurvePda,creatorVaultPda,sharingConfigPda,anchorIxDiscriminator} from '../../src/chain/pump.js';
import type {ObservedTransaction} from '../../src/chain/types.js';
const key=()=>Keypair.generate().publicKey.toBase58();
export function distribution(quote=WRAPPED_SOL_MINT,total=1001n,roles?:{mint:string;agent:string;platform:string}){
 const mint=roles?.mint??key(),agent=roles?.agent??key(),platform=roles?.platform??key(),payer=key(),sc=sharingConfigPda(mint),vault=creatorVaultPda(sc),curve=bondingCurvePda(mint);
 const authority=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
 const a=[payer,mint,curve,sc,vault,SYSTEM_PROGRAM_ID,authority,PUMP_PROGRAM_ID,associatedAccount(vault,quote),quote,'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',agent,platform];
 if(quote!==WRAPPED_SOL_MINT)a.push(associatedAccount(agent,quote),associatedAccount(platform,quote));
 const pk=(v:string)=>new PublicKey(v).toBuffer(),u64=(v:bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(v);return b;},u16=(v:number)=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
 const event=Buffer.concat([distributionEventPrefix(),Buffer.alloc(8),pk(mint),pk(curve),pk(sc),pk(payer),Buffer.from([2,0,0,0]),pk(agent),u16(6000),pk(platform),u16(4000),u64(total),pk(quote)]);
 const agentAmount=total*6000n/10000n,platformAmount=total*4000n/10000n,paid=agentAmount+platformAmount;
 const tx:ObservedTransaction={signature:'1'.repeat(88),source:'solana_rpc',genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',slot:100,commitment:'finalized',err:null,feePayer:payer,feeLamports:5000n,signers:[payer],systemTransfers:[],instructions:[{ixIndex:0,programId:PUMP_PROGRAM_ID,discriminatorHex:anchorIxDiscriminator('distribute_creator_fees_v2').toString('hex'),accounts:a,dataBase64:Buffer.concat([anchorIxDiscriminator('distribute_creator_fees_v2'),Buffer.from([0])]).toString('base64')}],innerInstructions:[{parentIndex:0,programId:PUMP_PROGRAM_ID,accounts:[authority],stackHeight:2,dataBase64:event.toString('base64')}],lamportDeltas:quote===WRAPPED_SOL_MINT?{[agent]:agentAmount,[platform]:platformAmount,[vault]:-paid,[payer]:-5000n}:{},tokenAccounts:quote===WRAPPED_SOL_MINT?{}:{[a[8]!]:{mint:quote,owner:vault,decimals:6,pre:total,post:total-paid},[a[14]!]:{mint:quote,owner:agent,decimals:6,pre:0n,post:agentAmount},[a[15]!]:{mint:quote,owner:platform,decimals:6,pre:0n,post:platformAmount}}};
 return {tx,mint,agent,platform,vault};
}
