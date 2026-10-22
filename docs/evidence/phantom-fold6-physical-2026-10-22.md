# Physical Phantom Android acceptance — Samsung Galaxy Z Fold6

Owner-reported physical results, 22 October 2026. These are distinct from browser emulation and unsigned simulation.

Wallet: `Aziw8URxK23irkF6VZQrq28HoyyMagxA66jpotBPiiYe`. Network: Solana Devnet.

| Physical check | Result |
| --- | --- |
| Fresh invitation accepted | PASS |
| Phantom connection | PASS |
| Sign-in signature accepted | PASS |
| Correct nominated account displayed | PASS |
| Folded layout usable | PASS |
| Unfolded layout usable | PASS |
| Authenticated session survives refresh | PASS |
| Image selected from phone with local preview | PASS |

## Owner screenshot evidence

The owner attached an actual phone screenshot to this acceptance message. It shows the Phantom Android browser, connected Devnet indicator, selected dog photograph `1000037117.jpg`, Replace image/Remove image controls, and disabled Create Coin with the preparation-only explanation. It also shows the floating page-close X overlapping the logo region. The screenshot corroborates local artwork selection and the locked execution gate, not an on-chain launch or a token balance.

The original inline screenshot is retained in the conversation. No binary image path was exposed in this workspace/attachment directory, so this document does not claim a copied screenshot file exists in Git. Preserve the original image when a downloadable file becomes available; never substitute a recreated/emulated screenshot for physical evidence.

## Independent server observations

The nominated wallet's existing saved draft is MobileCoin / MOBILE, with Developer Buy off and image/metadata null. Do not silently overwrite it with the proposed FOLD6 test. The planned acceptance transaction uses Fold6 Mobile Test / FOLD6 with 2% (20,000,000 tokens), only after separate explicit approval and refreshed wallet review. Broadcasting is still disabled.

Physical on-chain acceptance remains PENDING: no new transaction signature, finalized mint, token receipt, platform charge or Explore listing is claimed. The next verification must independently reconcile those public results and verify one atomic launch/buy and exactly one 0.05 Devnet SOL charge.

## Refreshed unsigned proposal

At 2026-10-22 10:37:54 UTC, the fixed public Devnet RPC confirmed its expected genesis, wallet balance 10 Devnet SOL and quote slot 513856665. Unsigned creation/buy simulation succeeded; no user signature or broadcast occurred.

- Proposed name/symbol: Fold6 Mobile Test / FOLD6; TOKEN/SOL.
- Developer Buy: 2% = exactly 20,000,000 tokens, below 3.5% maximum.
- Platform charge: 50,000,000 lamports, once.
- Network fee estimate: 10,000 lamports.
- Account rent estimate: 15,082,520 lamports.
- Buy estimate including protocol/creator fees: 5,769,233 lamports; buy ceiling: 5,826,926 lamports.
- Estimated total: 70,861,753 lamports; total using buy ceiling: 70,919,446 lamports.
- Combined protocol/creator fees within buy estimate: 71,227 lamports; never double-count them.
- Proposed approval ceiling: 71,000,000 lamports (0.071 Devnet SOL); stop for reapproval if a refreshed final preparation exceeds it.
- Platform test recipient: GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp.
- Agent Rewards test recipient: D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs.

This estimate uses an existing test metadata URI of normal CID length for simulation only. Final selected phone artwork must be uploaded, with new metadata for the owner's actual token fields, after the owner commits via Create Coin. This is not permission to substitute old metadata or an arbitrary photograph. The final wallet review and exact payload must be revalidated, and this document is not itself transaction approval.

## Close-control correction

On mobile/tablet or coarse-pointer layouts, the Launchpad page-close control now remains in its dedicated normal-flow row; it does not float over the logo, file picker or other form inputs. Desktop behavior remains unchanged. Mocked browser acceptance passed at 344×882 and 690×829, checking a minimum 44×44 touch target, normal-flow placement, no logo-heading overlap after scroll and accessibility again after returning to the top. These are browser regressions, not a second claimed physical-device test. The temporary mobile frontend was rebuilt and updated without restarting the gateway/API, invalidating the owner session or enabling broadcasts. Refresh to see it. Frontend typecheck/build passed; lint has no errors and two existing cleanup-ref warnings.

## Specific transaction approval received

The owner explicitly approved ONE FOLD6 public-Devnet launch from Aziw8URxK23irkF6VZQrq28HoyyMagxA66jpotBPiiYe, TOKEN/SOL, exact 2% (20,000,000 tokens), one 0.05 Devnet SOL platform charge, total debit at most 0.071 Devnet SOL, using the previously verified test recipients. The owner will personally approve in physical Phantom. No operator-side signing or submission is authorized.

A separate owned draft `bb009350-184a-461c-a0d5-9633b4d0f315` was created with FOLD6/2%. The original MobileCoin draft was compared before/after and remains unchanged. No artwork or metadata was uploaded during setup. Its image must be reselected on the separate FOLD6 draft rather than silently copied from another draft.

Only the isolated manual API uses the new single-test scope. It checks exact wallet, draft, token, SOL, allocation, treasury recipients, current simulated network/rent/buy amounts and the 0.071 total ceiling. A private durable journal binds a single launch ID, mint and message; signing/submission cannot authorize another message or coin. Exact signed-payload recovery remains available. If preparation fails after a mint is reserved, operator reconciliation is required rather than silently generating a replacement. Other draft mutations and deletion are blocked during this test, protecting MobileCoin.

Four scope/wallet regression tests, backend typecheck, lint and build passed. No Mainnet, Railway financial settings or schema changes are included. The normal server entrypoint never imports this manual verification tool. Physical on-chain acceptance remains pending until the owner signs and independent finalized evidence is recorded.
