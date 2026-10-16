# Frontend individual-file checkpoint

## Authorization and scope

The user explicitly requested **commit and push** after reviewing the individual-file plan. All commits use Conventional Commits and contain exactly one explicit file. No history rewrite, branch switch, reset, clean, stash, force-push or main-branch push is part of this checkpoint. The configured repository author identity is retained.

## Git and preservation

- Original starting branch and HEAD: `codex/frontend` at `80166de`. The published 149-commit checkpoint was subsequently fetched and independently verified at `13a9d8a470ffb61649243ea8af1cf607ebe24735`, identical to local HEAD before follow-up test/tooling/documentation commits.
- 154 source/tooling/documentation commits precede this final one-file documentation commit. Verify every hash with `git diff-tree --no-commit-id --name-only -r <hash>`.
- Every implementation file was individually reviewed, explicitly staged, checked against its reviewed bytes, and verified as the sole changed path in its commit. No directory-wide staging was used.
- The root `.gitignore` change only ignores `/note.txt`. The note itself is untouched. Frontend ignore rules exclude screenshots/artifacts, generated railway survey output, dependencies, build output and Playwright output.
- `contracts/integration-notes.md` retains its pre-existing ten-line append, byte-for-byte, outside these commits. No backend-owned source, shared schema, root package manifest, pnpm lockfile, program or authoritative economic data was modified.
- A non-destructive source archive and SHA-256 preservation manifest are available locally at `/tmp/agentic-frontend-checkpoint-20261016T000917Z/`. Ignored runtime/environment files and review artifacts were left in place.

## Dependency handling

The strict one-file requirement leaves intermediate revisions with unresolved imports until dependent modules and the app shell arrive. These intermediate commits are not independently buildable; no such claim is made. The full implementation tree is validated. Roof topology and architectural generation remain distinct file commits. The coordinated pnpm migration is deferred.

## Previously held files

The 16 held files were inspected before inclusion. The full-world railway fixture, terrain cutting, railway planner, scene wiring, app shell, scripts and tests are preserved in separate file commits. Three stale browser-test assumptions were corrected:

- Railway overview zoom is viewport-aware and subject to OrbitControls limits; tests verify overview bounds rather than demanding a fixed 1.1 zoom at every aspect ratio.
- Returning to World on mobile uses the home link without first opening the modal and making that background link inert.
- Offline building inspection uses a stable building-list target, keeps the already-open explorer available and scopes community closing to the active dialog. Mobile immersive inspection expands the intentionally hidden activity panel before using its explorer controls.

## Railway scope and remaining product distinction

The connected forward service uses a new northern through-platform. Original depot scenery and authoritative buildings remain in place; the original platform is not the stop on this loop. This checkpoint does not claim the blocked through-running alignment at the old depot was constructed. No railway passengers, cargo transactions or financial activity are invented.

Current western portal: `(-40.75, -7)`; eastern portal: `(214.75, 1)`. Live-world visual review reports no detected clearance issues, maximum grade approximately 4.17% (below 4.5%), and minimum roof cover approximately 0.302 world units. Clearance covers available rendered/persisted geometry; the backend does not publish underground foundations or reservations.

The railway has a continuous path, per-carriage covered visibility, a dedicated elapsed-time clock and a 120-second fully hidden interval. Static tracks, bridge and portals remain visible while the train is underground. Native-resolution review captures show approach, progressive entry, hidden state, emergence and surface travel; captures remain ignored.

## Validation

- Production build, strict typecheck, lint and all **93 unit tests across 25 files** passed after the implementation commits. Existing dependency-annotation and large-bundle advisories remain nonblocking.
- The complete **52-test Chrome browser suite** ran against the locally running authoritative demo backend/PostgreSQL using software WebGL: 50 passed initially and two stale UI setups failed. After fixing explorer/mobile-panel setup, both failed cases passed the focused rerun. This is coverage across the full run plus reruns, not a clean initial 52-case result or native-GPU performance certification.
- Live browser coverage includes HTTP/WebSocket simulation, replay/reconnect, mock-chain launch/agent commands, roots/deep links, search/drafts, persistent world, desktop/tablet/mobile framing, menu focus, activity scrolling, roof/facade/color rendering, mouse/touch controls, water motion and railway loops.
- Unaccelerated underground witness: **120.70 elapsed wall seconds**, clock rate 1, configured hidden duration 120 seconds, followed by automatic emergence. Accelerated cycle tests also passed.
- JavaScript tooling scripts passed syntax checks. Installed direct frontend dependency versions match the npm lockfile. Credential-pattern checks found no private-key blocks, literal JWTs, GitHub/AWS keys, credential-bearing HTTP URLs or literal secret assignments in the reviewed source set; public localhost settings are the only values in `.env.example`.

