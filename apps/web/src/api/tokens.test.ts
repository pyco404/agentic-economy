import {expect,it} from 'vitest';
import {isVerifiedPlatformToken} from './tokens';
import {Community,LaunchResponse} from './shared';
import communities from '../../../../packages/shared/fixtures/communities.json';
import launchFixture from '../../../../packages/shared/fixtures/launch.json';
it('requires matching server provenance, creator and metadata for new execution records',()=>{
 const launch=LaunchResponse.parse(launchFixture).launch,c=Community.parse(communities.items.find(c=>c.launchId===launch.id)??communities.items[0]);
 const community={...c,id:launch.communityId!,launchId:launch.id,mint:launch.mint,launchSignature:launch.signature!,creatorWallet:launch.launcherWallet,metadataUri:launch.draft.metadataUri};
 expect(isVerifiedPlatformToken(community,launch,launch.mode)).toBe(true);
 const provenance={platformOrigin:'PLATFORM' as const,initiator:'HUMAN' as const,network:'devnet' as const,quoteAsset:'SOL' as const};
 const execution={...provenance,draftId:'00000000-0000-4000-8000-000000000000',draftVersion:1,transaction:'test-only',lastValidBlockHeight:100,genesisHash:launch.mint};
 const verifiedLaunch={...launch,execution};
 expect(isVerifiedPlatformToken({...community,provenance},verifiedLaunch,launch.mode)).toBe(true);
 expect(isVerifiedPlatformToken(community,verifiedLaunch,launch.mode)).toBe(false);
 expect(isVerifiedPlatformToken({...community,provenance,metadataUri:'https://wrong.example'},verifiedLaunch,launch.mode)).toBe(false);
 expect(isVerifiedPlatformToken({...community,provenance:{...provenance,network:'localnet'}},verifiedLaunch,launch.mode)).toBe(false);
 expect(isVerifiedPlatformToken({...community,provenance},{...verifiedLaunch,status:'submitted'},launch.mode)).toBe(false);
});
