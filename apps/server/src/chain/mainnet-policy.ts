/** Reviewed public Mainnet deployment identities. Unknown protocol upgrades fail closed. */
import {type Connection,PublicKey} from '@solana/web3.js';
export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const MAINNET_PROGRAMS=[
 {program:'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',data:'B5MvUwXdiW1NMM6QFFD3ssPKBujD4zMohncbM73Z2BQu',slot:458921440n},
 {program:'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',data:'75Uu23mqWBb8LM8vDppqC1mQAnCcBuLXhVaDezVMQLRw',slot:456132171n},
 {program:'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',data:'6naEzKeUuFh1Jeeu51NXQgr5qkXgXtc9WKNct4xynVJc',slot:458921517n},
 {program:'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e',data:'4TXghKDfUy26yBMjicyfSfAp995GbLtNvW1d1uPSknub',slot:452655053n},
] as const;
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
const authority='7gZufwwAo17y5kg8FMyJy2phgpvv9RSdzWtdXiWHjFr8';
/** Read only; program identity/upgrade is checked again before broadcasting. */
export async function assertReviewedMainnetPrograms(connection:Connection){
 const keys=MAINNET_PROGRAMS.flatMap(p=>[new PublicKey(p.program),new PublicKey(p.data)]);
 const accounts=await connection.getMultipleAccountsInfo(keys,{commitment:'finalized',dataSlice:{offset:0,length:45}});
 for(let i=0;i<MAINNET_PROGRAMS.length;i++){
  const expected=MAINNET_PROGRAMS[i]!,program=accounts[i*2],data=accounts[i*2+1];
  if(!program?.executable||program.owner.toBase58()!==loader||program.data.length!==36||program.data.readUInt32LE(0)!==2||new PublicKey(program.data.subarray(4,36)).toBase58()!==expected.data||!data||data.owner.toBase58()!==loader||data.data.length<45||data.data.readUInt32LE(0)!==3||data.data.readBigUInt64LE(4)!==expected.slot||data.data[12]!==1||new PublicKey(data.data.subarray(13,45)).toBase58()!==authority)
   throw Error('Mainnet protocol deployment changed or is unrecognized; stop for a fresh review');
 }
}
