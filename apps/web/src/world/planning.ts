export function visualEnvelope(b: {
  kind: string;
  width: number;
  depth: number;
  sourceKind?: string;
  districtTheme?: string;
}): { width: number; depth: number } {
  let inset =
    b.kind === "house"
      ? 0.76
      : b.kind === "headquarters"
        ? 0.82
        : b.kind === "farm"
          ? 0.96
          : 0.86;
  // Visual setbacks only: no parcel, building count, route or simulation edits.
  if (b.kind !== "farm" && b.districtTheme) {
    const apartment = b.sourceKind === "apartment";
    if (b.districtTheme === "residential" || b.districtTheme === "waterfront")
      inset = b.kind === "house" ? (apartment ? 0.7 : 0.66) : 0.74;
    else if (b.districtTheme === "agricultural")
      inset = b.kind === "house" ? 0.64 : 0.74;
    else if (b.districtTheme === "industrial") inset = 0.76;
    else if (b.districtTheme === "market") inset = b.kind === "house" ? 0.74 : 0.8;
    else if (b.districtTheme === "civic") inset = b.kind === "house" ? 0.76 : 0.8;
  }
  return { width: b.width * inset, depth: b.depth * inset };
}
