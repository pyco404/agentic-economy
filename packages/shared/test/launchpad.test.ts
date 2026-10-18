import {expect,it} from 'vitest';
import {DraftFields,IpfsAsset,LaunchpadCapabilities} from '../src/launchpad.js';
it('permits draft editing without treating supplied asset references or unsupported pairs as trusted',()=>{
 expect(DraftFields.parse({name:' Moss ',symbol:'MOSS'})).toMatchObject({name:'Moss',quoteAsset:'SOL'});
 for(const fields of [{quoteAsset:'USDC'},{quoteAsset:'AECO'},{image:{cid:'invented'}},{metadataUri:'https://example.com/meta'},{website:'javascript:alert(1)'},{website:'https://user:secret@example.com'}])expect(DraftFields.safeParse(fields).success).toBe(false);
});
it('requires consistent IPFS references and explicitly disabled financial capability',()=>{
 const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
 expect(IpfsAsset.safeParse({cid,ipfsUri:`ipfs://${cid}`,gatewayUrl:`https://gateway.pinata.cloud/ipfs/${cid}`}).success).toBe(true);
 expect(IpfsAsset.safeParse({cid,ipfsUri:'ipfs://untrusted',gatewayUrl:'https://example.com'}).success).toBe(false);
 expect(LaunchpadCapabilities.safeParse({version:1,authentication:'cookie',uploads:true,maxBytes:5000000,maxPixels:16000000,storage:'postgres',launchEnabled:true,quotes:{SOL:'draft',USDC:'planned',AECO:'future'}}).success).toBe(false);
});
