# Physical Phantom mobile acceptance procedure

Target: the owner's Samsung Galaxy Z Fold6 on Android, both folded and unfolded. **Pending physical test.** Desktop ZAP acceptance is already verified and must not be repeated.

1. Nominate a dedicated Devnet account's public address. Do not use Platform, Agent Rewards or AECO deployer identities. Never provide private keys or recovery phrases.
2. The operator binds that account to the temporary gateway and starts only the isolated manual Devnet backend. It checks the existing database/schema, expected Devnet genesis, active test ALT and test treasury recipients. All listeners stay on loopback; the HTTPS tunnel reaches only the invitation gate.
3. Obtain the current HTTPS URL and the locally generated invitation code. The code is stored mode 0600 under a private temporary directory; do not publish it or paste provider credentials into chat. Access expires after 30 minutes and may be renewed when ready.
4. Open the URL in **Phantom's in-app browser**, enable its Devnet/Testnet mode and select the nominated account. Android Chrome alone is not an injected Phantom-wallet test. [Official integration guidance](https://docs.phantom.com/solana/integrating-phantom).
5. Enter the invitation code, connect and sign the authentication message. Confirm that the challenge's domain is the exact HTTPS test host. Refresh and verify session restoration. Switch to another wallet to verify rejection, then return to the nominated account.
6. Enter a clearly named test token and select artwork from the phone. Check immediate local preview, keyboard/form usability and no Pinata upload merely from selecting the image. Repeat layout checks folded and unfolded; report actual CSS viewport sizes rather than assuming browser emulation equals hardware.
7. Before any on-chain step, the operator presents the exact network, account, token, recipient addresses, chosen Developer Buy percentage and simulated complete costs. A separate explicit owner approval is required. The operator then opens only the isolated manual broadcast gate. The maximum remains 3.5%, SOL only, and the separate platform charge remains 0.05 Devnet SOL. No transaction is initiated by preparing the tunnel.
8. After approval, verify that 3.6% is rejected, select the approved percentage, and press Create Coin once. Check progress through actual image/metadata preparation and review all wallet costs/recipients. Stop if Mainnet or real funds are requested. The physical wallet approval is performed by the owner.
9. Keep the page open until confirmation. If interrupted, use Check status for the existing attempt; do not start another coin or pay again.
10. Report the public signature and mint, wallet UI result and device/browser versions. The operator independently checks finalized status, exact token allocation, one platform charge, correct recipients, confirmed launch/community and Explore listing. Refresh to check recovery and session state.
11. Close the temporary broadcast gate and stop the tunnel/gateway/backend after the test. Record physical results separately from mock/emulation screenshots.

The normal development and Railway staging environments remain demo/preparation-only. No Mainnet configuration, public API key exposure, migrations or production custody changes are part of this procedure.
