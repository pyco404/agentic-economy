# Production frontend release verification — 22 October 2026

## Finding

The reported old interface was **not reproduced** on the live public site during this audit, before or after deployment. Production was pinned to frontend `3b369f602e14ecc36332c806b1c11ae9c59b05a4`, deployment `8afd89e8-a7e6-4f03-89a4-488e69db98a8`. That commit already contains the reviewed mobile navigation and public-diagnostic cleanup. GitHub main was `d5d3d7cb56db6e0baff4a5fa4605a1a9caa6522b`; there were no changes in `apps/web` or `packages/shared` between those commits. The latest frontend-path commit was regression test `83945fb`.

A clean production build of main produced JavaScript and CSS **byte-for-byte identical** to the assets initially served by useaeco.xyz. Production/staging JavaScript was also identical after normalizing only their intended API hostname. The official domain was already attached to the correct production frontend, not public-demo. No wrong-service routing, incorrect build source or stale server bundle was found. A particular visitor's old tab/cache state cannot be established remotely and is not claimed as the cause.

The earlier `Backend demo` footer was hard-coded development copy, not an authoritative environment report. Current production renders no such connection/tick label; the API is actually `MODE=production` with its independent database. Compile-time development guards remove these public diagnostics. A conditional demo-only financial disclosure remains in the code bundle; it is not displayed on production and must not be mistaken for a connection label.

The desktop City activity panel still exists in the approved source. Its presence alone is not evidence of an old release. This deployment does not redesign or remove that panel. Fresh mobile sessions retain the reviewed collapsible controls and visible wallet/hamburger.

## Executed release

One owner-requested frontend deployment pins the service to current tested main:

| Item | Verified value |
| --- | --- |
| Environment | production |
| Frontend service | agentic-economy-web |
| Service ID | b14eb48d-b9b6-4b25-990c-9229d378c2a2 |
| Commit | d5d3d7cb56db6e0baff4a5fa4605a1a9caa6522b |
| Deployment | aa08fe70-8248-4d9b-b5f9-f70b7d780b10 — SUCCESS |
| Source | pyco404/agentic-economy, main, repository-root context |
| Dockerfile | apps/web/Dockerfile |
| API | https://api.useaeco.xyz |
| WebSocket | wss://api.useaeco.xyz/api/v1/ws |
| Production API commit | 6758f91bd2e8a69c242584133f0e5932b862bf7e — unchanged |
| Database | aeco_production — unchanged |

No API deployment, variable mutation, DNS change, migration, treasury change or financial activation was requested. Automatic production promotion remains off. Both official frontend domains remain verified with valid certificates; www redirects to apex preserving path/query.

The staging frontend remains `3b369f6`; its existing backend deployment of main `d5d3d7c` completed successfully independently of this frontend release. Staging health and disabled launch capabilities pass. Public-demo remains at `a2e1847`, with no official custom-domain attachments. No staging or public-demo configuration was changed for this task.

## Actual public-site checks

A new browser context with no local asset overrides passed the responsive public regression after deployment: folded 344×882, unfolded 690×829, tablet 820×1180 and desktop 1440×1000. Wallet/menu/branding touch targets, drawer links, Escape/focus, secondary world-control disclosure, Back/Forward, retained canvas, no diagnostic labels and no horizontal overflow all passed.

A separate official-domain browser run verified all nine clean routes render without the reported diagnostics; valid direct paths return 200 and missing API/assets return non-HTML 404. Actual API requests target only api.useaeco.xyz; native WSS delivered 40 frames. No JavaScript page errors occurred. An automated disposable message signer verified the official-domain challenge, secure host-only HttpOnly/SameSite=Strict cookie and session restoration after refresh (200). No physical Phantom acceptance or blockchain transaction was repeated. Five screenshot viewports, including 390×844, show no horizontal overflow. This is viewport emulation, not a physical-device transaction test.

The fresh context had zero service-worker registrations and no Cache Storage entries. Entry HTML uses `Cache-Control: no-cache`; immutable cache headers apply only to content-hashed assets. Assets after deployment still match the clean main build:

- `/assets/index-C9cXK8IG.js`: SHA-256 `a78ab134b7076d90a40fcf219670dddeb777d56af898325a9336df20fb653ea6`.
- `/assets/index-CZDLadOS.css`: SHA-256 `6f0d8a2fe84016ae4578af7dd511f34431f6b1aa87476cbaa3ba8ed8b4c73797`.

Fourteen navigation/wallet unit tests, frontend typecheck/build and the public responsive browser test pass. Lint reports no errors and two pre-existing LaunchWorkspace effect-cleanup warnings. No frontend source change was necessary. Mainnet execution/payment/broadcast gates remain false, no payout signer was introduced and the restricted release sequence remains unchanged.

[Sanitized deployment, configuration, assets and browser evidence](evidence/production-frontend-current-main-2026-10-22.json). Screenshots remain local ignored artifacts under `apps/web/artifacts/production-current-main-20261022/`. This evidence-only report does not require another application deployment.
