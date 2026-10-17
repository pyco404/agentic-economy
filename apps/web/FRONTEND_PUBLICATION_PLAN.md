# Frontend publication checkpoint — 17 October 2026

The user authorized commit and push. Publish only to `codex/frontend` by normal fast-forward push. Preserve the preceding 22 local one-file commits and add the following inspected files as individual Conventional Commits.

No backend-owned files, screenshots, environment files, dependencies, build output, browser artifacts or Oxude files are included. `contracts/integration-notes.md` retains its existing unstaged append. A non-destructive backup is at `/tmp/frontend-publication-safety-20261017/`.

The upload component is a guarded frontend checkpoint, not working Pinata integration: real image/metadata uploads remain disabled pending Claude-owned authenticated contracts. No real IPFS result, launch, signing, payment or deployment configuration change is claimed. The camera preset is unchanged; exact reference-image matching remains pending the image.

Strict one-file ordering can leave intermediate commits temporarily unable to compile until dependent files arrive. Validation applies to the final series, not each intermediate revision.

| Explicit file under `apps/web/` | Conventional Commit |
|---|---|
| `src/world/mirroredRail.ts` | `feat(world): plan a collision-checked opposite railway` |
| `src/world/ambient.ts` | `feat(world): animate mirrored trains with staged actor visibility` |
| `src/world/reveal.ts` | `feat(world): coordinate one-shot staged city presentation` |
| `src/world/sceneryPlan.ts` | `refactor(world): prepare spatial scenery outside the renderer` |
| `src/world/scenery.worker.ts` | `perf(world): move scenic planning off the main thread` |
| `src/world/framing.ts` | `refactor(world): centralize the existing isometric camera preset` |
| `src/world/City.tsx` | `feat(world): integrate mirrored railways and progressive scene reveal` |
| `src/api/launchMedia.ts` | `feat(launchpad): define validated media references and guarded upload port` |
| `src/components/LaunchLogoUpload.tsx` | `feat(launchpad): add validated logo previews and cancellable upload states` |
| `src/styles.css` | `style(web): add logo previews and bounded panel scrolling` |
| `src/components/Pages.tsx` | `feat(web): integrate logo drafts and scrollable economy ledgers` |
| `src/world/mirroredRail.test.ts` | `test(world): verify mirrored clearance and independent train timing` |
| `src/world/reveal.test.ts` | `test(world): cover reveal ordering budgeting and stable transforms` |
| `src/world/sceneryPlan.test.ts` | `test(world): preserve instance buffers across worker preparation` |
| `src/api/launchMedia.test.ts` | `test(launchpad): cover media validation references and cancellation` |
| `tests/isometric-controls.spec.ts` | `test(world): start touch gestures on unobstructed canvas` |
| `tests/city-life.spec.ts` | `test(world): expect both decorative railway services` |
| `tests/riverside-rail.spec.ts` | `test(world): retain original route checks with the second train` |
| `tests/mirrored-rail.spec.ts` | `test(world): inspect opposite railways across responsive views` |
| `tests/world-reveal.spec.ts` | `test(world): verify staged reveal persistence and reconnect behavior` |
| `tests/economy-scroll.spec.ts` | `test(economy): verify bounded panels and independent scrolling` |
| `tests/receipt-scroll.spec.ts` | `test(treasury): verify ledger scrolling precision and live updates` |
| `tests/launch-logo.spec.ts` | `test(launchpad): verify logo previews and isolated upload lifecycle` |
| `MIRRORED_RAILWAY_REVIEW.md` | `docs(world): record opposite railway clearance and visual review` |
| `WORLD_REVEAL_REVIEW.md` | `docs(world): record staged reveal validation and reference limitations` |
| `LAUNCH_MEDIA_HANDOFF.md` | `docs(launchpad): specify authenticated IPFS integration handoff` |
| `FRONTEND_PUBLICATION_PLAN.md` | `docs(web): record individual-file checkpoint publication plan` |

Final validation results and all actual commit hashes/paths are recorded in the publication report after execution. No history rewrite, force push, branch switch or unrelated staging is authorized by this plan.
