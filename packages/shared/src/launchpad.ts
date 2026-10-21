import { z } from 'zod';
import { AmountString, PublicKey } from './primitives.js';
import { DEV_BUY_MAX_BPS } from './constants.js';
import { tokenFieldIssues } from './tokenRules.js';
/** Additive workspace API, independent of agent identity/financial launch contracts. */
const link=z.string().url().max(200).refine(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use a public HTTPS link').nullable().default(null);
/** Saved-draft fields. Values are stored exactly as entered (never trimmed or truncated); `tokenFieldIssues`
 * applies the protocol byte limits on every save and the launch-readiness rules before any upload. */
export const DraftFields=z.object({name:z.string().max(256).default(''),symbol:z.string().max(64).default(''),description:z.string().max(4000).default(''),quoteAsset:z.enum(['SOL','USDC']).default('SOL'),website:link,twitter:link,telegram:link,
 devBuyBps:z.number().int().min(0).max(DEV_BUY_MAX_BPS).default(0).describe('Optional Developer Buy in basis points of total supply (0–350 = 0%–3.5%)')}).strict()
 .superRefine((f,ctx)=>{for(const i of tokenFieldIssues(f,false))ctx.addIssue({code:'custom',path:[i.field],message:i.message,params:{code:i.code}});}).meta({id:"DraftFields"});
export type DraftFields=z.infer<typeof DraftFields>;
/** Current write contract. Stored drafts and launch records keep their historical quote denomination. */
export const NewLaunchDraftFields=DraftFields.safeExtend({quoteAsset:z.literal('SOL').default('SOL')}).meta({id:'NewLaunchDraftFields'});
export const IpfsAsset=z.object({cid:z.string().regex(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/),ipfsUri:z.string(),gatewayUrl:z.string().url()}).refine(r=>r.ipfsUri===`ipfs://${r.cid}`);
export const DraftImage=IpfsAsset.safeExtend({uploadId:z.string(),status:z.literal('verified'),mime:z.enum(['image/png','image/jpeg','image/webp']),width:z.number().int().positive(),height:z.number().int().positive()});
export const SavedLaunchDraft=z.object({id:z.string().uuid(),wallet:PublicKey,version:z.number().int().nonnegative(),fields:DraftFields,image:DraftImage.nullable(),metadata:IpfsAsset.nullable(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()});
export type SavedLaunchDraft=z.infer<typeof SavedLaunchDraft>;
export const TokenFieldIssueSchema=z.object({field:z.enum(['name','symbol','description','devBuyBps','quoteAsset']),code:z.string(),message:z.string()});
export const DraftReview=z.object({draft:SavedLaunchDraft,readyForNextMilestone:z.boolean(),issues:z.array(z.string()),fieldIssues:z.array(TokenFieldIssueSchema).default([]),launchEnabled:z.boolean(),launchChargeSol:z.literal('0.05')});
export const LaunchpadCapabilities=z.object({version:z.literal(1),authentication:z.literal('cookie'),uploads:z.boolean(),maxBytes:z.number().int(),maxPixels:z.number().int(),storage:z.enum(['memory','postgres']),launchEnabled:z.boolean(),quotes:z.object({SOL:z.literal('draft'),USDC:z.enum(['planned','draft']).describe('Legacy compatibility field; current SOL-only product always reports planned (disabled)'),AECO:z.literal('future')}),
 devBuy:z.object({status:z.enum(['available','unavailable']),maxBps:z.literal(DEV_BUY_MAX_BPS),quoteAssets:z.array(z.literal('SOL')),reason:z.string().nullable()}).optional()});
/** Server quote for an optional Developer Buy, computed from Pump's live Global and fee configuration. */
export const DevBuyQuote=z.discriminatedUnion('status',[
 z.object({status:z.literal('available'),bps:z.number().int().min(0).max(DEV_BUY_MAX_BPS),quoteAsset:z.literal('SOL'),network:z.enum(['devnet','localnet','mainnet-beta']),
  totalSupply:AmountString,tokenDecimals:z.literal(6),tokenAmount:AmountString,capTokenAmount:AmountString,
  estimatedQuoteCost:AmountString.describe('Lamports, including Pump protocol and creator fees'),pumpFees:AmountString,maxQuoteCost:AmountString.describe('Lamports; the buy fails rather than spend more'),
  priceImpactBps:z.number().int().nonnegative(),slot:z.number().int().nonnegative()}),
 z.object({status:z.literal('unavailable'),bps:z.number().int().min(0).max(DEV_BUY_MAX_BPS),reason:z.string()}),
]);
export type DevBuyQuote=z.infer<typeof DevBuyQuote>;
export const launchpadPaths={capabilities:'/api/v1/launchpad/capabilities',devBuyQuote:'/api/v1/launchpad/dev-buy-quote',drafts:'/api/v1/launchpad/drafts',verify:'/api/v1/auth/browser/verify',session:'/api/v1/auth/browser/session',logout:'/api/v1/auth/browser/logout'} as const;
