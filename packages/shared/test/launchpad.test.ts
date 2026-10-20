import {expect,it} from 'vitest';
import {NewLaunchDraftFields,DraftFields,IpfsAsset,LaunchpadCapabilities} from '../src/launchpad.js';
it('permits draft editing without treating supplied asset references or unsupported pairs as trusted',()=>{
 // Stored exactly as entered (no silent trimming); surrounding spaces are a launch-readiness issue instead.
 expect(DraftFields.parse({name:' Moss ',symbol:'MOSS'})).toMatchObject({name:' Moss ',quoteAsset:'SOL',devBuyBps:0});
 expect(DraftFields.parse({name:'Moss',quoteAsset:'USDC'}).quoteAsset).toBe('USDC');
 for(const fields of [{quoteAsset:'AECO'},{quoteAsset:'USDC',quoteMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},{image:{cid:'invented'}},{metadataUri:'https://example.com/meta'},{website:'javascript:alert(1)'},{website:'https://user:secret@example.com'}])expect(DraftFields.safeParse(fields).success).toBe(false);
});
it('requires consistent IPFS references and represents backend-gated execution capability',()=>{
 const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
 expect(IpfsAsset.safeParse({cid,ipfsUri:`ipfs://${cid}`,gatewayUrl:`https://gateway.pinata.cloud/ipfs/${cid}`}).success).toBe(true);
 expect(IpfsAsset.safeParse({cid,ipfsUri:'ipfs://untrusted',gatewayUrl:'https://example.com'}).success).toBe(false);
 expect(LaunchpadCapabilities.safeParse({version:1,authentication:'cookie',uploads:true,maxBytes:5000000,maxPixels:16000000,storage:'postgres',launchEnabled:true,quotes:{SOL:'draft',USDC:'planned',AECO:'future'}}).success).toBe(true);
 for(const USDC of ['draft','planned'])expect(LaunchpadCapabilities.safeParse({version:1,authentication:'cookie',uploads:true,maxBytes:5000000,maxPixels:16000000,storage:'postgres',launchEnabled:true,quotes:{SOL:'draft',USDC,AECO:'future'}}).success).toBe(true);
 expect(LaunchpadCapabilities.safeParse({version:1,authentication:'cookie',uploads:true,maxBytes:5000000,maxPixels:16000000,storage:'postgres',launchEnabled:true,quotes:{SOL:'draft',USDC:'live',AECO:'future'}}).success).toBe(false);
});

it('accepts only SOL for new draft writes while retaining historical USDC reads',()=>{
 expect(NewLaunchDraftFields.parse({name:'Moss'}).quoteAsset).toBe('SOL');
 for(const quoteAsset of ['USDC','AECO','BTC'])expect(NewLaunchDraftFields.safeParse({quoteAsset}).success).toBe(false);
 expect(DraftFields.parse({quoteAsset:'USDC'}).quoteAsset).toBe('USDC');
 expect(NewLaunchDraftFields.safeParse({quoteAsset:'SOL',quoteMint:'custom'}).success).toBe(false);
});
