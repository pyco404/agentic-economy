import { z } from "zod";

export const LOGO_LIMITS = { maxBytes: 5_000_000, maxPixels: 32_000_000,
  mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const };
const cid = z.string().regex(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/);
export const IpfsReference = z.object({ cid, ipfsUri: z.string(), gatewayUrl: z.url().refine((url) => {
  const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password;
}) }).refine((ref) => ref.ipfsUri === `ipfs://${ref.cid}` && new URL(ref.gatewayUrl).pathname.endsWith(`/ipfs/${ref.cid}`), "Inconsistent IPFS reference");
export const LogoReference = IpfsReference.and(z.object({ uploadId: z.string().min(1), status: z.literal("verified") }));
export type LogoReference = z.infer<typeof LogoReference>;
export type IpfsReference = z.infer<typeof IpfsReference>;
export interface MetadataInput { name: string; symbol: string; description: string; quoteAsset: string; imageUploadId: string; }
/** Reusable upload port. The authenticated launch workspace binds it to the shared Launchpad API. */
export interface LaunchMediaAdapter {
  available: boolean;
  unavailableReason?: string;
  uploadLogo(file: File, options: { requestId: string; signal: AbortSignal; onProgress: (percent: number) => void }): Promise<LogoReference>;
  prepareMetadata(input: MetadataInput, options: { requestId: string; signal: AbortSignal }): Promise<IpfsReference>;
}
export const unavailableLaunchMedia: LaunchMediaAdapter = {
  available: false,
  unavailableReason: "IPFS uploads and automatic metadata are awaiting the authenticated backend API. You can choose and preview a logo now.",
  uploadLogo: async () => { throw new Error("Authenticated logo upload is unavailable."); },
  prepareMetadata: async () => { throw new Error("Backend metadata preparation is unavailable."); },
};
export function sniffLogo(bytes: Uint8Array) {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
async function decodeLogo(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return dimensions;
  }
  const url = URL.createObjectURL(file);
  try { return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Image cannot be decoded")); image.src = url;
  }); } finally { URL.revokeObjectURL(url); }
}
export async function validateLogo(file: File, maxBytes = LOGO_LIMITS.maxBytes, decode = decodeLogo) {
  if (!file.size) throw new Error("Choose a non-empty image.");
  if (file.size > maxBytes) throw new Error(`Choose an image smaller than ${maxBytes / 1_000_000} MB.`);
  const detected = sniffLogo(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!detected || (file.type && file.type !== detected)) throw new Error("Choose a genuine PNG, JPEG or WebP image. File type does not match its content.");
  let size: { width: number; height: number };
  try { size = await decode(file); } catch { throw new Error("This image is invalid or corrupted. Choose another file."); }
  if (!size.width || !size.height || size.width * size.height > LOGO_LIMITS.maxPixels) throw new Error("Image dimensions are too large. Use an image below 32 megapixels.");
  return detected;
}
export function readLogoReference(raw: string): LogoReference | null {
  try { return LogoReference.parse(JSON.parse(raw)); } catch { return null; }
}
export const metadataKey = (input: MetadataInput) => JSON.stringify(input);
/** UI cancellation must settle even if a provider fails to honor AbortSignal. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}
