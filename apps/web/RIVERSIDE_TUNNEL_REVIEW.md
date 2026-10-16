# Depot-side tunnel clearance

Status: **not constructed — immediate parcel and grade conflict**. Existing Riverside railway, depot, bridge, terrain and train service remain unchanged.

The left endpoint in the default isometric view is the depot-side terminus `(64,18)`, with rail level Y3 and tangent toward increasing Z. The eastern outskirts terminus is a different end; moving the requested tunnel there without agreement would not satisfy the requested left-side placement.

The existing structural fixture contains these obstacles beyond the depot:

| Parcel | ID | Bounds relevant to the extension |
| --- | --- | --- |
| Power Station 1 | `bld_0p3nc76` | X64–69, Z20–24 |
| Depot I | `bld_1wixh6t` | X58–62, Z20–24 |
| Depot C | `bld_1fl12j2` | X62–67, Z25–29 |
| Depot J | `bld_081p8s9` | X61–66, Z29–32 |

With the existing 0.95-unit clearance envelope, a straight extension contacts the power station parcel after **1.05 units**. At a 4.5% maximum grade, that permits only **0.047 units of descent**. To lower the rail from Y3 far enough to place a 1.25-unit train envelope beneath ground Y0.24, with only 0.3 units of cover, requires a drop of 4.31 units: **at least 95.78 units of ramp**, before allowing vertical easing or a fully concealed stopping length. This is a lower bound, not a proposed engineering specification.

A four-unit-radius turn begun at the endpoint can shift left only about **0.140 units** by the first envelope contact, but needs **0.95 units** to miss the power station. Depot I constrains the opposite side of the narrow gap. A small extension or portal cannot solve this while preserving the validated corridor. This check does not prove every possible rerouted or future migrated alignment impossible.

Adding a portal above the current elevated endpoint would be a covered viaduct, not a railway descending under the terrain. Covering it with a tall artificial mound, intersecting occupied parcels, or hiding cars outside a genuine opening would violate the request. None was implemented.

## Compatible next steps

1. **Eastern outskirts tunnel study:** investigate a long descending extension beyond X146, outside the developed city, with terrain cutting, dry-land checks, revalidation against the current chunk catalog and a long enough covered reversing section. This preserves the depot-side city corridor but puts the tunnel at the opposite endpoint. It is not yet surveyed or approved as clear.
2. **Depot-side reserved corridor:** coordinate with Claude on a future layout reservation/migration, including specific affected parcels, or approve a broader railway reroute that starts descending much earlier. The current constraint to preserve both the validated corridor and existing buildings prevents treating either as an implicit change.

## Reproduction and checks

Run `node scripts/audit-riverside-tunnel.mjs` from `apps/web`. `reviews/riverside-tunnel-feasibility.json` records the output. The source is the committed structural snapshot, **not a newly fetched backend state**; the local backend was unreachable during this audit. Any future construction must repeat the checks against current persisted geometry and full generated scene geometry.

The existing continuous-segment clearance checker identifies the power station and subsequent warehouse parcels without modifying inputs. New unit tests verify the conflict, grade bound and immediate turning constraint. The eight existing Riverside service/clearance tests also pass: 13 focused tests in total. No renderer imports or runtime files changed for this review, and no tunnel screenshots or browser-cycle validation are claimed for an unbuilt tunnel.

No backend-owned files, persisted parcels, roads, agents, waterways, railway geometry or simulation behavior changed. No commits, branch changes or pushes were made.
