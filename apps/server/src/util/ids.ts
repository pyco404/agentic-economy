import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Random, URL-safe, prefixed identifier (e.g. `lch_8f3K2pQ9xY1z`). Not used inside the deterministic simulation. */
export function newId(prefix: string, length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}
