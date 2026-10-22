/** Read-only Devnet attestation. Never loads a wallet or sends a transaction. */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Connection,PublicKey} from '@solana/web3.js';
const connection=new Connection('https://api.devnet.solana.com','finalized');
if(await connection.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Unexpected network');
const expected:Record<string,string>={
'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P':'bcee35d3eeb158090dd08764a8c5c03a2852c3cee553a0ce61dd5482469a5ec7',
'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ':'446db24678fa22700d8eda86c48ba361b325a084e319c0c66f780c953520b317',
'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA':'494d2257ed4a9a2bc3eb210b22cdb5058d77e17f1ba5095b636e96c86b1fd4ef',
'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e':'25ac2612be74e8437f79dbb4c62d7e3701c21b8f4c9ed0acaf832df4fe1a821d'};
const programs=[];
for(const [program,previousHash] of Object.entries(expected)){
 const info=await connection.getAccountInfo(new PublicKey(program),'finalized');
 if(!info?.executable||info.owner.toBase58()!=='BPFLoaderUpgradeab1e11111111111111111111111'||info.data.length!==36||info.data.readUInt32LE(0)!==2)throw Error('Unexpected executable program account');
 const address=new PublicKey(info.data.subarray(4,36)),data=await connection.getAccountInfo(address,'finalized');
 if(!data||data.owner.toBase58()!==info.owner.toBase58()||data.data.readUInt32LE(0)!==3||data.data.length<45)throw Error('Unexpected ProgramData');
 const elf=data.data.subarray(45);let end=elf.length;while(end>0&&elf[end-1]===0)end--;
 const sha256=createHash('sha256').update(elf).digest('hex'),trimmed=createHash('sha256').update(elf.subarray(0,end)).digest('hex');
 programs.push({program,programData:address.toBase58(),deploymentSlot:data.data.readBigUInt64LE(4).toString(),upgradeAuthority:data.data[12]?new PublicKey(data.data.subarray(13,45)).toBase58():null,sha256,matchesPreviousAudit:sha256===previousHash||trimmed===previousHash});
}
const lookup='3fzk4ecq4NZ6XtVyayTBo2cYJTcMJMgNYr4cAFcgYLrn',table=await connection.getAddressLookupTable(new PublicKey(lookup));
if(!table.value?.isActive())throw Error('Verification lookup table inactive');
const report={network:'public-devnet',checkedAt:new Date().toISOString(),readOnly:true,sdk:'@pump-fun/pump-sdk 4.1.0',programs,lookupTable:{address:lookup,entries:table.value.state.addresses.length,authority:table.value.state.authority?.toBase58()??null,active:true,lastExtendedSlot:table.value.state.lastExtendedSlot},limits:'Devnet attestation only. Upgradeable external programs and a mutable test ALT are not approved Mainnet custody or an independent audit.'};
writeFileSync(new URL('../docs/evidence/phase2-program-attestation-2026-10-22.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
