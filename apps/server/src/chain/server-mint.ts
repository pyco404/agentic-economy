import bs58 from 'bs58';
import {OFFICIAL_TREASURIES} from '@agentic-economy/shared';
import type {AppConfig} from '../config.js';
import {AppError} from '../util/errors.js';
import {coSignReviewedMint, inspectMintSigningReview, PLANNED_AECO_MINT, verifyMintSigningArtifact, type MintSigningPolicy} from './offline-mint.js';

/** Never place the secret in AppConfig, DTOs, logs or persisted launch records. */
export const VANITY_MINT_SECRET_NAME = 'AECO_VANITY_MINT_SECRET';

/** Pure mint-only co-signing. The caller supplies the server-persisted review, not HTTP input.
 * Explicit disposable Devnet policies are used only by isolated tests; production's factory is fixed. */
export class ServerMintSigner {
  constructor(private readonly policy:MintSigningPolicy, private readonly readSecret:()=>string|undefined) {}
  configured(){return !!this.readSecret()?.trim();}
  async sign(review:unknown, authenticatedWallet:string){
    if(authenticatedWallet!==this.policy.deployer)throw new AppError('forbidden','Only the authorized deployer may sign this mint');
    let bytes:Uint8Array|undefined;
    try {
      const checked=await inspectMintSigningReview(review,this.policy);
      const secret=this.readSecret()?.trim();
      if(!secret)throw new Error('Not configured');
      if(secret.startsWith('[')){
        const values:unknown=JSON.parse(secret);
        if(!Array.isArray(values)||values.length!==64||!values.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw new Error('Invalid keypair');
        bytes=Uint8Array.from(values as number[]);
        (values as number[]).fill(0);
      }else bytes=bs58.decode(secret);
      if(bytes.length!==64)throw new Error('Invalid keypair');
      const signed=await coSignReviewedMint(checked.review,this.policy,checked.review.messageSha256,bytes);
      return await verifyMintSigningArtifact(checked.review,this.policy,signed);
    }catch{
      // JSON/SDK errors can include secret fragments. Never propagate their message/cause.
      throw new AppError('unavailable','Automatic mint signing could not be completed. No wallet approval or submission occurred. Check the backend signing configuration or use the offline fallback.');
    }finally{bytes?.fill(0);}
  }
}

export function officialServerMintSigner(config:AppConfig):ServerMintSigner|undefined{
  if(config.mode!=='production'||config.solana.cluster!=='mainnet-beta')return undefined;
  return new ServerMintSigner({mint:PLANNED_AECO_MINT,deployer:OFFICIAL_TREASURIES.aecoDeployer,
    platform:OFFICIAL_TREASURIES.platform,rewards:OFFICIAL_TREASURIES.agentRewards},()=>process.env[VANITY_MINT_SECRET_NAME]);
}