## Follow-up railway and staging report

The complete unaccelerated approach/entry/hidden/emergence/surface capture measured 120.294 seconds fully underground, with no time updates after the initial surface setup. See `UNDERGROUND_RAIL_COMPLETION.md`. `STAGING_PROPOSAL.md` records successful read-only HTTPS/WSS checks for the user-supplied staging backend, plus pending frontend-origin and Claude CORS/auth confirmation. No deployment files, Railway settings or backend configuration were changed.

## Excluded material

PNG screenshots; generated `reviews/` JSON/SVG; local benchmark diagnostics; `artifacts/`; `node_modules/`; build output; coverage; Playwright reports/results; temporary browser data; local environment/credential files; and backend-owned integration notes are excluded. Curated structural JSON fixtures used by tests are included. Survey/capture/benchmark scripts are source; their generated outputs are not committed.

## Implementation commit ledger

Ordered actual commits are listed below. The final commit introducing this document has its hash in Git history and the ignored local `artifacts/frontend-commit-report.md` execution report, avoiding a self-referential commit hash in this document.

| # | Commit | Conventional Commit | Explicit path |
|---|---|---|---|
| 1 | `795dcaeccd297b056175e1ecc46424345d20813b` | `chore(git): ignore local note.txt` | `.gitignore` |
| 2 | `01e99a058902a1a8129e7b8bc222ecd74484cb3a` | `chore(web): exclude dependencies builds and local review artifacts` | `apps/web/.gitignore` |
| 3 | `5d49c2742875b9e3770c1d8aac33ba0f499c074a` | `docs(web): show public HTTP and WebSocket configuration` | `apps/web/.env.example` |
| 4 | `4c59795b9ccbc18d3f14951a202aa381938136c6` | `build(web): declare React Three.js and frontend validation scripts` | `apps/web/package.json` |
| 5 | `cf5edbaf7c7b1151cd7ee50b18ce22a43fac1a4e` | `build(web): lock npm frontend dependencies` | `apps/web/package-lock.json` |
| 6 | `c383cdaf5af0da81898a761506afbfb904edf884` | `build(web): enable strict TypeScript and JSON imports` | `apps/web/tsconfig.json` |
| 7 | `9e9946cc8cb7ddc044ef827e72adf70457bc17f3` | `build(web): configure TypeScript and React Hooks linting` | `apps/web/eslint.config.js` |
| 8 | `2b3d22b3f889cfb3b44c158a3b6b58aefabac591` | `build(web): configure React Vite and Vitest` | `apps/web/vite.config.ts` |
| 9 | `bb7ad17b8e48524965ed88e87cb7e0bcb379b9f1` | `refactor(api): re-export canonical shared contracts` | `apps/web/src/api/shared.ts` |
| 10 | `039622b6b4757aa7772f1678e3781b7470fb29e1` | `feat(world): define curated city and roof colors` | `apps/web/src/world/palette.ts` |
| 11 | `de9b7e11c4ab91129e9f0943394eba558f4d05c0` | `feat(world): generate seeded districts and building parcels` | `apps/web/src/world/layout.ts` |
| 12 | `ae9c021b4e3d6a41ae7f1dbccd0965dcce281a62` | `fix(world): generate closed outward-wound roof solids` | `apps/web/src/world/roofGeometry.ts` |
| 13 | `1e21f16d58aabf476aa33cb817f3d622a904de82` | `feat(world): derive seeded facade and massing profiles` | `apps/web/src/world/architecture.ts` |
| 14 | `f6e5c2ee3d63b30840c8872e8e3e0d76348f81f3` | `feat(world): apply district-aware visual building setbacks` | `apps/web/src/world/planning.ts` |
| 15 | `b97c604d0c2def31ff561883c6dcd57f85d0a956` | `feat(world): assign curated wall colors by building family` | `apps/web/src/world/buildingPalette.ts` |
| 16 | `02266be1ed1b5c764b202c5100787f85c772d4ca` | `feat(world): generate stylized glazing frames and sills` | `apps/web/src/world/windows.ts` |
| 17 | `dd0ee05e7cecfe437688d747c1ffd80a3529cb04` | `feat(world): plan district-specific trees with access clearance` | `apps/web/src/world/vegetation.ts` |
| 18 | `168f8b0e9253b35319a2bd9c0888cd810b1ecfc7` | `feat(world): generate six low-poly vegetation silhouettes` | `apps/web/src/world/vegetationGeometry.ts` |
| 19 | `908ca406024a9118b5c4158425805fd516b0ca78` | `feat(world): shade facade contact details in the opaque material pass` | `apps/web/src/world/facadeShading.ts` |
| 20 | `9db8b21fc9a22cb7c3edceeaef70664cea0f5cf8` | `feat(world): animate directional water with shared shader uniforms` | `apps/web/src/world/waterFlow.ts` |
| 21 | `15d9af25334c5cbf34d5bb3e851816d02f78aa45` | `feat(world): generate economic architecture and instanced scenery` | `apps/web/src/world/geometry.ts` |
| 22 | `d200ae21856e99ba4fb687cba4bbcdf5e3f561b1` | `feat(world): generate deterministic outskirts and expansion hints` | `apps/web/src/world/frontier.ts` |
| 23 | `4f946068665fabf92251092b7279489ebc76e3da` | `feat(world): check continuous railway footprint clearance` | `apps/web/src/world/railClearance.ts` |
| 24 | `88978571d569a5b91ecdf58cc45acb87b4461e4c` | `feat(world): sample persisted and frontier terrain elevations` | `apps/web/src/world/railTerrain.ts` |
| 25 | `19083730e83325cccd9edf5845b7ab633af2f9ee` | `feat(agents): interpolate movement along canonical street paths` | `apps/web/src/world/agentMotion.ts` |
| 26 | `e77e77229e2357b07635d693598031c7995565cb` | `feat(world): plan two-way streets sidewalks and vehicle lanes` | `apps/web/src/world/streets.ts` |
| 27 | `89d4cfc0cd76147d26b53f5684823d0b71ef533f` | `feat(agents): render instanced humanoids with walking and carrying poses` | `apps/web/src/world/citizens.ts` |
| 28 | `8afb99efeddcb2e2c2c81c0c5570ca465e500dc5` | `feat(world): frame Civic Core with viewport-aware camera defaults` | `apps/web/src/world/framing.ts` |
| 29 | `9e66c64d7a076232c1d1e7dfc231304d3e9925be` | `feat(agents): distinguish stable house aliases from verified activations` | `apps/web/src/api/agentIdentity.ts` |
| 30 | `e262884b6dd3f3533f9406fd8ae48370f982ea25` | `feat(agents): project single-line labels with zoom-aware collision packing` | `apps/web/src/world/agentLabels.ts` |
| 31 | `c858720dd19d3f1e14514f35abc8c264b6938061` | `feat(api): load canonical dashboard data with explicit offline fixtures` | `apps/web/src/api/adapter.ts` |
| 32 | `18a9c4e00f6fd2755c5e42de9d381f289800c941` | `feat(api): reconcile streamed world state and reject stale updates` | `apps/web/src/api/state.ts` |
| 33 | `66ebb940aba5a665c7bed100f4008c1a238726fe` | `feat(api): reconnect WebSockets with durable event replay` | `apps/web/src/api/realtime.ts` |
| 34 | `eed0cb39317b5634d461afdb30434db107373fc9` | `feat(api): subscribe to live world state and recover missing chunks` | `apps/web/src/api/useWorld.ts` |
| 35 | `bc4c477e06df518f7ffa29a7f51dd1c65d30e086` | `feat(explore): verify listings against confirmed platform launches` | `apps/web/src/api/tokens.ts` |
| 36 | `4bbc300db5962970c0cd7611040a347826b005cf` | `feat(web): canonicalize World at root and resolve secondary routes` | `apps/web/src/navigation/routes.ts` |
| 37 | `6adc0e74dc3c9de977b44c8c3586a87669e82f4b` | `feat(web): retain form drafts across page navigation` | `apps/web/src/navigation/drafts.ts` |
| 38 | `7cd8d478110b6383a2f8694fdfdca9486ea82aee` | `feat(about): define product status and canonical fee disclosures` | `apps/web/src/content/about.ts` |
| 39 | `da295ca9b00d8ed11f78d700f85c3457edb2797a` | `feat(web): provide a shared accessible page-close control` | `apps/web/src/components/OverlayClose.tsx` |
| 40 | `430ebef890ca252a1127ad09ed23ae70a532f7f4` | `feat(communities): project procedural architecture into cached card artwork` | `apps/web/src/components/CommunityArt.tsx` |
| 41 | `987e4222b9c27863daae277364b4f273ef3b53f5` | `feat(communities): add discovery filters and live community inspection` | `apps/web/src/components/Communities.tsx` |
| 42 | `cb710d60dda93c708af7fc685005a4d7f7ee57a8` | `feat(explore): add verified token discovery and detail views` | `apps/web/src/components/Explore.tsx` |
| 43 | `6327fa305d62a5a65900d9902987b47b5cc7a151` | `feat(web): add Launchpad Studio Economy and Treasury interfaces` | `apps/web/src/components/Pages.tsx` |
| 44 | `445742e63835b216f96e699589a8cd55113e1f06` | `feat(about): present the living economy and implementation status` | `apps/web/src/components/About.tsx` |
| 45 | `006f47aecf7a1dd64b685809bf62e6b29c7653d1` | `feat(web): add a floating mobile menu with focus containment` | `apps/web/src/components/MobileNavigation.tsx` |
| 46 | `de3b503f36e4037398b4976662238b42e0ca65b1` | `style(web): establish warm ivory typography and application surfaces` | `apps/web/src/styles.css` |
| 47 | `607967a9eed25855732aa61e29b46b4b315c8f8e` | `style(discovery): refine responsive community and token cards` | `apps/web/src/discovery.css` |
| 48 | `962292adfc4f2bda69902c306decc612b96397ac` | `style(world): refine floating HUD labels and activity scrolling` | `apps/web/src/world.css` |
| 49 | `cc71d6516e4593b6c14fbc1ec8817008a2e7235d` | `style(web): layer closable page surfaces above the persistent world` | `apps/web/src/global-world.css` |
| 50 | `08ec8bd8c34e814e78ca6bf62d0908ea16a3b040` | `style(about): add editorial sections and responsive world windows` | `apps/web/src/about.css` |
| 51 | `d9952e2387644b5796d016bee0c8b27a3be0f427` | `style(web): present a safe-area-aware floating mobile menu` | `apps/web/src/mobile-navigation.css` |
| 52 | `958fa3a41bd32cb68ae023b551901d6a15469d08` | `feat(web): mount the React application in strict mode` | `apps/web/src/main.tsx` |
| 53 | `3c3fffe0bdf04e4ba78ea523dfc14cbd74023460` | `build(web): define the application document and Vite entry point` | `apps/web/index.html` |
| 54 | `493af127b48aa2c979b6339d082e306103078e12` | `test(world): preserve a structural Riverside clearance fixture` | `apps/web/src/world/fixtures/riverside-rail-world.json` |
| 55 | `07cb16b4deb20a277578cbe574fc4e21e503f483` | `test(world): verify roof winding watertightness and ray hits` | `apps/web/src/world/roofSolids.test.ts` |
| 56 | `5c09f7948b65d3cca57b15022d075100f6ce57b8` | `test(world): verify roof placement parapets and awning clearance` | `apps/web/src/world/roofGeometry.test.ts` |
| 57 | `2ac2882da1f80b7df575134d259bd3fb98708e96` | `test(world): verify readable seeded architecture and window rhythms` | `apps/web/src/world/architecture.test.ts` |
| 58 | `e20e0c7a7a8296174e2300f67943fbfaaf1e7192` | `test(world): verify deterministic layout expansion and geometry batching` | `apps/web/src/world/layout.test.ts` |
| 59 | `2d472a1924d7f781d03d315e5bdc2897448d6ed0` | `test(world): verify setbacks street spacing and starter open space` | `apps/web/src/world/planning.test.ts` |
| 60 | `74caaf42ea6886fac0b583fdd2b11c37752525f3` | `test(world): verify seeded building color families` | `apps/web/src/world/buildingPalette.test.ts` |
| 61 | `db0a89435921863b1dad006b3b4f58b5974015be` | `test(world): verify glazing recesses and building-specific window styles` | `apps/web/src/world/windows.test.ts` |
| 62 | `c4f0f57f786087411f76c9e1e3d2c3bdee745b41` | `test(world): verify tree silhouettes density and entrance clearance` | `apps/web/src/world/vegetation.test.ts` |
| 63 | `6d29485f89ed00725a2fef7419fd9957c0dcb489` | `test(world): verify deterministic outskirts and expansion handover` | `apps/web/src/world/frontier.test.ts` |
| 64 | `6b3760512d2c7e80591ede787ce759592833893f` | `test(world): verify swept route clearance and power-station conflicts` | `apps/web/src/world/railClearance.test.ts` |
| 65 | `7f2512caa42951a129397ee194cfb07ec8109c97` | `test(agents): verify road-following interpolation and fixture walkers` | `apps/web/src/world/agentMotion.test.ts` |
| 66 | `968989b35f0f6d1ab60bb0a3e70f735b16d5f5a4` | `test(world): verify two-way lanes safe paving and car separation` | `apps/web/src/world/streets.test.ts` |
| 67 | `06f93447c03e13c213ad3b489a481165ea444483` | `test(agents): verify instanced body parts travel orientation and idle poses` | `apps/web/src/world/citizens.test.ts` |
| 68 | `7b4201cb379090b021bd9de96aec4bb0582437ba` | `test(world): verify civic framing portrait layouts and inspector targets` | `apps/web/src/world/framing.test.ts` |
| 69 | `34472da839c22a231a26356f3e57bb8af0fee9f8` | `test(agents): verify single-name label priority and density limits` | `apps/web/src/world/agentLabels.test.ts` |
| 70 | `ace0d48739f9e726efb91abcb1ecf76ab7936848` | `test(world): verify ambient paths and rejection of the old rail loop` | `apps/web/src/world/ambient.test.ts` |
| 71 | `f097be48cc8341ca7314616aeeac3aa463047c8d` | `test(world): verify screen-right water flow and opaque depth writing` | `apps/web/src/world/waterFlow.test.ts` |
| 72 | `3fe4a54f7a1559a2d5276a3215eb8d48094bddc7` | `test(agents): verify stable house aliases and verified wallet naming` | `apps/web/src/api/agentIdentity.test.ts` |
| 73 | `da6e6f4c99f4218749323e1b371f3fc6c03f0731` | `test(api): verify canonical world mapping and explicit source selection` | `apps/web/src/api/adapter.test.ts` |
| 74 | `09b054a1bf828c9479f0df30ceab4fb01e9225a2` | `test(api): verify stream reconciliation replay and stale-state handling` | `apps/web/src/api/state.test.ts` |
| 75 | `e72215db8c6d96d8b415c2b8023e3448fb9b8971` | `test(api): verify reconnect replay and sequence recovery` | `apps/web/src/api/realtime.test.ts` |
| 76 | `2c0c8b07495311a83fe94c6b0ab06cd649a2a195` | `test(web): verify root World URLs and secondary deep links` | `apps/web/src/navigation/routes.test.ts` |
| 77 | `e387fc3a09f3d344a015707c6d8fcc47cce98d64` | `test(about): verify status disclosures fee constants and source labels` | `apps/web/src/content/about.test.ts` |
| 78 | `40df1f0e3d3f65d6ff9491aabdf6a3f1f4ba53bb` | `test(web): start the authoritative backend with demo-only settings` | `apps/web/scripts/serve-integration-backend.mjs` |
| 79 | `b769d168af6242a5f3b4b883779705ab5d998370` | `test(web): configure Chrome and local integration services` | `apps/web/playwright.config.ts` |
| 80 | `ed731bbfcf5e97630d51e74b0024363776a1764a` | `test(web): cover PostgreSQL simulation mock-chain commands and replay` | `apps/web/tests/backend.spec.ts` |
| 81 | `88977f9511146dc1613915d0848e4c643cf1afc8` | `test(web): inspect rendered roof slopes and reject underside artifacts` | `apps/web/tests/roofs.spec.ts` |
| 82 | `16e591653fe815365e78202dce8910cbeb3dce47` | `test(web): measure facade readability at gameplay zoom` | `apps/web/tests/facades.spec.ts` |
| 83 | `0713a0aabec3caba1700ddea274c48e43daffccc` | `test(web): verify rendered instance colors and material batching` | `apps/web/tests/instance-colors.spec.ts` |
| 84 | `cabef81331d7c309e3b921aaedb2d835d99a98b5` | `test(web): verify live landscaping preserves canonical building parcels` | `apps/web/tests/planning.spec.ts` |
| 85 | `a2d2b4ef1c2fc054e56eda7b0510e8ad5c516a0f` | `test(web): verify directional water motion and reduced-motion behavior` | `apps/web/tests/water.spec.ts` |
| 86 | `0e1eb7c4c24ee8232765bc7058757fbd701b216e` | `test(web): verify citizen labels and decorative ambient controls` | `apps/web/tests/city-life.spec.ts` |
| 87 | `15a86a0fa4e74fadee28c842f8f3b0ac25020365` | `test(web): verify stable legacy agent identities in the interface` | `apps/web/tests/agent-identity.spec.ts` |
| 88 | `3507a2a79716695a820ca5b81b212a9e0b9b50ae` | `test(web): verify mouse touch and reset retain isometric camera limits` | `apps/web/tests/isometric-controls.spec.ts` |
| 89 | `6384dd8f5a8a9cb5e8223663d8389a0fa9e386fa` | `test(web): verify civic camera defaults across refresh routes and viewports` | `apps/web/tests/camera-framing.spec.ts` |
| 90 | `da27f8113fb6af61eb47bdcef6f0efb4d99f91c7` | `test(web): cover full-screen city controls and building inspection` | `apps/web/tests/immersive.spec.ts` |
| 91 | `6c9b417568a2605785b089b26725e28f8fce200a` | `test(web): verify financial panel contrast and reduced motion` | `apps/web/tests/global-readability.spec.ts` |
| 92 | `9d263f1211583c0d71975e0799a734c7cac6e1d0` | `test(web): verify root aliases page reopening and retained drafts` | `apps/web/tests/closable-pages.spec.ts` |
| 93 | `839a79d5bc64e0d06a6137ff1415ffed8c079f69` | `test(web): verify functional pages remain usable without WebGL` | `apps/web/tests/world-fallback.spec.ts` |
| 94 | `579b6b764e0d1a7626bc7685f13055b9a38d3084` | `test(web): verify About deep links and persistent-world behavior` | `apps/web/tests/about.spec.ts` |
| 95 | `1530946a50e90acc953101116f512547e5de3b88` | `test(web): verify one activity scroller mobile expansion and page docking` | `apps/web/tests/activity-scroll.spec.ts` |
| 96 | `390617ac977ac32d5ffed521ddce2e0caf29bfc9` | `test(web): verify floating menu focus touch targets and route continuity` | `apps/web/tests/mobile-navigation.spec.ts` |
| 97 | `01523426b8a5ade5fa8bc333995a9eb57886a563` | `test(world): audit candidate rail corridors against parcel footprints` | `apps/web/scripts/audit-railway-corridors.mjs` |
| 98 | `114750fc9763742258c627c940f2c4fb8f200a52` | `test(world): audit the blocked depot-side tunnel approach` | `apps/web/scripts/audit-riverside-tunnel.mjs` |
| 99 | `9f4d042f640bb4add3e39436ca10ca83ed020c3b` | `test(world): survey eastern tunnel grades terrain and clearance` | `apps/web/scripts/study-eastern-tunnel.mts` |
| 100 | `048b80a58f80677375d4afc5a2be972df2fcaf4f` | `test(web): compare western railway alignments without changing the world` | `apps/web/scripts/study-western-reroutes.mts` |
| 101 | `8b8c6436a8c7439f3155d3abe54467d838d245e0` | `test(web): compare frontend world identity across an owned backend restart` | `apps/web/scripts/check-persistence.mjs` |
| 102 | `91c6506b53f5c49d832fce048fe77d8aac267f36` | `test(world): compare alternating renderer clarity measurements` | `apps/web/scripts/benchmark-clarity.mjs` |
| 103 | `aaf8370cb217cf7592e01406f800ab0b98978044` | `test(world): capture identical-camera clarity review views` | `apps/web/scripts/capture-clarity.mjs` |
| 104 | `d45924e881831f479034e2bc5ec1403cf3bf4259` | `test(world): capture seeded palette comparisons and geometry digests` | `apps/web/scripts/capture-building-palette.mjs` |
| 105 | `ba48c9ccf9be69d2a49264b596571bdb6514c545` | `test(world): capture roof geometry from multiple zooms and azimuths` | `apps/web/scripts/inspect-roofs.mjs` |
| 106 | `a05c79f678c553d9f6d4219f38027d84ea231524` | `test(web): capture responsive Communities and Explore layouts` | `apps/web/scripts/capture-discovery.mjs` |
| 107 | `9421202914c0b198fd25a7ea03829427c3ceec32` | `test(world): capture water surface comparisons at three zoom levels` | `apps/web/scripts/capture-water-flow.mjs` |
| 108 | `12930d2846a59dda8d4f25cd4429d841d30f68fd` | `test(world): capture Riverside track depot and bridge review views` | `apps/web/scripts/capture-riverside-rail.mjs` |
| 109 | `e78b06a2667e0f18ad2162ad3f1ec7f09e909691` | `test(world): capture default reset immersive and responsive camera views` | `apps/web/scripts/capture-camera-framing.mjs` |
| 110 | `36dc9cf489836198d031314f93e6d5f3c16bb61b` | `test(web): capture responsive About sections over the live world` | `apps/web/scripts/capture-about.mjs` |
| 111 | `d7882def3be0a5189223cf0ff1c7d25ad1313926` | `test(web): capture activity scrolling and fixed page reopening controls` | `apps/web/scripts/capture-activity-scroll.mjs` |
| 112 | `0b57dc13b8f22bd15216d61f1fcc490b81fffe85` | `test(web): capture floating navigation on phone tablet and desktop` | `apps/web/scripts/capture-mobile-navigation.mjs` |
| 113 | `1ec5e05f63fc802d4c7278b6725b6369c9973de0` | `docs(web): document local setup integration and frontend validation` | `apps/web/README.md` |
| 114 | `9ef441017931a39f5ceef0e86940b16534c2288e` | `docs(web): record live integration capabilities and backend gaps` | `apps/web/FRONTEND_HANDOFF.md` |
| 115 | `5916800a8b7f4eb3c1be7414edbbce341fc8c3a1` | `docs(web): record architecture palette vegetation and spacing reviews` | `apps/web/URBAN_VISUAL_REVIEW.md` |
| 116 | `48312453280678c1b4f65a3d6213368866f49f91` | `docs(web): document two-way streets and vehicle clearance constraints` | `apps/web/STREET_NETWORK_REVIEW.md` |
| 117 | `93d4bbd6e8a270171a8dc2471779c4c03a372905` | `docs(web): document directional water animation and validation` | `apps/web/WATER_FLOW_REVIEW.md` |
| 118 | `f27da263ccb3969c9ab53f6de63b9593d6b9c31d` | `docs(web): record citizen labels ambient actors and palette controls` | `apps/web/LIVING_WORLD_REVIEW.md` |
| 119 | `a15983e5ce98ea49a40f1e115780d8232626b332` | `docs(web): record immersive World presentation and review captures` | `apps/web/IMMERSIVE_WORLD_REVIEW.md` |
| 120 | `765342b3de3839ea67f19fca6cc86e628c84d8b3` | `docs(web): document the persistent world and floating page layers` | `apps/web/GLOBAL_WORLD_REVIEW.md` |
| 121 | `adb8d0ae4626ca30c9d04c6c0a93c20d6302d2ba` | `docs(web): record closable-page behavior and superseded navigation history` | `apps/web/CLOSABLE_PAGES_REVIEW.md` |
| 122 | `6431b1768cd9b9ed0e947febd95f27085d219981` | `docs(web): document root-only World navigation and page reopening` | `apps/web/ROOT_WORLD_NAVIGATION_REVIEW.md` |
| 123 | `2ca8321a53956e9dd3ba902ae03af55dea5c3c75` | `docs(web): record profile-mode removal and single-line world labels` | `apps/web/ISOMETRIC_CONTROLS_REVIEW.md` |
| 124 | `aae4c42bf8b4eabfe95c7e140ffa01a5d5cfb7a3` | `docs(web): document authoritative activation and identity contract gaps` | `apps/web/AGENT_IDENTITY_BACKEND_HANDOFF.md` |
| 125 | `a28c1b513c896f926138c3bcc0cf97ba5ea15f91` | `docs(web): document civic camera tuning and preservation checks` | `apps/web/CAMERA_FRAMING.md` |
| 126 | `3fce16d93b33f2fcb0d90c4d9a35c76dcaa325a6` | `docs(web): document About content status disclosures and validation` | `apps/web/ABOUT_HANDOFF.md` |
| 127 | `2183e1581079d3583ab0349b7e10c3b9a7313633` | `docs(web): document activity scrolling mobile controls and fixed page docking` | `apps/web/ACTIVITY_SCROLLING.md` |
| 128 | `96f7eeb68e09d06eb88a1c114f4537c3cd3bb7ce` | `docs(web): document the Oxude-inspired floating mobile navigation` | `apps/web/MOBILE_NAVIGATION.md` |
| 129 | `069963a62e90fe81933893a04163a8007d2c6adf` | `docs(web): record the initial urban railway corridor survey` | `apps/web/URBAN_RAIL_CLEARANCE_REVIEW.md` |
| 130 | `f68c7336be6cf09cc3c5e81f9e37402f1dd63fb2` | `docs(web): record the surface Riverside railway implementation` | `apps/web/RIVERSIDE_RAIL_IMPLEMENTATION.md` |
| 131 | `5d785adc40f955deb1c971fe7f138e423e24408d` | `docs(web): record the blocked depot terminus and clearance checks` | `apps/web/RIVERSIDE_TUNNEL_REVIEW.md` |
| 132 | `a3ba2ca5c24d1a9e9e9ff05cb5dc5eb9b68ecb3d` | `docs(web): record eastern tunnel survey results and original blockers` | `apps/web/EASTERN_TUNNEL_STUDY.md` |
| 133 | `e4984ef2266635e5f0055c0a9675aa7ec841f528` | `docs(web): record forward-route conflicts and the northern platform alternative` | `apps/web/WESTERN_THROUGH_ROUTE_REVIEW.md` |
| 134 | `24988479c9230a3fc4815c57b133c81cd6bb0875` | `feat(world): cut railway approaches from terrain triangles` | `apps/web/src/world/railExcavation.ts` |
| 135 | `387cf3ef7e47c9ea2f7bcc561fa90d20a923aab2` | `feat(world): generate validated Riverside track bridge and depot geometry` | `apps/web/src/world/riversideRail.ts` |
| 136 | `13d5ffdc59e613aba4aaf65f14da66d1ae2801f0` | `feat(world): connect tunnel portals with a timed forward railway service` | `apps/web/src/world/undergroundRail.ts` |
| 137 | `67f76fbf6069772c385daee6029f2997725d1c70` | `feat(world): animate ambient transport and separate trains from static track visibility` | `apps/web/src/world/ambient.ts` |
| 138 | `79a7fbd7b9a1ca67bae19b34e4c973c0a388bad3` | `feat(world): render frontier terrain water and railway cuttings` | `apps/web/src/world/frontierScene.ts` |
| 139 | `9b6e23cca2db9f6219fdef5f9df0f28eeaf7436e` | `feat(world): render the persistent interactive city and railway service` | `apps/web/src/world/City.tsx` |
| 140 | `89143f0d6114a8c5d2f0a6cf8f905c7d8c61910e` | `feat(web): compose persistent world navigation and floating page interfaces` | `apps/web/src/App.tsx` |
| 141 | `31e6537a8e55aa52f20956155eaf957d90c9a582` | `test(world): preserve a full-world underground railway clearance fixture` | `apps/web/src/world/fixtures/underground-rail-world.json` |
| 142 | `681dfa8534166a875ef11b5f2eda19e301f35765` | `test(world): verify Riverside clearance track geometry and service motion` | `apps/web/src/world/riversideRail.test.ts` |
| 143 | `20aaac4d75220b56d69e230b7edf3d2a340028e4` | `test(world): verify tunnel clearance terrain cuts and 120-second service timing` | `apps/web/src/world/undergroundRail.test.ts` |
| 144 | `5f4b5d9db962e7137cc3adea2add51b46d8cd450` | `test(web): cover offline city navigation drafts and demo agent controls` | `apps/web/tests/frontend.spec.ts` |
| 145 | `503b847d294baf756392be3cc11a03625559cc10` | `test(web): verify a single world and socket survive route changes` | `apps/web/tests/global-world.spec.ts` |
| 146 | `2c1499c30be8253c3461a9dbb6a25d29c88220e2` | `test(web): verify visible Riverside rail and preserved parcels` | `apps/web/tests/riverside-rail.spec.ts` |
| 147 | `83ccccf1c50c401d281902fc36c38095810c4ffe` | `test(web): verify tunnel transitions and real two-minute underground travel` | `apps/web/tests/underground-rail.spec.ts` |
| 148 | `934ebdf72455a0737dfe8a928a705d5c87319602` | `test(world): capture tunnel portals carriage transitions and railway overview` | `apps/web/scripts/capture-underground-rail.mjs` |
| 149 | `13a9d8a470ffb61649243ea8af1cf607ebe24735` | `test(world): validate the complete underground route against live world geometry` | `apps/web/scripts/validate-underground-rail.mts` |
| 150 | `85613a39a1ab4e8e5ccc97494c34faa7810cc6b8` | `test(web): inspect buildings without toggling the open explorer` | `apps/web/tests/frontend.spec.ts` |
| 151 | `ca01bfacf7bc5aba522384c1244a5a0efb445f19` | `test(web): expand mobile activity before building inspection` | `apps/web/tests/immersive.spec.ts` |
| 152 | `4b3d6d9e2aff4a10ea400096001f18fac6ef933e` | `test(world): capture a continuous unaccelerated tunnel journey` | `apps/web/scripts/capture-underground-rail.mjs` |
| 153 | `cc718f227400d8f0eeb967b14f6467f6c7daff5c` | `docs(world): record verified underground railway service` | `apps/web/UNDERGROUND_RAIL_COMPLETION.md` |
| 154 | `11f6c5f6ac8d68e6cb0857b0d9bca15698cd5e39` | `docs(web): propose demo staging and backend origin handoff` | `apps/web/STAGING_PROPOSAL.md` |

## Publication checks

Before a normal `git push origin codex/frontend:codex/frontend`, re-fetch remote references, verify the remote remains an ancestor, check all commit file counts, check the index is empty, confirm committed frontend bytes match the tested working tree, and verify the only remaining tracked work is the preserved integration-note append. Never force-push, rewrite published history, or target `main`. Confirm remote HEAD after pushing.
