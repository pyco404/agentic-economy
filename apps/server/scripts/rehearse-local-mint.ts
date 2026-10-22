/** Read-only public-Devnet rehearsal. Disposable mint only; no wallet key, upload,
 * database, server, transaction submission or Mainnet RPC. The fee payer never signs.
 * Run from apps/server with node --import tsx --conditions=@agentic-economy/source.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import sdk from '../src/chain/pump-sdk.cjs';
import { LAUNCH_FEE_LAMPORTS,devBuyTokenAmount } from '@agentic-economy/shared';
import { buildUnsignedPumpLaunch,devBuyTokenAccount } from '../src/chain/pump-builder.js';
import { coSignReviewedMint, DEVNET_SIGNING_GENESIS, mintMessageHash, PLANNED_AECO_MINT, verifyMintSigningArtifact, type MintSigningReview } from '../src/chain/offline-mint.js';
import { withMintReservation } from './lib/mint-reservation.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
assert.equal(await connection.getGenesisHash(), DEVNET_SIGNING_GENESIS);
// Existing approved disposable roles, public addresses only. No signer file is opened.
const policy = { network: 'devnet' as const, mint: '',
  deployer: '49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F',
  platform: 'GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',
  rewards: 'D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs' };
const mint = Keypair.generate(); policy.mint = mint.publicKey.toBase58();
assert.notEqual(policy.mint, PLANNED_AECO_MINT);
assert.equal(await connection.getAccountInfo(mint.publicKey, 'finalized'), null);
const table = (await connection.getAddressLookupTable(new PublicKey('3fzk4ecq4NZ6XtVyayTBo2cYJTcMJMgNYr4cAFcgYLrn'))).value;
assert(table); assert(table.isActive());
const latest = await connection.getLatestBlockhash('confirmed');
const globalAccount=await connection.getAccountInfo(sdk.GLOBAL_PDA,'confirmed');
assert(globalAccount);assert.equal(globalAccount.owner.toBase58(),sdk.PUMP_PROGRAM_ID.toBase58());
const global=sdk.PUMP_SDK.decodeGlobal(globalAccount),feeConfig=await new sdk.OnlinePumpSdk(connection).fetchFeeConfig();
const tokenAmount=devBuyTokenAmount(BigInt(global.tokenTotalSupply.toString()),100),BN=global.tokenTotalSupply.constructor;
const cost=BigInt(sdk.getBuySolAmountFromTokenAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:new BN(tokenAmount.toString()),quoteMint:sdk.normalizeQuoteMint(undefined)}).toString());
const maxQuoteCost=cost+(cost*100n+9999n)/10000n;
const devBuy={tokenAmount,maxQuoteCost},protocolFeeRecipients={feeRecipient:global.feeRecipient.toBase58(),buybackFeeRecipient:global.buybackFeeRecipients[0]!.toBase58()};
const built = await buildUnsignedPumpLaunch({ mint: policy.mint, launcherWallet: policy.deployer,
  platformTreasury: policy.platform, agentRewardsTreasury: policy.rewards,
  name: 'Disposable Signing Rehearsal', symbol: 'SIGNTEST',devBuy,
  // Explicit dummy metadata; this is simulation and does not publish or create a token.
  uri: 'https://example.invalid/disposable-signing-rehearsal.json' }, latest.blockhash, [table],global,protocolFeeRecipients);
const unsigned = VersionedTransaction.deserialize(Buffer.from(built.transaction, 'base64'));
const before = await connection.getBalance(new PublicKey(policy.deployer), 'confirmed');
const platformBefore=await connection.getBalance(new PublicKey(policy.platform),'confirmed');
const simulation = await connection.simulateTransaction(unsigned, { sigVerify: false, commitment: 'confirmed',
  accounts: { encoding: 'base64', addresses: [policy.deployer, policy.mint, policy.platform,devBuyTokenAccount(policy.deployer,policy.mint)] } });
assert.equal(simulation.value.err, null, 'Devnet simulation failed; no transaction was sent');
const simulatedMint=simulation.value.accounts?.[1],simulatedPlatform=simulation.value.accounts?.[2],simulatedToken=simulation.value.accounts?.[3];
assert(simulatedMint&&simulatedPlatform&&simulatedToken);
assert(simulatedMint.data[0]);assert(simulatedToken.data[0]);
const mintBytes=Buffer.from(simulatedMint.data[0],'base64'),tokenBytes=Buffer.from(simulatedToken.data[0],'base64');
assert(mintBytes.length>=82&&tokenBytes.length>=72);
assert.equal(simulatedMint.owner,'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
assert.equal(mintBytes.readBigUInt64LE(36),BigInt(global.tokenTotalSupply.toString()));assert.equal(mintBytes[44],6);
assert.equal(tokenBytes.readBigUInt64LE(64),tokenAmount);
assert.equal(new PublicKey(tokenBytes.subarray(0,32)).toBase58(),policy.mint);
assert.equal(new PublicKey(tokenBytes.subarray(32,64)).toBase58(),policy.deployer);
assert.equal(BigInt(simulatedPlatform.lamports)-BigInt(platformBefore),LAUNCH_FEE_LAMPORTS);
const fee = (await connection.getFeeForMessage(unsigned.message, 'confirmed')).value;
const after = simulation.value.accounts?.[0]?.lamports;
assert(fee !== null && after !== undefined && after !== null);
const debit = BigInt(before) - BigInt(after);
assert(debit > LAUNCH_FEE_LAMPORTS && debit < 1_000_000_000n);
const review: MintSigningReview = { version: 1, launchId: 'disposable-devnet-signing-rehearsal',
  network: 'devnet', genesisHash: DEVNET_SIGNING_GENESIS, mint: policy.mint, launcherWallet: policy.deployer,
  platformTreasury: policy.platform, agentRewardsTreasury: policy.rewards,
  name: 'Disposable Signing Rehearsal', symbol: 'SIGNTEST', uri: 'https://example.invalid/disposable-signing-rehearsal.json',
  recentBlockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight,
  maxTotalDebitLamports: debit.toString(), messageSha256: mintMessageHash(unsigned), unsignedTransaction: built.transaction,
  lookupTables: [{ key: table.key.toBase58(), addresses: table.state.addresses.map(a => a.toBase58()) }],
  devBuy:{tokenAmount:tokenAmount.toString(),maxQuoteCost:maxQuoteCost.toString()},globalAccountBase64:globalAccount.data.toString("base64"),protocolFeeRecipients };
const state = mkdtempSync(join(tmpdir(), 'aeco-disposable-mint-rehearsal-'));
try {
  const artifact = await withMintReservation(state, { mint: policy.mint, launchId: review.launchId, messageSha256: review.messageSha256 },
    () => coSignReviewedMint(review, policy, review.messageSha256, mint.secretKey));
  await verifyMintSigningArtifact(review, policy, artifact);
  await verifyMintSigningArtifact(review, policy, artifact); // exact import retry
  const signed = VersionedTransaction.deserialize(Buffer.from(artifact.transaction, 'base64'));
  assert(signed.signatures[0]!.every(byte => byte === 0));
  // Partial signature survives serialize/import; the payer's Phantom signature is deliberately absent.
  const again = await connection.simulateTransaction(signed, { sigVerify: false, commitment: 'confirmed' });
  assert.equal(again.value.err, null);
  assert.equal(await connection.getAccountInfo(mint.publicKey, 'finalized'), null);
  const result = { checkedAt: new Date().toISOString(), network: 'devnet', genesis: DEVNET_SIGNING_GENESIS,
    readOnlyRpc: true, mint: policy.mint, officialMintUsed: false, payer: policy.deployer,
    platform: policy.platform, rewards: policy.rewards, lookupTable: table.key.toBase58(),
    packetBytes: built.bytes, instructionCount: built.instructions.length, messageSha256: review.messageSha256,
    simulationError: null, unitsConsumed: simulation.value.unitsConsumed,
    simulatedDebitLamports: debit.toString(), platformChargeLamports: LAUNCH_FEE_LAMPORTS.toString(),
    estimatedNetworkFeeLamports: String(fee), simulatedNonPlatformNonNetworkDebitLamports: (debit - LAUNCH_FEE_LAMPORTS - BigInt(fee)).toString(),
    simulatedMintAuthority:mintBytes.readUInt32LE(0)===0?null:new PublicKey(mintBytes.subarray(4,36)).toBase58(),
    simulatedFreezeAuthority:mintBytes.readUInt32LE(46)===0?null:new PublicKey(mintBytes.subarray(50,82)).toBase58(),
    simulatedTokenDecimals:mintBytes[44],simulatedTokenSupplyRaw:mintBytes.readBigUInt64LE(36).toString(),
    simulatedDeveloperTokenBalanceVerified:true,simulatedPlatformChargeVerified:true,developerBuyBps:100,developerBuyTokensRaw:tokenAmount.toString(),developerBuyEstimateLamports:cost.toString(),developerBuyMaxLamports:maxQuoteCost.toString(), localMintSignatureVerified: true,
    duplicatePublicArtifactVerified: true, payerSignaturePresent: false, mintAccountCreated: false,
    transactionsBroadcast: 0, realPhantomTest: false,
    limitation: 'Devnet RPC simulation plus disposable local mint signing/import only. No finalized launch or production handoff is claimed.' };
  const output = process.env.AECO_REHEARSAL_EVIDENCE;
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally {
  mint.secretKey.fill(0);
  rmSync(state, { recursive: true, force: true }); // only the freshly created disposable rehearsal state
}
