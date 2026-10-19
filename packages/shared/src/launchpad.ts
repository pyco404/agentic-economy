import { z } from 'zod';
import { PublicKey } from './primitives.js';
/** Additive workspace API, independent of agent identity/financial launch contracts. */
const link=z.string().url().max(200).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;},'Use a public HTTPS link').nullable().default(null);
export const DraftFields=z.object({name:z.string().trim().max(32).default(''),symbol:z.string().trim().max(13).regex(/^[A-Za-z0-9$_.-]*$/).default(''),description:z.string().max(1000).default(''),quoteAsset:z.enum(['SOL','USDC']).default('SOL'),website:link,twitter:link,telegram:link}).strict();
export type DraftFields=z.infer<typeof DraftFields>;
export const IpfsAsset=z.object({cid:z.string().regex(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/),ipfsUri:z.string(),gatewayUrl:z.string().url()}).refine(r=>r.ipfsUri===`ipfs://${r.cid}`);
export const DraftImage=IpfsAsset.safeExtend({uploadId:z.string(),status:z.literal('verified'),mime:z.enum(['image/png','image/jpeg','image/webp']),width:z.number().int().positive(),height:z.number().int().positive()});
export const SavedLaunchDraft=z.object({id:z.string().uuid(),wallet:PublicKey,version:z.number().int().nonnegative(),fields:DraftFields,image:DraftImage.nullable(),metadata:IpfsAsset.nullable(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()});
export type SavedLaunchDraft=z.infer<typeof SavedLaunchDraft>;
export const DraftReview=z.object({draft:SavedLaunchDraft,readyForNextMilestone:z.boolean(),issues:z.array(z.string()),launchEnabled:z.boolean(),launchChargeSol:z.literal('0.05')});
export const LaunchpadCapabilities=z.object({version:z.literal(1),authentication:z.literal('cookie'),uploads:z.boolean(),maxBytes:z.number().int(),maxPixels:z.number().int(),storage:z.enum(['memory','postgres']),launchEnabled:z.boolean(),quotes:z.object({SOL:z.literal('draft'),USDC:z.enum(['planned','draft']).describe('draft = USDC launches are enabled on this safe network; planned = disabled'),AECO:z.literal('future')})});
export const launchpadPaths={capabilities:'/api/v1/launchpad/capabilities',drafts:'/api/v1/launchpad/drafts',verify:'/api/v1/auth/browser/verify',session:'/api/v1/auth/browser/session',logout:'/api/v1/auth/browser/logout'} as const;
