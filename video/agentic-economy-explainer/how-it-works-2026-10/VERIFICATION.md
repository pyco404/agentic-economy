# Factual and production verification

21 October 2026. Scope is the complete script/storyboard plus 15-second approval sample; **not completion of the 120-second film**.

## Current live deployment

Read-only HTTP checks: `https://staging.useaeco.xyz` returns 200. Both `https://useaeco.xyz` and `https://www.useaeco.xyz` return 404. The video therefore uses the verified staging address, not a claim that the official root currently works. This is a deployment availability check, not permission to change DNS.

Staging `/healthz` returned contract 0.5.0, MODE demo, running simulation, PostgreSQL and `financialFeaturesEnabled:false`. These are observed application responses, not a newly verified Railway deployment SHA: Railway credentials have expired, so control-plane SHA verification is unavailable. No deployment was performed.

Actual live city footage and Economy screenshot are in ignored `cache/`. Additional page evidence is in `cache/capture-evidence.json` when the independent read-only audit completes. The scene capture hides overlay DOM only in the recording browser; it does not change deployed geometry/camera code. A small drag provides motion through the existing camera controls. The final 12 seconds of the recorded city are used; no loading sequence is represented as city footage.

## Capability classification

| Capability | Evidence and truthful presentation |
| --- | --- |
| Living city, neighborhoods, rail/water/ambient transport | Real staging footage; actual rendering, not invented artwork. Ambient visuals do not establish economic transactions. |
| Jobs, inventories, resource production and receipts | Current simulation services and real Economy UI; rule-based planning, not independent LLM businesses. Show observed assignments only. Credits are simulated/non-withdrawable. |
| SOL token creation, actual Phantom desktop | Historical documented finalized public-Devnet evidence: `apps/server/docs/evidence/pump-phantom-create-coin-devnet-2026-10-19.json`. Not a fresh chain audit or proof of Mainnet availability. |
| Optional Developer Buy at 3% and 3.5% | Documented controlled public-Devnet transactions in `apps/server/docs/developer-buy-devnet-verification-2026-10-20.md`; automated disposable signer, not physical Phantom acceptance. |
| Real image/metadata pinning | Previous actual Pinata results in Devnet evidence; no new upload in video production. New preview images remain local until Create Coin. |
| Current improved form/Communities styling | Latest local main includes unpushed UI improvements through `5ba2c95`; staging footage may differ from those local edits. Use a Development demonstration label for later local captures. |
| Explore/provenance/HQ | Actual implementation and registered records only; unavailable market data is never replaced with invented numbers. Use real artwork if its verified record exists; demo communities may show initials. |
| Eligible creator fees | 60% Agent Rewards / 40% Platform / 0% human launcher. Separate 0.05 SOL charge entirely platform. Accounting or accrued fees do not prove collection/disbursement. |
| Common Agents/$AECO | Planned, not live: holder eligibility, future useful work, funded capped rewards; no fixed Credits conversion and no assertion that $AECO launched. |
| Super Agents | Separate planned class, not upgraded Common Agents. AECO-lock rental, controlled wallets/limits, persistent identity/reputation/portfolio; future fee participation conditional, no promised returns. |

Current `apps/web/src/content/ecosystem.ts`, `Roadmap.tsx`, shared schemas and acceptance documentation informed the narration. No USDC/AECO launch selectors are shown as currently available. No new transaction, wallet signature, creator-fee collection, payout, migration, production change or backend-data mutation is performed.

## Remaining before full export

Owner approval of this sample's voice, music, visual style and captions; full product footage (including authentic previously approved Phantom signing footage, if available); labeled planned-feature motion graphics; actual source-matched treasury address if shown; measured full narration/caption synchronization; 120-second/3,600-frame final render, full audio/playback checks and final factual review. Physical Phantom mobile acceptance is a platform gate, not claimed complete by a promotional video.

## Sample validation results

Passed: exact 15.000-second duration; 450 frames; 1080 × 1350; 30 FPS; H.264/yuv420p and AAC/48 kHz; full FFmpeg decode; nonblank frames and visible motion; all four subtitle cues within measured speech timing; no clipped narration/mix/encoded audio; original model and voice hashes match. Chrome playback, seeking to seconds 7 and 14, and browser-reported 1080 × 1350/15-second decoding passed. Output reports: `output/validation.json`, `audio-validation.json`, `browser-playback.json`.

Staging browser audit completed for Launchpad, Explore, Communities, Treasury and Roadmap. Capabilities report uploads available, launch execution disabled and PostgreSQL storage. This production made **no** new Pinata upload, wallet signature or on-chain transaction.
