import { hashSeed, random, type BuildingVisual } from "./layout";

/** Decorative variation only; never changes the persisted parcel, floors or height. */
export function architectureProfile(b: BuildingVisual) {
  const rng = random(hashSeed(b.seed, 173, 41));
  const columns = b.width < 3 ? 2 : 2 + Math.floor(rng() * 3);
  const facade = ["plain", "lintels", "pilasters", "balconies"][
    Math.floor(rng() * 4)
  ]!;
  const stepped =
    b.kind === "house" &&
    b.floors >= 4 &&
    b.width >= 3 &&
    b.depth >= 3 &&
    rng() < 0.38;
  return {
    columns,
    facade,
    windowHeight: rng() > 0.5 ? 0.58 : 0.44,
    stepped,
    podiumFloors: stepped ? Math.max(1, Math.floor(b.floors * 0.55)) : b.floors,
    upperX: rng() > 0.5 ? 0.06 : -0.06,
    rooftop: rng() > 0.5,
  };
}
